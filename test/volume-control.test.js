"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Volume Control', () => {
    let volumeDevice;
    let mockDenonClient;
    let mockReq;

    beforeEach(() => {
        // Clear module cache
        jest.clearAllMocks();

        // Mock Denon client
        mockDenonClient = {
            setVolume: jest.fn().mockResolvedValue(),
            setMute: jest.fn().mockResolvedValue(),
        };

        // Mock request object
        mockReq = {
            send_complete: jest.fn(),
        };

        // Create volume device with the same structure as app.js
        const volume_state = {
            display_name: "Main Zone",
            volume_type: "db",
            volume_min: -79.5,
            volume_max: 0,
            volume_step: 0.5,
            volume_value: -30,
            is_muted: false,
        };

        volumeDevice = {
            state: volume_state,
            control_key: 1,

            set_volume: function (req, mode, value) {
                // FIXED: Now correctly references 'this.state.volume_value'
                let newvol = mode == "absolute" ? value : this.state.volume_value + value;

                if (newvol < this.state.volume_min)
                    newvol = this.state.volume_min;
                else if (newvol > this.state.volume_max)
                    newvol = this.state.volume_max;

                mockDenonClient
                    .setVolume(newvol + 80)
                    .then(() => {
                        req.send_complete("Success");
                    })
                    .catch((error) => {
                        req.send_complete("Failed");
                    });
            },

            set_mute: function (req, inAction) {
                const action = !this.state.is_muted ? "on" : "off";
                const MuteOptions = { On: "ON", Off: "OFF" };

                mockDenonClient
                    .setMute(action === "on" ? MuteOptions.On : MuteOptions.Off)
                    .then(() => {
                        req.send_complete("Success");
                    })
                    .catch((error) => {
                        req.send_complete("Failed");
                    });
            },
        };
    });

    describe('Bug #1 FIX VERIFICATION: set_volume with relative mode', () => {
        test('should NOT throw ReferenceError when using relative volume change (Bug #1 FIXED)', () => {
            // GREEN: After fix, this should NOT throw
            expect(() => {
                volumeDevice.set_volume(mockReq, "relative", 2);
            }).not.toThrow();
        });

        test('should increase volume by relative amount when mode is "relative"', async () => {
            // RED: This will also fail due to Bug #1
            const initialVolume = volumeDevice.state.volume_value; // -30
            const increment = 2;

            volumeDevice.set_volume(mockReq, "relative", increment);

            // Wait for async operation
            await new Promise(resolve => setTimeout(resolve, 10));

            // Should call setVolume with (initialVolume + increment) + 80
            // -30 + 2 = -28, -28 + 80 = 52
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(52);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should decrease volume by relative amount when mode is "relative" with negative value', async () => {
            // RED: This will also fail due to Bug #1
            const initialVolume = volumeDevice.state.volume_value; // -30
            const decrement = -3;

            volumeDevice.set_volume(mockReq, "relative", decrement);

            await new Promise(resolve => setTimeout(resolve, 10));

            // -30 + (-3) = -33, -33 + 80 = 47
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(47);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });
    });

    describe('set_volume with absolute mode', () => {
        test('should set absolute volume when mode is "absolute"', async () => {
            const targetVolume = -20;

            volumeDevice.set_volume(mockReq, "absolute", targetVolume);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should call setVolume with targetVolume + 80
            // -20 + 80 = 60
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(60);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should enforce volume_min limit', async () => {
            const tooLowVolume = -100; // Below volume_min of -79.5

            volumeDevice.set_volume(mockReq, "absolute", tooLowVolume);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should clamp to volume_min: -79.5 + 80 = 0.5
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(0.5);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should enforce volume_max limit', async () => {
            const tooHighVolume = 10; // Above volume_max of 0

            volumeDevice.set_volume(mockReq, "absolute", tooHighVolume);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should clamp to volume_max: 0 + 80 = 80
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(80);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });
    });

    describe('set_volume error handling', () => {
        test('should send "Failed" when setVolume rejects', async () => {
            mockDenonClient.setVolume.mockRejectedValue(new Error("Connection lost"));

            volumeDevice.set_volume(mockReq, "absolute", -25);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockReq.send_complete).toHaveBeenCalledWith("Failed");
        });
    });

    describe('set_mute', () => {
        test('should mute when currently unmuted', async () => {
            volumeDevice.state.is_muted = false;

            volumeDevice.set_mute(mockReq, "toggle");

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockDenonClient.setMute).toHaveBeenCalledWith("ON");
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should unmute when currently muted', async () => {
            volumeDevice.state.is_muted = true;

            volumeDevice.set_mute(mockReq, "toggle");

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockDenonClient.setMute).toHaveBeenCalledWith("OFF");
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should send "Failed" when setMute rejects', async () => {
            mockDenonClient.setMute.mockRejectedValue(new Error("Connection lost"));

            volumeDevice.set_mute(mockReq, "toggle");

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockReq.send_complete).toHaveBeenCalledWith("Failed");
        });
    });

    describe('Edge cases', () => {
        test('should handle volume at exactly volume_min', async () => {
            volumeDevice.state.volume_value = -79.5;

            volumeDevice.set_volume(mockReq, "absolute", -79.5);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(0.5);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should handle volume at exactly volume_max', async () => {
            volumeDevice.state.volume_value = 0;

            volumeDevice.set_volume(mockReq, "absolute", 0);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(80);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });

        test('should handle zero volume change in relative mode', async () => {
            // This will fail due to Bug #1
            const initialVolume = volumeDevice.state.volume_value;

            volumeDevice.set_volume(mockReq, "relative", 0);

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should stay at current volume
            expect(mockDenonClient.setVolume).toHaveBeenCalledWith(initialVolume + 80);
            expect(mockReq.send_complete).toHaveBeenCalledWith("Success");
        });
    });
});
