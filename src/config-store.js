"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Persistent key/value store backing the extension's config.json.
 *
 * Replaces node-roon-api's built-in save_config/load_config, which resolve
 * "config.json" relative to the working directory (through a Dockerfile
 * symlink in the container) and swallow every filesystem error. That silent
 * failure cost us the Roon pairing token in production: after a connection
 * drop the extension re-registered without a token, Roon treated it as a
 * brand-new extension instance, and the zone's volume/source control
 * bindings were lost until manually reconfigured.
 *
 * This store writes directly to the mounted data volume, writes atomically
 * (temp file + rename), and logs loudly when persistence fails.
 */
class ConfigStore {
    constructor(baseDir) {
        this.configPath = path.join(baseDir, "data", "config.json");
        this.legacyPath = path.join(baseDir, "config.json");
    }

    read() {
        for (const p of [this.configPath, this.legacyPath]) {
            try {
                return JSON.parse(fs.readFileSync(p, { encoding: "utf8" }));
            } catch (err) {
                if (err.code !== "ENOENT") {
                    console.error(
                        `[CONFIG_ERROR] Failed to read ${p}: ${err.message}`,
                    );
                }
            }
        }
        return {};
    }

    load(key) {
        return this.read()[key];
    }

    save(key, value) {
        const config = this.read();
        if (value === undefined || value === null) {
            delete config[key];
        } else {
            config[key] = value;
        }

        const tmpPath = this.configPath + ".tmp";
        try {
            fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
            fs.writeFileSync(tmpPath, JSON.stringify(config, null, "    "));
            fs.renameSync(tmpPath, this.configPath);
            return true;
        } catch (err) {
            console.error(
                `[CONFIG_ERROR] Failed to write ${this.configPath}: ${err.message}. ` +
                    "The Roon pairing token and settings will NOT survive a reconnect or restart, " +
                    "and Roon will drop the zone's volume/source control bindings. " +
                    "Make sure the data volume is writable by the container user.",
            );
            return false;
        }
    }
}

module.exports = ConfigStore;
