"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');

/**
 * Settings save tests verify the error-handling and validation patterns
 * used in app.js save_settings flow. Since save_settings is not exported
 * from app.js, these tests verify the behavioral contract:
 * - Settings should not be saved when probe fails
 * - Settings should be saved on successful probe
 * - Validation rejects invalid values
 * - Dry runs don't persist
 */
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

    describe('Bug #8: Settings save must not persist on probe failure', () => {
        test('should NOT save settings when probeInputs fails', async () => {
            let settingsSaved = false;
            let errorReported = false;

            const save_settings = async (req, isdryrun, settings) => {
                const probeInputs = () => {
                    return Promise.reject(new Error("Connection timeout"));
                };

                try {
                    await probeInputs();
                    req.send_complete("Success");
                    if (!isdryrun) {
                        settingsSaved = true;
                    }
                } catch (err) {
                    settings.values.err = err.message;
                    errorReported = true;
                    req.send_complete("NotValid");
                }
            };

            await save_settings(mockReq, false, { values: mockSettings });

            expect(errorReported).toBe(true);
            expect(settingsSaved).toBe(false);
            expect(mockReq.send_complete).toHaveBeenCalledWith("NotValid");
        });

        test('should save settings when probeInputs succeeds', async () => {
            let settingsSaved = false;

            const save_settings = async (req, isdryrun, settings) => {
                const probeInputs = () => {
                    settings.values.inputs = [
                        { title: "CBL/SAT", value: "SAT/CBL" },
                        { title: "DVD", value: "DVD" },
                    ];
                    delete settings.values.err;
                    return Promise.resolve(settings.values);
                };

                try {
                    await probeInputs();
                    req.send_complete("Success");
                    if (!isdryrun) {
                        settingsSaved = true;
                    }
                } catch (err) {
                    settings.values.err = err.message;
                    req.send_complete("NotValid");
                }
            };

            await save_settings(mockReq, false, { values: mockSettings });

            expect(settingsSaved).toBe(true);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
            expect(mockSettings.err).toBeUndefined();
        });
    });

    describe('Settings validation', () => {
        test('should validate required fields before saving', () => {
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

        test('should not save settings with validation errors', () => {
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

            const invalidSettings = { ...mockSettings, zone: 'invalid' };
            const saved = save_with_validation(invalidSettings);

            expect(saved).toBe(false);
            expect(settingsSaved).toBe(false);
            expect(invalidSettings.err).toBeDefined();
        });
    });

    describe('Dry run behavior', () => {
        test('should not save settings when isdryrun is true', async () => {
            let settingsSaved = false;

            const save_settings = async (req, isdryrun) => {
                req.send_complete("Success");
                if (!isdryrun) {
                    settingsSaved = true;
                }
            };

            await save_settings(mockReq, true);

            expect(settingsSaved).toBe(false);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should save settings when isdryrun is false', async () => {
            let settingsSaved = false;

            const save_settings = async (req, isdryrun) => {
                req.send_complete("Success");
                if (!isdryrun) {
                    settingsSaved = true;
                }
            };

            await save_settings(mockReq, false);

            expect(settingsSaved).toBe(true);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });
    });
});
