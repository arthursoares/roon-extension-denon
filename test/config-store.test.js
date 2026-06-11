"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const ConfigStore = require("../src/config-store");

describe("ConfigStore", () => {
    let baseDir;
    let store;
    let errorSpy;

    beforeEach(() => {
        baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-store-"));
        store = new ConfigStore(baseDir);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
        fs.rmSync(baseDir, { recursive: true, force: true });
    });

    test("load returns undefined when no config file exists", () => {
        expect(store.load("roonstate")).toBeUndefined();
    });

    test("save then load round-trips a value", () => {
        const state = { tokens: { "core-1": "token-1" } };
        expect(store.save("roonstate", state)).toBe(true);
        expect(store.load("roonstate")).toEqual(state);
    });

    test("save writes to data/config.json under the base directory", () => {
        store.save("settings", { hostname: "192.168.0.11" });
        const onDisk = JSON.parse(
            fs.readFileSync(path.join(baseDir, "data", "config.json"), "utf8"),
        );
        expect(onDisk.settings.hostname).toBe("192.168.0.11");
    });

    test("save preserves other keys", () => {
        store.save("settings", { hostname: "192.168.0.11" });
        store.save("roonstate", { tokens: { "core-1": "token-1" } });
        expect(store.load("settings")).toEqual({ hostname: "192.168.0.11" });
        expect(store.load("roonstate")).toEqual({
            tokens: { "core-1": "token-1" },
        });
    });

    test("save with null deletes the key", () => {
        store.save("settings", { hostname: "192.168.0.11" });
        store.save("settings", null);
        expect(store.load("settings")).toBeUndefined();
    });

    test("read falls back to legacy config.json", () => {
        fs.writeFileSync(
            path.join(baseDir, "config.json"),
            JSON.stringify({ roonstate: { tokens: { "core-1": "legacy" } } }),
        );
        expect(store.load("roonstate")).toEqual({
            tokens: { "core-1": "legacy" },
        });
    });

    test("data/config.json wins over legacy config.json", () => {
        fs.writeFileSync(
            path.join(baseDir, "config.json"),
            JSON.stringify({ settings: { hostname: "legacy" } }),
        );
        store.save("settings", { hostname: "current" });
        expect(store.load("settings")).toEqual({ hostname: "current" });
    });

    test("corrupt config file is reported and treated as empty", () => {
        fs.mkdirSync(path.join(baseDir, "data"), { recursive: true });
        fs.writeFileSync(path.join(baseDir, "data", "config.json"), "{not json");
        expect(store.load("settings")).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining("[CONFIG_ERROR] Failed to read"),
        );
    });

    test("save returns false and logs loudly when the volume is not writable", () => {
        fs.mkdirSync(path.join(baseDir, "data"), { mode: 0o555 });
        const result = store.save("roonstate", { tokens: {} });
        expect(result).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining("[CONFIG_ERROR] Failed to write"),
        );
    });
});
