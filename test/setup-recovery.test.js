"use strict";

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// These tests mirror the lifecycle/teardown logic in app.js (which isn't directly
// importable because requiring it would kick off a real Roon connection on module
// load). The convention in this repo — see test/connection-lifecycle.test.js — is
// to replicate the relevant snippets inline and assert on observable behavior.

describe('Stale control teardown on settings change', () => {
    let denon;
    let mysettings;

    function destroy_stale_controls(host) {
        const dropVolume = !host || mysettings.zone !== "main";
        const dropSource = !host || !mysettings.setsource;

        if (dropVolume && denon.volume_control) {
            denon.volume_control.destroy();
            delete denon.volume_control;
            delete denon.volume_state;
        }
        if (dropSource && denon.source_control) {
            denon.source_control.destroy();
            delete denon.source_control;
            delete denon.source_state;
        }
    }

    beforeEach(() => {
        denon = {
            volume_control: { destroy: jest.fn() },
            source_control: { destroy: jest.fn() },
            volume_state: {},
            source_state: {},
        };
        mysettings = { hostname: '192.0.2.1', zone: 'main', setsource: 'CD' };
    });

    test('hostname cleared destroys both controls', () => {
        const vol = denon.volume_control;
        const src = denon.source_control;

        destroy_stale_controls('');

        expect(vol.destroy).toHaveBeenCalledTimes(1);
        expect(src.destroy).toHaveBeenCalledTimes(1);
        expect(denon.volume_control).toBeUndefined();
        expect(denon.source_control).toBeUndefined();
    });

    test('switching to zone2 destroys volume control but keeps source control', () => {
        const vol = denon.volume_control;
        const src = denon.source_control;
        mysettings.zone = 'zone2';

        destroy_stale_controls(mysettings.hostname);

        expect(vol.destroy).toHaveBeenCalledTimes(1);
        expect(src.destroy).not.toHaveBeenCalled();
        expect(denon.volume_control).toBeUndefined();
        expect(denon.source_control).toBe(src);
    });

    test('clearing setsource destroys source control but keeps volume control', () => {
        const vol = denon.volume_control;
        const src = denon.source_control;
        mysettings.setsource = '';

        destroy_stale_controls(mysettings.hostname);

        expect(vol.destroy).not.toHaveBeenCalled();
        expect(src.destroy).toHaveBeenCalledTimes(1);
        expect(denon.volume_control).toBe(vol);
        expect(denon.source_control).toBeUndefined();
    });

    test('no-op when controls already match the new settings', () => {
        const vol = denon.volume_control;
        const src = denon.source_control;

        destroy_stale_controls(mysettings.hostname);

        expect(vol.destroy).not.toHaveBeenCalled();
        expect(src.destroy).not.toHaveBeenCalled();
    });
});

describe('Reconnect timer is cancellable', () => {
    let denon;

    beforeEach(() => {
        denon = { reconnectTimer: null };
    });

    afterEach(() => {
        if (denon.reconnectTimer) clearTimeout(denon.reconnectTimer);
    });

    test('a fresh setup_denon_connection cancels a pending reconnect timer', () => {
        // Simulate the close handler scheduling a delayed reconnect
        denon.reconnectTimer = setTimeout(() => {
            throw new Error('stale reconnect should have been cancelled');
        }, 10);

        // Simulate the top of setup_denon_connection running before the timer fires
        if (denon.reconnectTimer) {
            clearTimeout(denon.reconnectTimer);
            denon.reconnectTimer = null;
        }

        expect(denon.reconnectTimer).toBeNull();
        // Wait past the original 10ms — if the cleared timer fired, the throw above would surface
        return new Promise((resolve) => setTimeout(resolve, 30));
    });

    test('the reconnect timer self-clears its own handle when it fires', () => {
        return new Promise((resolve) => {
            denon.reconnectTimer = setTimeout(() => {
                denon.reconnectTimer = null;
                resolve();
            }, 5);
        }).then(() => {
            expect(denon.reconnectTimer).toBeNull();
        });
    });
});

describe('Setup-failure recovery teardown', () => {
    test('a getVolume timeout during setup tears down client and schedules retry', () => {
        // Mirrors the .catch path in connect() in app.js after the fix
        const denon = {
            client: {
                socket: { destroy: jest.fn(), removeAllListeners: jest.fn(), destroyed: false },
                removeAllListeners: jest.fn(),
                disconnect: jest.fn(),
            },
            keepalive: setInterval(() => {}, 60000),
            audyssey: { cleanup: jest.fn() },
            reconnectTimer: null,
            intentionalClose: false,
        };
        const mysettings = { hostname: '192.0.2.1' };

        // Simulate the catch body
        if (denon.keepalive) {
            clearInterval(denon.keepalive);
            denon.keepalive = null;
        }
        if (denon.audyssey) {
            denon.audyssey.cleanup();
            delete denon.audyssey;
        }
        if (denon.client) {
            denon.intentionalClose = true;
            if (denon.client.socket && !denon.client.socket.destroyed) {
                denon.client.socket.destroy();
            }
            denon.client.removeAllListeners();
            denon.client.socket.removeAllListeners();
            denon.client.disconnect();
            delete denon.client;
        }
        if (mysettings.hostname && !denon.reconnectTimer) {
            denon.reconnectTimer = setTimeout(() => {
                denon.reconnectTimer = null;
            }, 5000);
        }

        expect(denon.keepalive).toBeNull();
        expect(denon.audyssey).toBeUndefined();
        expect(denon.client).toBeUndefined();
        expect(denon.intentionalClose).toBe(true);
        expect(denon.reconnectTimer).not.toBeNull();

        clearTimeout(denon.reconnectTimer);
    });
});
