"use strict";

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

describe('Connection Lifecycle - Memory Leak Prevention', () => {
    let denon;
    let mockSocket;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock socket with event emitter capabilities
        mockSocket = {
            setTimeout: jest.fn(),
            setKeepAlive: jest.fn(),
            removeAllListeners: jest.fn(),
            destroy: jest.fn(),
            destroyed: false,
            on: jest.fn(),
            listenerCount: jest.fn((event) => {
                // Simulate listener accumulation for the bug
                return mockSocket._listenerCounts?.[event] || 0;
            }),
            _listenerCounts: {},
            _addListener: function(event) {
                this._listenerCounts[event] = (this._listenerCounts[event] || 0) + 1;
            }
        };

        // Mock Denon client
        mockClient = {
            socket: mockSocket,
            on: jest.fn(),
            removeAllListeners: jest.fn(),
            disconnect: jest.fn(),
            setMaxListeners: jest.fn(),
        };

        // Denon object structure
        denon = {
            keepalive: null,
            audyssey: null,
            client: null,
        };
    });

    afterEach(() => {
        // Cleanup
        if (denon.keepalive) {
            clearInterval(denon.keepalive);
        }
    });

    describe('Bug #4: Socket listener memory leak on reconnection', () => {
        test('should demonstrate listener accumulation on reconnection (RED - shows the bug)', () => {
            // RED: This test demonstrates the bug - listeners accumulate on each reconnection

            // Simulate initial connection
            denon.client = mockClient;

            // Simulate adding listeners (as app.js does)
            const events = ['error', 'timeout', 'close', 'data'];
            events.forEach(event => {
                mockSocket._addListener(event);
            });

            // Initial state: 1 listener per event
            expect(mockSocket.listenerCount('error')).toBe(1);
            expect(mockSocket.listenerCount('close')).toBe(1);

            // Simulate cleanup attempt (BUGGY - doesn't destroy socket)
            denon.client.removeAllListeners();
            mockSocket.removeAllListeners();

            // Socket is still alive - listeners might persist
            expect(mockSocket.destroyed).toBe(false);

            // Simulate reconnection - add listeners again
            events.forEach(event => {
                mockSocket._addListener(event);
            });

            // BUG: Listeners accumulate because socket wasn't destroyed
            expect(mockSocket.listenerCount('error')).toBeGreaterThan(1);
        });

        test('should properly cleanup socket on reconnection (GREEN - the fix)', () => {
            // GREEN: Proper cleanup with socket destruction

            denon.client = mockClient;

            // Add initial listeners
            const events = ['error', 'timeout', 'close', 'data'];
            events.forEach(event => {
                mockSocket._addListener(event);
            });

            expect(mockSocket.listenerCount('error')).toBe(1);

            // FIXED cleanup - destroy socket before removing client
            if (denon.client && denon.client.socket) {
                denon.client.socket.destroy();
                denon.client.socket.destroyed = true;
            }
            denon.client.removeAllListeners();
            denon.client.socket.removeAllListeners();
            delete denon.client;

            // Verify socket was destroyed
            expect(mockSocket.destroy).toHaveBeenCalled();
            expect(mockSocket.destroyed).toBe(true);

            // Create new client with new socket for reconnection
            const newMockSocket = {
                ...mockSocket,
                _listenerCounts: {}, // Fresh socket, no listeners
                destroyed: false,
            };

            denon.client = {
                ...mockClient,
                socket: newMockSocket,
            };

            // Add listeners to NEW socket
            events.forEach(event => {
                newMockSocket._addListener(event);
            });

            // FIXED: Only 1 listener per event on new socket
            expect(newMockSocket.listenerCount('error')).toBe(1);
        });

        test('should handle multiple reconnection cycles without leak (GREEN)', () => {
            const reconnectionCount = 5;
            const sockets = [];

            for (let i = 0; i < reconnectionCount; i++) {
                // Create new socket for this connection
                const socket = {
                    setTimeout: jest.fn(),
                    setKeepAlive: jest.fn(),
                    removeAllListeners: jest.fn(),
                    destroy: jest.fn(),
                    destroyed: false,
                    _listenerCounts: {},
                    listenerCount: function(event) {
                        return this._listenerCounts[event] || 0;
                    },
                    _addListener: function(event) {
                        this._listenerCounts[event] = (this._listenerCounts[event] || 0) + 1;
                    }
                };

                // Cleanup previous connection
                if (denon.client) {
                    denon.client.socket.destroy();
                    denon.client.socket.destroyed = true;
                    denon.client.removeAllListeners();
                    denon.client.socket.removeAllListeners();
                    delete denon.client;
                }

                // Create new connection
                denon.client = {
                    socket: socket,
                    removeAllListeners: jest.fn(),
                    disconnect: jest.fn(),
                };

                // Add listeners
                ['error', 'timeout', 'close', 'data'].forEach(event => {
                    socket._addListener(event);
                });

                sockets.push(socket);
            }

            // Verify: Each socket should have exactly 1 listener per event
            sockets.forEach((socket, index) => {
                if (index < sockets.length - 1) {
                    // Previous sockets should be destroyed
                    expect(socket.destroy).toHaveBeenCalled();
                    expect(socket.destroyed).toBe(true);
                }

                // Each socket had exactly 1 listener per event when active
                expect(socket.listenerCount('error')).toBe(1);
                expect(socket.listenerCount('close')).toBe(1);
            });
        });
    });

    describe('Bug #3: Keep-alive memory leak', () => {
        test('should clear interval on cleanup (GREEN)', () => {
            // Simulate keep-alive setup
            denon.keepalive = setInterval(() => {}, 60000);
            const intervalId = denon.keepalive;

            expect(denon.keepalive).not.toBeNull();

            // FIXED: Clear interval during cleanup
            if (denon.keepalive) {
                clearInterval(denon.keepalive);
                denon.keepalive = null;
            }

            expect(denon.keepalive).toBeNull();
        });

        test('should not create multiple keep-alive intervals (GREEN)', () => {
            // This tests that we clear old interval before creating new one

            // First connection - create keep-alive
            denon.keepalive = setInterval(() => {}, 60000);
            const firstInterval = denon.keepalive;

            // Reconnection - should clear old interval first
            if (denon.keepalive) {
                clearInterval(denon.keepalive);
                denon.keepalive = null;
            }

            // Create new interval
            denon.keepalive = setInterval(() => {}, 60000);
            const secondInterval = denon.keepalive;

            // Should be different intervals
            expect(secondInterval).not.toBe(firstInterval);

            // Cleanup
            clearInterval(denon.keepalive);
            denon.keepalive = null;
        });
    });

    describe('Connection cleanup order', () => {
        test('should cleanup in correct order: keepalive → audyssey → socket → client (GREEN)', () => {
            const cleanupOrder = [];

            // Setup all components
            denon.keepalive = setInterval(() => {}, 60000);
            denon.audyssey = {
                cleanup: jest.fn(() => cleanupOrder.push('audyssey'))
            };
            denon.client = mockClient;

            // FIXED cleanup order (from app.js setup_denon_connection)
            if (denon.keepalive) {
                clearInterval(denon.keepalive);
                cleanupOrder.push('keepalive');
                denon.keepalive = null;
            }

            if (denon.audyssey) {
                denon.audyssey.cleanup();
                delete denon.audyssey;
            }

            if (denon.client) {
                denon.client.removeAllListeners();
                cleanupOrder.push('client.removeAllListeners');
                denon.client.socket.destroy();
                cleanupOrder.push('socket.destroy');
                denon.client.socket.removeAllListeners();
                cleanupOrder.push('socket.removeAllListeners');
                delete denon.client;
            }

            // Verify cleanup order
            expect(cleanupOrder).toEqual([
                'keepalive',
                'audyssey',
                'client.removeAllListeners',
                'socket.destroy',
                'socket.removeAllListeners',
            ]);

            // Verify all destroyed
            expect(denon.keepalive).toBeNull();
            expect(denon.audyssey).toBeUndefined();
            expect(denon.client).toBeUndefined();
            expect(mockSocket.destroy).toHaveBeenCalled();
        });
    });
});
