"use strict";

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

describe('Audyssey Control - Listener Lifecycle', () => {
    let AudysseyControl;
    let mockClient;
    let mockSocket;
    let audyssey;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Create mock socket
        mockSocket = {
            write: jest.fn(),
            destroyed: false,
            writable: true,
        };

        // Create mock Denon client with listener tracking
        mockClient = {
            socket: mockSocket,
            _listeners: [],
            on: jest.fn(function(event, listener) {
                this._listeners.push({ event, listener });
            }),
            removeListener: jest.fn(function(event, listener) {
                const index = this._listeners.findIndex(
                    l => l.event === event && l.listener === listener
                );
                if (index !== -1) {
                    this._listeners.splice(index, 1);
                }
            }),
            listenerCount: function(event) {
                return this._listeners.filter(l => l.event === event).length;
            }
        };

        // Import module
        AudysseyControl = require("../src/audyssey-control");
    });

    afterEach(() => {
        // Defensive: ensure real timers are restored even if a test
        // throws before reaching its own jest.useRealTimers() call.
        jest.useRealTimers();
    });

    describe('Bug #9: Audyssey listener cleanup with client replacement', () => {
        test('should demonstrate stale listeners after client replacement (RED)', async () => {
            // RED: Shows the bug - listeners remain on old client after replacement

            // Create Audyssey with first client
            audyssey = new AudysseyControl(mockClient);
            const firstClient = mockClient;

            // Start a command that adds a listener
            const commandPromise = audyssey.setDynamicEQ(true).catch(() => {});

            // Verify listener was added to first client
            expect(firstClient.on).toHaveBeenCalled();
            expect(audyssey.activeListeners.length).toBe(1);

            // Simulate client replacement (as happens in setup_denon_connection)
            const newMockClient = {
                socket: {
                    write: jest.fn(),
                    destroyed: false,
                    writable: true,
                },
                _listeners: [],
                on: jest.fn(function(event, listener) {
                    this._listeners.push({ event, listener });
                }),
                removeListener: jest.fn(function(event, listener) {
                    const index = this._listeners.findIndex(
                        l => l.event === event && l.listener === listener
                    );
                    if (index !== -1) {
                        this._listeners.splice(index, 1);
                    }
                }),
                listenerCount: function(event) {
                    return this._listeners.filter(l => l.event === event).length;
                }
            };

            // Replace client reference
            audyssey.denonClient = newMockClient;

            // Try to cleanup (as setup_denon_connection does)
            audyssey.cleanup();

            // BUG: Cleanup tries to remove from NEW client, but listener is on OLD client
            expect(audyssey.activeListeners.length).toBe(0); // Tracking cleared
            expect(firstClient.listenerCount('data')).toBe(1); // But listener still on old client!
            expect(newMockClient.listenerCount('data')).toBe(0);
        });

        test('should properly cleanup listeners before client replacement (GREEN)', async () => {
            // GREEN: Cleanup BEFORE client replacement

            audyssey = new AudysseyControl(mockClient);
            const firstClient = mockClient;

            // Start a command
            const commandPromise = audyssey.setDynamicEQ(true).catch(() => {});

            expect(audyssey.activeListeners.length).toBe(1);
            expect(firstClient.listenerCount('data')).toBe(1);

            // FIXED: Cleanup BEFORE replacing client
            audyssey.cleanup();

            // Verify all listeners removed from old client
            expect(audyssey.activeListeners.length).toBe(0);
            expect(firstClient.listenerCount('data')).toBe(0);

            // Now it's safe to replace client
            const newMockClient = {
                socket: { write: jest.fn(), destroyed: false, writable: true },
                _listeners: [],
                on: jest.fn(),
                removeListener: jest.fn(),
            };

            audyssey.denonClient = newMockClient;

            // No stale listeners
            expect(firstClient.listenerCount('data')).toBe(0);
        });

        test('should handle multiple pending commands during cleanup (GREEN)', async () => {
            audyssey = new AudysseyControl(mockClient);

            // Start multiple commands (simulating multiple Audyssey settings being changed)
            const promise1 = audyssey.setDynamicEQ(true).catch(() => {});
            const promise2 = audyssey.setDynamicVolume('MED').catch(() => {});
            const promise3 = audyssey.setReferenceLevel(5).catch(() => {});

            // Should have 3 active listeners
            expect(audyssey.activeListeners.length).toBe(3);
            expect(mockClient.listenerCount('data')).toBe(3);

            // Cleanup all
            audyssey.cleanup();

            // All should be removed
            expect(audyssey.activeListeners.length).toBe(0);
            expect(mockClient.listenerCount('data')).toBe(0);
        });
    });

    describe('Timeout cleanup', () => {
        // Set commands resolve on timeout: the receiver suppresses the
        // echo when the requested value already matches current state, so
        // a silent timeout means "already there" rather than a failure.
        test('should resolve set command and cleanup listener on timeout (GREEN)', async () => {
            jest.useFakeTimers();

            audyssey = new AudysseyControl(mockClient);

            // Start set command that will timeout (no echo simulated)
            const commandPromise = audyssey.setDynamicEQ(true);

            expect(audyssey.activeListeners.length).toBe(1);

            // Fast-forward past timeout (2000ms)
            jest.advanceTimersByTime(2500);

            // Set commands resolve on timeout (returns true since target was ON)
            await expect(commandPromise).resolves.toBe(true);

            // Listener should be cleaned up after timeout
            expect(audyssey.activeListeners.length).toBe(0);

            jest.useRealTimers();
        });

        // Query commands still reject on timeout: we genuinely need data,
        // so silence is a real failure.
        test('should reject query command and cleanup listener on timeout (GREEN)', async () => {
            jest.useFakeTimers();

            audyssey = new AudysseyControl(mockClient);

            // Start query command that will timeout
            const commandPromise = audyssey.getDynamicEQ();

            expect(audyssey.activeListeners.length).toBe(1);

            jest.advanceTimersByTime(2500);

            await expect(commandPromise).rejects.toThrow('Timeout');

            expect(audyssey.activeListeners.length).toBe(0);

            jest.useRealTimers();
        });

        test('should cleanup listener when response received (GREEN)', async () => {
            audyssey = new AudysseyControl(mockClient);

            // Start command
            const commandPromise = audyssey.setDynamicEQ(true);

            expect(audyssey.activeListeners.length).toBe(1);

            // Simulate response
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data"
                )[1];
                dataCallback(Buffer.from("PSDYNEQ ON\r"));
            }, 10);

            await commandPromise;

            // Listener should be cleaned up after response
            expect(audyssey.activeListeners.length).toBe(0);
        });
    });
});
