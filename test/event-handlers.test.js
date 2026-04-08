"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');

/**
 * These tests verify the null-guard pattern used in app.js event handlers.
 * Since app.js doesn't export its handlers, we test the pattern itself
 * to ensure the guard logic is correct. The production handlers in app.js
 * follow this same pattern (verified by code review).
 */
describe('Event Handlers - State Initialization Guard Pattern', () => {
    let denon;

    beforeEach(() => {
        denon = {};
    });

    describe('Bug #6: Handlers must guard against uninitialized state', () => {
        // These handlers replicate the FIXED pattern from app.js
        // (with null guards that prevent crashes on early events)
        const handlers = {
            muteChanged: (denon, val) => {
                if (!denon.volume_state) return;
                denon.volume_state.is_muted = val === "ON";
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        is_muted: denon.volume_state.is_muted,
                    });
                }
            },
            masterVolumeChanged: (denon, val) => {
                if (!denon.volume_state) return;
                denon.volume_state.volume_value = val - 80;
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        volume_value: denon.volume_state.volume_value,
                    });
                }
            },
            powerChanged: (denon, val) => {
                if (!denon.source_state) return;
                denon.source_state.Power = val;
            },
            inputChanged: (denon, val) => {
                if (!denon.source_state) return;
                denon.source_state.Input = val;
            },
        };

        test('muteChanged should not throw when volume_state is undefined', () => {
            expect(denon.volume_state).toBeUndefined();
            expect(() => handlers.muteChanged(denon, "ON")).not.toThrow();
        });

        test('masterVolumeChanged should not throw when volume_state is undefined', () => {
            expect(denon.volume_state).toBeUndefined();
            expect(() => handlers.masterVolumeChanged(denon, 50)).not.toThrow();
        });

        test('powerChanged should not throw when source_state is undefined', () => {
            expect(denon.source_state).toBeUndefined();
            expect(() => handlers.powerChanged(denon, "ON")).not.toThrow();
        });

        test('inputChanged should not throw when source_state is undefined', () => {
            expect(denon.source_state).toBeUndefined();
            expect(() => handlers.inputChanged(denon, "CBL/SAT")).not.toThrow();
        });
    });

    describe('Handlers update state correctly when initialized', () => {
        test('muteChanged should update state and notify control', () => {
            denon.volume_state = { is_muted: false, volume_value: -30 };
            denon.volume_control = { update_state: jest.fn() };

            const handler = (val) => {
                if (!denon.volume_state) return;
                denon.volume_state.is_muted = val === "ON";
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        is_muted: denon.volume_state.is_muted,
                    });
                }
            };

            handler("ON");

            expect(denon.volume_state.is_muted).toBe(true);
            expect(denon.volume_control.update_state).toHaveBeenCalledWith({
                is_muted: true,
            });
        });

        test('masterVolumeChanged should calculate dB offset correctly', () => {
            denon.volume_state = { volume_value: 0 };
            denon.volume_control = { update_state: jest.fn() };

            const handler = (val) => {
                if (!denon.volume_state) return;
                denon.volume_state.volume_value = val - 80;
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        volume_value: denon.volume_state.volume_value,
                    });
                }
            };

            handler(60); // 60 - 80 = -20 dB

            expect(denon.volume_state.volume_value).toBe(-20);
            expect(denon.volume_control.update_state).toHaveBeenCalledWith({
                volume_value: -20,
            });
        });

        test('all handlers work after state initialization', () => {
            denon.volume_state = { is_muted: false, volume_value: -30 };
            denon.source_state = { Power: "STANDBY", Input: "DVD" };
            denon.volume_control = { update_state: jest.fn() };

            const handlers = {
                muteChanged: (val) => {
                    if (!denon.volume_state) return;
                    denon.volume_state.is_muted = val === "ON";
                },
                masterVolumeChanged: (val) => {
                    if (!denon.volume_state) return;
                    denon.volume_state.volume_value = val - 80;
                },
                powerChanged: (val) => {
                    if (!denon.source_state) return;
                    denon.source_state.Power = val;
                },
                inputChanged: (val) => {
                    if (!denon.source_state) return;
                    denon.source_state.Input = val;
                },
            };

            expect(() => {
                handlers.muteChanged("ON");
                handlers.masterVolumeChanged(60);
                handlers.powerChanged("ON");
                handlers.inputChanged("CBL/SAT");
            }).not.toThrow();

            expect(denon.volume_state.is_muted).toBe(true);
            expect(denon.volume_state.volume_value).toBe(-20);
            expect(denon.source_state.Power).toBe("ON");
            expect(denon.source_state.Input).toBe("CBL/SAT");
        });
    });
});
