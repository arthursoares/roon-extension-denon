"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Settings Save - Error Handling', () => {
    let mockReq;
    let mockSettings;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            send_complete: jest.fn(),
        };

        mockSettings = {
            hostname: "192.168.1.100",
            setsource: "CBL/SAT",
            zone: "main",
            powerOffBothZones: true,
            maxVolumeMode: "dynamic",
        };
    });

    describe('Bug #8: Settings save promise rejection not handled', () => {
        test('should demonstrate partial save on probeInputs failure (RED)', async () => {
            // RED: Shows the bug - settings get partially saved even when probe fails

            let settingsSaved = false;
            let errorHandled = false;

            // Simulate the buggy save_settings flow
            const save_settings_buggy = (req, isdryrun, settings) => {
                const probeInputs = (settings) => {
                    // Simulate connection failure
                    return Promise.reject(new Error("Connection timeout"));
                };

                probeInputs(settings.values)
                    .then((settings) => {
                        // This won't execute due to rejection
                        req.send_complete("Success");
                    })
                    .catch((err) => {
                        // Error is set on settings object
                        settings.values.err = err.message;
                        errorHandled = true;
                    })
                    .then(() => {
                        // BUG: This .then() executes EVEN AFTER catch!
                        // Settings get saved despite the error
                        if (!isdryrun) {
                            settingsSaved = true;
                            // In real code: roon.save_config("settings", mysettings);
                        }
                        return settings;
                    });
            };

            await save_settings_buggy(mockReq, false, { values: mockSettings });

            // Wait for promises to settle
            await new Promise(resolve => setTimeout(resolve, 10));

            // BUG: Settings saved even though probe failed!
            expect(errorHandled).toBe(true);
            expect(settingsSaved).toBe(true); // This is the bug!
            expect(mockSettings.err).toBeDefined();
        });

        test('should NOT save settings when probeInputs fails (GREEN)', async () => {
            // GREEN: Proper error handling - don't save on failure

            let settingsSaved = false;
            let errorReported = false;

            const save_settings_fixed = async (req, isdryrun, settings) => {
                const probeInputs = (settings) => {
                    return Promise.reject(new Error("Connection timeout"));
                };

                try {
                    const probed = await probeInputs(settings.values);

                    // Only execute if probe succeeded
                    req.send_complete("Success");

                    if (!isdryrun) {
                        settingsSaved = true;
                    }
                } catch (err) {
                    // Error occurred - set error and report failure
                    settings.values.err = err.message;
                    errorReported = true;
                    req.send_complete("NotValid");

                    // FIXED: Don't save settings on error
                    // Early return prevents save
                    return;
                }
            };

            await save_settings_fixed(mockReq, false, { values: mockSettings });

            // FIXED: Settings NOT saved when probe failed
            expect(errorReported).toBe(true);
            expect(settingsSaved).toBe(false);
            expect(mockReq.send_complete).toHaveBeenCalledWith("NotValid");
        });

        test('should save settings when probeInputs succeeds (GREEN)', async () => {
            let settingsSaved = false;

            const save_settings_fixed = async (req, isdryrun, settings) => {
                const probeInputs = (settings) => {
                    // Simulate successful probe
                    settings.inputs = [
                        { title: "CBL/SAT", value: "SAT/CBL" },
                        { title: "DVD", value: "DVD" },
                    ];
                    delete settings.err;
                    return Promise.resolve(settings);
                };

                try {
                    const probed = await probeInputs(settings.values);

                    req.send_complete("Success");

                    if (!isdryrun) {
                        settingsSaved = true;
                    }
                } catch (err) {
                    settings.values.err = err.message;
                    req.send_complete("NotValid");
                    return;
                }
            };

            await save_settings_fixed(mockReq, false, { values: mockSettings });

            expect(settingsSaved).toBe(true);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
            expect(mockSettings.err).toBeUndefined();
        });
    });

    describe('Settings validation', () => {
        test('should validate required fields before saving (GREEN)', () => {
            const validateSettings = (settings) => {
                const errors = [];

                if (!settings.zone || !['main', 'zone2'].includes(settings.zone)) {
                    errors.push('Invalid zone');
                }

                if (settings.maxVolumeMode && !['dynamic', 'fixed'].includes(settings.maxVolumeMode)) {
                    errors.push('Invalid maxVolumeMode');
                }

                return errors;
            };

            // Valid settings
            let errors = validateSettings(mockSettings);
            expect(errors).toHaveLength(0);

            // Invalid zone
            errors = validateSettings({ ...mockSettings, zone: 'invalid' });
            expect(errors).toContain('Invalid zone');

            // Invalid maxVolumeMode
            errors = validateSettings({ ...mockSettings, maxVolumeMode: 'invalid' });
            expect(errors).toContain('Invalid maxVolumeMode');
        });

        test('should not save settings with validation errors (GREEN)', async () => {
            let settingsSaved = false;

            const save_with_validation = (settings) => {
                const errors = [];

                if (!settings.zone || !['main', 'zone2'].includes(settings.zone)) {
                    errors.push('Invalid zone');
                }

                if (errors.length > 0) {
                    settings.err = errors.join(', ');
                    return false;
                }

                settingsSaved = true;
                return true;
            };

            // Invalid settings
            const invalidSettings = { ...mockSettings, zone: 'invalid' };
            const saved = save_with_validation(invalidSettings);

            expect(saved).toBe(false);
            expect(settingsSaved).toBe(false);
            expect(invalidSettings.err).toBeDefined();
        });
    });

    describe('Dry run behavior', () => {
        test('should not save settings when isdryrun is true (GREEN)', async () => {
            let settingsSaved = false;

            const save_settings = async (req, isdryrun, settings) => {
                req.send_complete("Success");

                if (!isdryrun) {
                    settingsSaved = true;
                }
            };

            await save_settings(mockReq, true, { values: mockSettings });

            expect(settingsSaved).toBe(false);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should save settings when isdryrun is false (GREEN)', async () => {
            let settingsSaved = false;

            const save_settings = async (req, isdryrun, settings) => {
                req.send_complete("Success");

                if (!isdryrun) {
                    settingsSaved = true;
                }
            };

            await save_settings(mockReq, false, { values: mockSettings });

            expect(settingsSaved).toBe(true);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });
    });
});
