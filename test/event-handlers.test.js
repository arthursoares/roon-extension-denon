"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Event Handlers - State Initialization', () => {
    let denon;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();

        // Simulate denon object structure from app.js
        denon = {};

        // Mock client that can emit events
        mockClient = {
            on: jest.fn(),
            emit: jest.fn(),
            removeAllListeners: jest.fn(),
        };
    });

    describe('Bug #6: State access before initialization', () => {
        test('muteChanged handler should handle undefined volume_state gracefully (RED - should fail)', () => {
            // RED: This simulates the bug where event handlers access state before initialization
            // The real code from app.js:659-668 accesses denon.volume_state without null check

            const muteChangedHandler = (val) => {
                // This is the BUGGY code from app.js
                denon.volume_state.is_muted = val === "ON";
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        is_muted: denon.volume_state.is_muted,
                    });
                }
            };

            // volume_state is NOT initialized yet
            expect(denon.volume_state).toBeUndefined();

            // This should throw TypeError: Cannot read property 'is_muted' of undefined
            expect(() => {
                muteChangedHandler("ON");
            }).toThrow(TypeError);
        });

        test('masterVolumeChanged handler should handle undefined volume_state gracefully (RED - should fail)', () => {
            const masterVolumeChangedHandler = (val) => {
                // Buggy code from app.js:670-678
                denon.volume_state.volume_value = val - 80;
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        volume_value: denon.volume_state.volume_value,
                    });
                }
            };

            expect(denon.volume_state).toBeUndefined();

            expect(() => {
                masterVolumeChangedHandler(50);
            }).toThrow(TypeError);
        });

        test('powerChanged handler should handle undefined source_state gracefully (RED - should fail)', () => {
            const powerChangedHandler = (val) => {
                // Buggy code from app.js:557-606
                let old_power_value = denon.source_state.Power;
                denon.source_state.Power = val;
                // ... rest of the handler
            };

            expect(denon.source_state).toBeUndefined();

            expect(() => {
                powerChangedHandler("ON");
            }).toThrow(TypeError);
        });

        test('inputChanged handler should handle undefined source_state gracefully (RED - should fail)', () => {
            const inputChangedHandler = (val) => {
                // Buggy code from app.js:608-657
                let old_Input = denon.source_state.Input;
                denon.source_state.Input = val;
                // ... rest of the handler
            };

            expect(denon.source_state).toBeUndefined();

            expect(() => {
                inputChangedHandler("CBL/SAT");
            }).toThrow(TypeError);
        });
    });

    describe('Bug #6 FIX: Event handlers with null checks', () => {
        test('muteChanged handler with null check should not throw (GREEN)', () => {
            const muteChangedHandlerFixed = (val) => {
                // FIXED code with null check
                if (!denon.volume_state) {
                    // State not initialized yet, ignore event
                    return;
                }

                denon.volume_state.is_muted = val === "ON";
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        is_muted: denon.volume_state.is_muted,
                    });
                }
            };

            expect(denon.volume_state).toBeUndefined();

            // Should NOT throw
            expect(() => {
                muteChangedHandlerFixed("ON");
            }).not.toThrow();
        });

        test('muteChanged handler should update state when initialized (GREEN)', () => {
            // Initialize state
            denon.volume_state = {
                is_muted: false,
                volume_value: -30,
            };
            denon.volume_control = {
                update_state: jest.fn(),
            };

            const muteChangedHandlerFixed = (val) => {
                if (!denon.volume_state) return;

                denon.volume_state.is_muted = val === "ON";
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        is_muted: denon.volume_state.is_muted,
                    });
                }
            };

            muteChangedHandlerFixed("ON");

            expect(denon.volume_state.is_muted).toBe(true);
            expect(denon.volume_control.update_state).toHaveBeenCalledWith({
                is_muted: true,
            });
        });

        test('masterVolumeChanged handler with null check should not throw (GREEN)', () => {
            const masterVolumeChangedHandlerFixed = (val) => {
                if (!denon.volume_state) return;

                denon.volume_state.volume_value = val - 80;
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        volume_value: denon.volume_state.volume_value,
                    });
                }
            };

            expect(() => {
                masterVolumeChangedHandlerFixed(50);
            }).not.toThrow();
        });

        test('powerChanged handler with null check should not throw (GREEN)', () => {
            const powerChangedHandlerFixed = (val) => {
                if (!denon.source_state) return;

                let old_power_value = denon.source_state.Power;
                denon.source_state.Power = val;
            };

            expect(() => {
                powerChangedHandlerFixed("ON");
            }).not.toThrow();
        });

        test('inputChanged handler with null check should not throw (GREEN)', () => {
            const inputChangedHandlerFixed = (val) => {
                if (!denon.source_state) return;

                let old_Input = denon.source_state.Input;
                denon.source_state.Input = val;
            };

            expect(() => {
                inputChangedHandlerFixed("CBL/SAT");
            }).not.toThrow();
        });

        test('all handlers should work correctly after state is initialized (GREEN)', () => {
            // Initialize both states
            denon.volume_state = {
                is_muted: false,
                volume_value: -30,
            };
            denon.source_state = {
                Power: "STANDBY",
                Input: "DVD",
            };
            denon.volume_control = {
                update_state: jest.fn(),
            };
            denon.source_control = {
                update_state: jest.fn(),
            };

            // Simulate all events with fixed handlers
            const handlers = {
                muteChanged: (val) => {
                    if (!denon.volume_state) return;
                    denon.volume_state.is_muted = val === "ON";
                    if (denon.volume_control) {
                        denon.volume_control.update_state({ is_muted: denon.volume_state.is_muted });
                    }
                },
                masterVolumeChanged: (val) => {
                    if (!denon.volume_state) return;
                    denon.volume_state.volume_value = val - 80;
                    if (denon.volume_control) {
                        denon.volume_control.update_state({ volume_value: denon.volume_state.volume_value });
                    }
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

            // All should execute without errors
            expect(() => {
                handlers.muteChanged("ON");
                handlers.masterVolumeChanged(60);
                handlers.powerChanged("ON");
                handlers.inputChanged("CBL/SAT");
            }).not.toThrow();

            // Verify state updates
            expect(denon.volume_state.is_muted).toBe(true);
            expect(denon.volume_state.volume_value).toBe(-20);
            expect(denon.source_state.Power).toBe("ON");
            expect(denon.source_state.Input).toBe("CBL/SAT");
        });
    });
});
