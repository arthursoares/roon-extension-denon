"use strict";

const { describe, test, expect } = require('@jest/globals');
const ZoneFunctions = require('../src/zone-functions');

describe('Source Control - Status Logic (Production Code)', () => {
    // Test the actual production checkStatus method from ZoneFunctions
    function createZoneFunctions(configuredSource) {
        const mockClient = {};
        const settings = { setsource: configuredSource, zone: "main" };
        return new ZoneFunctions(mockClient, settings);
    }

    describe('Bug #10: Status logic returns correct status for wrong input', () => {
        const configuredSource = "CBL/SAT";

        test('should return "deselected" for wrong input when power ON', () => {
            const zf = createZoneFunctions(configuredSource);
            const status = zf.checkStatus("ON", "DVD");
            expect(status).toBe("deselected");
        });

        test('should return "standby" when power is OFF', () => {
            const zf = createZoneFunctions(configuredSource);
            const status = zf.checkStatus("STANDBY", "DVD");
            expect(status).toBe("standby");
        });

        test('should return "selected" when power ON and correct input', () => {
            const zf = createZoneFunctions(configuredSource);
            const status = zf.checkStatus("ON", "CBL/SAT");
            expect(status).toBe("selected");
        });

        test('should handle all power/input combinations correctly', () => {
            const zf = createZoneFunctions(configuredSource);

            const testCases = [
                { power: "ON", input: "CBL/SAT", expected: "selected" },
                { power: "ON", input: "DVD", expected: "deselected" },
                { power: "ON", input: "BD", expected: "deselected" },
                { power: "STANDBY", input: "CBL/SAT", expected: "standby" },
                { power: "STANDBY", input: "DVD", expected: "standby" },
                { power: "OFF", input: "CBL/SAT", expected: "standby" },
            ];

            testCases.forEach(({ power, input, expected }) => {
                const status = zf.checkStatus(power, input);
                expect(status).toBe(expected);
            });
        });
    });

    describe('Roon API status meanings', () => {
        test('should use correct status for user experience', () => {
            const zf = createZoneFunctions("CBL/SAT");

            // When device is ON but wrong input, should be "deselected" not "standby"
            const status = zf.checkStatus("ON", "DVD");
            expect(status).toBe("deselected");
            expect(status).not.toBe("standby");
        });
    });
});
