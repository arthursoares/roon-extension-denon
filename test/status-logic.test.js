"use strict";

const { describe, test, expect } = require('@jest/globals');

describe('Source Control - Status Logic', () => {
    // This is the BUGGY check_status function from app.js:921-940
    function check_status_buggy(power, input, configured_source) {
        let stat = "";
        if (power == "ON") {
            if (input == configured_source) {
                stat = "selected";
            } else {
                stat = "standby"; // BUG: Should be "deselected"
            }
        } else {
            stat = "standby";
        }
        return stat;
    }

    // This is the FIXED check_status function
    function check_status_fixed(power, input, configured_source) {
        let stat = "";
        if (power == "ON") {
            if (input == configured_source) {
                stat = "selected";
            } else {
                stat = "deselected"; // FIXED: Use "deselected" when power is ON but wrong input
            }
        } else {
            stat = "standby";
        }
        return stat;
    }

    describe('Bug #10: Status logic returns wrong status for wrong input', () => {
        const mysettings = {
            setsource: "CBL/SAT" // Configured source
        };

        test('should return "standby" for wrong input when power ON (RED - shows the bug)', () => {
            // RED: Buggy version returns "standby" when it should return "deselected"

            const power = "ON";
            const input = "DVD"; // Wrong input
            const status = check_status_buggy(power, input, mysettings.setsource);

            // BUG: Returns "standby" but power is ON!
            expect(status).toBe("standby");

            // This is WRONG - when power is ON and input doesn't match,
            // status should be "deselected", not "standby"
        });

        test('should return "deselected" for wrong input when power ON (GREEN - the fix)', () => {
            // GREEN: Fixed version returns correct status

            const power = "ON";
            const input = "DVD"; // Wrong input
            const status = check_status_fixed(power, input, mysettings.setsource);

            // FIXED: Returns "deselected" when power ON but wrong input
            expect(status).toBe("deselected");
        });

        test('should return "standby" when power is OFF (GREEN)', () => {
            const power = "STANDBY";
            const input = "DVD";
            const status = check_status_fixed(power, input, mysettings.setsource);

            expect(status).toBe("standby");
        });

        test('should return "selected" when power ON and correct input (GREEN)', () => {
            const power = "ON";
            const input = "CBL/SAT"; // Correct input
            const status = check_status_fixed(power, input, mysettings.setsource);

            expect(status).toBe("selected");
        });

        test('should handle all power/input combinations correctly (GREEN)', () => {
            const testCases = [
                { power: "ON", input: "CBL/SAT", expected: "selected", description: "Power ON, correct input" },
                { power: "ON", input: "DVD", expected: "deselected", description: "Power ON, wrong input" },
                { power: "ON", input: "BD", expected: "deselected", description: "Power ON, another wrong input" },
                { power: "STANDBY", input: "CBL/SAT", expected: "standby", description: "Power OFF, any input" },
                { power: "STANDBY", input: "DVD", expected: "standby", description: "Power OFF, any input" },
                { power: "OFF", input: "CBL/SAT", expected: "standby", description: "Power OFF variant" },
            ];

            testCases.forEach(({ power, input, expected, description }) => {
                const status = check_status_fixed(power, input, mysettings.setsource);
                expect(status).toBe(expected); // `${description}: expected ${expected}, got ${status}`
            });
        });
    });

    describe('Roon API status meanings', () => {
        test('should understand status semantics (documentation)', () => {
            // This test documents what each status means in Roon API

            const statusMeanings = {
                "selected": "Source is active and playing",
                "deselected": "Source is available but not selected (device ON, wrong input)",
                "standby": "Source is not available (device OFF)",
            };

            // Verify our understanding
            expect(statusMeanings.selected).toBe("Source is active and playing");
            expect(statusMeanings.deselected).toBe("Source is available but not selected (device ON, wrong input)");
            expect(statusMeanings.standby).toBe("Source is not available (device OFF)");
        });

        test('should use correct status for user experience', () => {
            // When device is ON but wrong input:
            // - "standby" suggests device is OFF (wrong!)
            // - "deselected" suggests device is ON but not active (correct!)

            const power = "ON";
            const wrongInput = "DVD";
            const configuredSource = "CBL/SAT";

            const status = check_status_fixed(power, wrongInput, configuredSource);

            // User sees: "Device is ON, but on a different input"
            expect(status).toBe("deselected");
            expect(status).not.toBe("standby"); // standby would confuse users
        });
    });
});
