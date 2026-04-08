const { describe, test, expect, beforeEach } = require("@jest/globals");

describe("AudysseyControl", () => {
    let AudysseyControl;
    let mockClient;
    let mockSocket;
    let audyssey;

    beforeEach(() => {
        // Clear module cache to get fresh instance
        jest.resetModules();

        // Create mock socket
        mockSocket = {
            write: jest.fn(),
            destroyed: false,
            writable: true,
        };

        // Create mock Denon client
        mockClient = {
            socket: mockSocket,
            on: jest.fn(),
            removeListener: jest.fn(),
        };

        // Import module after mocks are set up
        AudysseyControl = require("../src/audyssey-control");
        audyssey = new AudysseyControl(mockClient);
    });

    describe("setDynamicEQ", () => {
        test("should send PSDYNEQ ON command when enabled", async () => {
            // Simulate response from receiver
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNEQ ON\r"));
            }, 10);

            const result = await audyssey.setDynamicEQ(true);

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNEQ ON\r");
            expect(result).toBe(true);
        });

        test("should send PSDYNEQ OFF command when disabled", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNEQ OFF\r"));
            }, 10);

            const result = await audyssey.setDynamicEQ(false);

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNEQ OFF\r");
            expect(result).toBe(false);
        });
    });

    describe("getDynamicEQ", () => {
        test("should return true when Dynamic EQ is ON", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNEQ ON\r"));
            }, 10);

            const result = await audyssey.getDynamicEQ();

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNEQ ?\r");
            expect(result).toBe(true);
        });

        test("should return false when Dynamic EQ is OFF", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNEQ OFF\r"));
            }, 10);

            const result = await audyssey.getDynamicEQ();

            expect(result).toBe(false);
        });
    });

    describe("setDynamicVolume", () => {
        test("should send PSDYNVOL OFF command", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNVOL OFF\r"));
            }, 10);

            const result = await audyssey.setDynamicVolume("OFF");

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNVOL OFF\r");
            expect(result).toBe("OFF");
        });

        test("should send PSDYNVOL LIT command", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNVOL LIT\r"));
            }, 10);

            const result = await audyssey.setDynamicVolume("LIT");

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNVOL LIT\r");
            expect(result).toBe("LIT");
        });

        test("should reject invalid Dynamic Volume level", async () => {
            await expect(audyssey.setDynamicVolume("INVALID")).rejects.toThrow(
                "Invalid Dynamic Volume level",
            );
        });
    });

    describe("setReferenceLevel", () => {
        test("should send PSREFLEV 5 command", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSREFLEV 5\r"));
            }, 10);

            const result = await audyssey.setReferenceLevel(5);

            expect(mockSocket.write).toHaveBeenCalledWith("PSREFLEV 5\r");
            expect(result).toBe(5);
        });

        test("should reject invalid Reference Level", async () => {
            await expect(audyssey.setReferenceLevel(3)).rejects.toThrow(
                "Invalid Reference Level",
            );
        });
    });

    describe("toggleDynamicEQ", () => {
        test("should toggle from OFF to ON", async () => {
            const writtenCommands = [];

            // Mock responses for both query and set operations
            mockClient.on.mockImplementation((event, callback) => {
                if (event === "data") {
                    // Intercept write calls to trigger responses
                    const originalWrite = mockSocket.write;
                    mockSocket.write = jest.fn((cmd) => {
                        originalWrite.call(mockSocket, cmd);
                        writtenCommands.push(cmd);
                        setTimeout(() => {
                            if (cmd === "PSDYNEQ ?\r") {
                                // Query response
                                callback(Buffer.from("PSDYNEQ OFF\r"));
                            } else if (cmd === "PSDYNEQ ON\r") {
                                // Set ON response
                                callback(Buffer.from("PSDYNEQ ON\r"));
                            }
                        }, 5);
                    });
                }
            });

            const result = await audyssey.toggleDynamicEQ();

            expect(result).toBe(true);
            // Verify the correct sequence: query first, then set
            expect(writtenCommands[0]).toBe("PSDYNEQ ?\r");
            expect(writtenCommands[1]).toBe("PSDYNEQ ON\r");
        });
    });

    describe("getDynamicVolume", () => {
        test("should return OFF when Dynamic Volume is OFF", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNVOL OFF\r"));
            }, 10);

            const result = await audyssey.getDynamicVolume();

            expect(mockSocket.write).toHaveBeenCalledWith("PSDYNVOL ?\r");
            expect(result).toBe("OFF");
        });

        test("should return LIT when Dynamic Volume is Light", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNVOL LIT\r"));
            }, 10);

            const result = await audyssey.getDynamicVolume();
            expect(result).toBe("LIT");
        });

        test("should return HEV when Dynamic Volume is Heavy", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSDYNVOL HEV\r"));
            }, 10);

            const result = await audyssey.getDynamicVolume();
            expect(result).toBe("HEV");
        });
    });

    describe("getMultEQ", () => {
        test("should return current MultEQ mode", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSMULTEQ AUDYSSEY\r"));
            }, 10);

            const result = await audyssey.getMultEQ();

            expect(mockSocket.write).toHaveBeenCalledWith("PSMULTEQ ?\r");
            expect(result).toBe("AUDYSSEY");
        });
    });

    describe("setMultEQ", () => {
        test("should set MultEQ mode to FLAT", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSMULTEQ FLAT\r"));
            }, 10);

            const result = await audyssey.setMultEQ("FLAT");

            expect(mockSocket.write).toHaveBeenCalledWith("PSMULTEQ FLAT\r");
            expect(result).toBe("FLAT");
        });

        test("should handle BYP.LR mode correctly (case conversion)", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSMULTEQ BYP.LR\r"));
            }, 10);

            const result = await audyssey.setMultEQ("byp.lr");

            expect(mockSocket.write).toHaveBeenCalledWith("PSMULTEQ BYP.LR\r");
            expect(result).toBe("BYP.LR");
        });

        test("should reject invalid MultEQ mode", async () => {
            await expect(audyssey.setMultEQ("INVALID")).rejects.toThrow(
                "Invalid MultEQ mode",
            );
        });
    });

    describe("getReferenceLevel", () => {
        test("should return the current reference level", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSREFLEV 10\r"));
            }, 10);

            const result = await audyssey.getReferenceLevel();

            expect(mockSocket.write).toHaveBeenCalledWith("PSREFLEV ?\r");
            expect(result).toBe(10);
        });

        test("should throw on unexpected response", async () => {
            setTimeout(() => {
                const dataCallback = mockClient.on.mock.calls.find(
                    (call) => call[0] === "data",
                )[1];
                dataCallback(Buffer.from("PSREFLEV N/A\r"));
            }, 10);

            await expect(audyssey.getReferenceLevel()).rejects.toThrow(
                "Unexpected response for PSREFLEV",
            );
        });
    });

    describe("cleanup", () => {
        test("should remove all tracked listeners", () => {
            // Simulate adding listeners
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            audyssey._addListener(listener1);
            audyssey._addListener(listener2);

            expect(audyssey.activeListeners).toHaveLength(2);

            audyssey.cleanup();

            expect(audyssey.activeListeners).toHaveLength(0);
            expect(mockClient.removeListener).toHaveBeenCalledWith("data", listener1);
            expect(mockClient.removeListener).toHaveBeenCalledWith("data", listener2);
        });
    });

    describe("updateClient", () => {
        test("should clean up old client and switch to new client", () => {
            const listener = jest.fn();
            audyssey._addListener(listener);

            const newClient = {
                socket: mockSocket,
                on: jest.fn(),
                removeListener: jest.fn(),
            };

            audyssey.updateClient(newClient);

            // Old client should have listener removed
            expect(mockClient.removeListener).toHaveBeenCalledWith("data", listener);
            // New client should be set
            expect(audyssey.denonClient).toBe(newClient);
            expect(audyssey.activeListeners).toHaveLength(0);
        });
    });

    describe("socket validation", () => {
        test("should reject when socket is destroyed", async () => {
            mockSocket.destroyed = true;

            await expect(audyssey.getDynamicEQ()).rejects.toThrow(
                "Socket not connected",
            );
        });

        test("should reject when socket is null", async () => {
            mockClient.socket = null;

            await expect(audyssey.getDynamicEQ()).rejects.toThrow(
                "Socket not connected",
            );
        });

        test("should reject when socket is not writable", async () => {
            mockSocket.writable = false;

            await expect(audyssey.getDynamicEQ()).rejects.toThrow(
                "Socket not connected",
            );
        });
    });
});
