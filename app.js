"use strict";

var debug = require("debug")("roon-extension-denon"),
    debug_keepalive = require("debug")("roon-extension-denon:keepalive"),
    debug_data = require("debug")("roon-extension-denon:data"),
    debug_roon = require("debug")("roon-extension-denon:roon"),
    Denon = require("./lib/denon-client"),
    RoonApi = require("node-roon-api"),
    RoonApiSettings = require("node-roon-api-settings"),
    RoonApiStatus = require("node-roon-api-status"),
    RoonApiVolumeControl = require("node-roon-api-volume-control"),
    RoonApiSourceControl = require("node-roon-api-source-control"),
    AudysseyControl = require("./src/audyssey-control"),
    fetch = require("node-fetch"),
    parse = require("fast-xml-parser");

var denon = {};

// Connection monitoring
var roon_connection = {
    connected: false,
    core_id: null,
    core_name: null,
    last_paired: null,
    last_unpaired: null,
    disconnect_count: 0,
    pair_count: 0,
};

var roon = new RoonApi({
    extension_id: "org.pruessmann.roon.denon",
    display_name: "Denon/Marantz AVR",
  display_version: "2026.02.05",
    publisher: "Doc Bobo",
    email: "docbobo@pm.me",
    website: "https://github.com/docbobo/roon-extension-denon",
    log_level: "all", // Enable full MOO protocol logging for diagnostics

    core_paired: function (core) {
        const now = new Date().toISOString();
        roon_connection.connected = true;
        roon_connection.core_id = core.core_id;
        roon_connection.core_name = core.display_name;
        roon_connection.last_paired = now;
        roon_connection.pair_count++;

        debug_roon(
            "ROON PAIRED: core_id=%s, name=%s, version=%s, pair_count=%d, timestamp=%s",
            core.core_id,
            core.display_name,
            core.display_version,
            roon_connection.pair_count,
            now,
        );

        // Log control registration state
        debug_roon(
            "ROON PAIRED: Controls status - volume_control=%s, source_control=%s",
            denon.volume_control ? "registered" : "not registered",
            denon.source_control ? "registered" : "not registered",
        );
    },

    core_unpaired: function (core) {
        const now = new Date().toISOString();
        const was_connected = roon_connection.connected;
        const time_connected = roon_connection.last_paired
            ? (new Date(now) - new Date(roon_connection.last_paired)) / 1000
            : 0;

        roon_connection.connected = false;
        roon_connection.last_unpaired = now;
        roon_connection.disconnect_count++;

        debug_roon(
            "ROON UNPAIRED: core_id=%s, name=%s, disconnect_count=%d, time_connected=%ds, timestamp=%s",
            core.core_id,
            core.display_name,
            roon_connection.disconnect_count,
            Math.round(time_connected),
            now,
        );

        // Log control status at time of disconnect
        debug_roon(
            "ROON UNPAIRED: Controls status - volume_control=%s, source_control=%s, denon_connection=%s",
            denon.volume_control ? "was registered" : "not registered",
            denon.source_control ? "was registered" : "not registered",
            denon.client ? "connected" : "disconnected",
        );

        // Warn if disconnecting frequently
        if (roon_connection.disconnect_count > 5 && time_connected < 120) {
            debug_roon(
                "ROON UNPAIRED WARNING: Frequent disconnections detected (%d disconnects, last connection only %ds). Check network stability and logs for 'MOO: empty message received'.",
                roon_connection.disconnect_count,
                Math.round(time_connected),
            );
        }
    },
});

var mysettings = roon.load_config("settings") || {
    hostname: "",
    setsource: "",
    zone: "main",
    powerOffBothZones: true,
    maxVolumeMode: "dynamic",
    audyssey: {
        dynamicEQ: false,
        dynamicVolume: "OFF",
        referenceLevel: 5,
    },
};

function make_layout(settings) {
    var l = {
        values: settings,
        layout: [],
        has_error: false,
    };

    l.layout.push({
        type: "string",
        title: "Host name or IP Address",
        subtitle: "The IP address or hostname of the Denon/Marantz receiver.",
        maxlength: 256,
        setting: "hostname",
    });

    l.layout.push({
        type: "dropdown",
        title: "Zone",
        subtitle:
            "Select which zone to control. Note: Zone 2 supports power control only, not volume control.",
        values: [
            { title: "Main Zone", value: "main" },
            { title: "Zone 2 (Power Only)", value: "zone2" },
        ],
        setting: "zone",
    });

    l.layout.push({
        type: "dropdown",
        title: "Power Off Behavior",
        subtitle:
            "When powering off, turn off both zones or just the selected zone",
        values: [
            { title: "Turn off both zones", value: true },
            { title: "Turn off selected zone only", value: false },
        ],
        setting: "powerOffBothZones",
    });

    l.layout.push({
        type: "dropdown",
        title: "Maximum Volume Control",
        subtitle:
            "Dynamic: use receiver's max volume setting. Fixed: cap at 0 dB regardless of receiver setting",
        values: [
            { title: "Dynamic (use receiver setting)", value: "dynamic" },
            { title: "Fixed at 0 dB", value: "fixed" },
        ],
        setting: "maxVolumeMode",
    });

    // Audyssey Settings Section
    if (settings.hostname && !settings.err) {
        l.layout.push({
            type: "group",
            title: "Audyssey Settings",
            items: [
                {
                    type: "dropdown",
                    title: "Dynamic EQ",
                    subtitle:
                        "Audyssey Dynamic EQ adjusts frequency response for better sound at low volumes",
                    values: [
                        { title: "Off", value: false },
                        { title: "On", value: true },
                    ],
                    setting: "audyssey.dynamicEQ",
                },
                {
                    type: "dropdown",
                    title: "Dynamic Volume",
                    subtitle:
                        "Audyssey Dynamic Volume maintains consistent volume levels",
                    values: [
                        { title: "Off", value: "OFF" },
                        { title: "Light", value: "LIT" },
                        { title: "Medium", value: "MED" },
                        { title: "Heavy", value: "HEV" },
                    ],
                    setting: "audyssey.dynamicVolume",
                },
                {
                    type: "dropdown",
                    title: "Reference Level Offset",
                    subtitle:
                        "Adjusts the reference level for Audyssey calibration",
                    values: [
                        { title: "0 dB", value: 0 },
                        { title: "5 dB", value: 5 },
                        { title: "10 dB", value: 10 },
                        { title: "15 dB", value: 15 },
                    ],
                    setting: "audyssey.referenceLevel",
                },
            ],
        });
    }

    if (settings.err) {
        l.has_error = true;
        l.layout.push({
            type: "status",
            title: settings.err,
        });
    } else {
        l.has_error = false;
        if (settings.hostname) {
            l.layout.push({
                type: "dropdown",
                title: "Input",
                values: settings.inputs,
                setting: "setsource",
            });
        }
    }
    return l;
}

var svc_settings = new RoonApiSettings(roon, {
    get_settings: function (cb) {
        probeInputs(mysettings).then((settings) => {
            cb(make_layout(settings));
        });
    },
    save_settings: function (req, isdryrun, settings) {
        probeInputs(settings.values)
            .then((settings) => {
                let l = make_layout(settings);

                // Bug #8 fix: Explicitly check for errors BEFORE sending response
                // This ensures we never save settings if probe failed
                if (l.has_error) {
                    debug("save_settings: Validation failed, not saving settings: %s", settings.err);
                    req.send_complete("NotValid", { settings: l });
                    return; // Early return prevents saving
                }

                req.send_complete("Success", { settings: l });
                delete settings.inputs;

                if (!isdryrun) {
                var old_hostname = mysettings.hostname;
                var old_setsource = mysettings.setsource;
                var old_zone = mysettings.zone;
                var old_powerOffBothZones = mysettings.powerOffBothZones;
                var old_maxVolumeMode = mysettings.maxVolumeMode;
                var old_audyssey = JSON.parse(
                    JSON.stringify(mysettings.audyssey || {}),
                );

                // Extract Audyssey settings from flat properties (Roon API behavior)
                const new_audyssey = {
                    dynamicEQ:
                        l.values["audyssey.dynamicEQ"] !== undefined
                            ? l.values["audyssey.dynamicEQ"]
                            : l.values.audyssey
                              ? l.values.audyssey.dynamicEQ
                              : false,
                    dynamicVolume:
                        l.values["audyssey.dynamicVolume"] !== undefined
                            ? l.values["audyssey.dynamicVolume"]
                            : l.values.audyssey
                              ? l.values.audyssey.dynamicVolume
                              : "OFF",
                    referenceLevel:
                        l.values["audyssey.referenceLevel"] !== undefined
                            ? l.values["audyssey.referenceLevel"]
                            : l.values.audyssey
                              ? l.values.audyssey.referenceLevel
                              : 5,
                };

                debug(
                    "Audyssey settings extracted from UI: dynamicEQ=%s, dynamicVolume=%s, referenceLevel=%s",
                    new_audyssey.dynamicEQ,
                    new_audyssey.dynamicVolume,
                    new_audyssey.referenceLevel,
                );

                mysettings = l.values;
                // Store Audyssey settings in nested format for persistence
                mysettings.audyssey = new_audyssey;
                svc_settings.update_settings(l);

                // Check if connection settings changed
                if (
                    old_hostname != mysettings.hostname ||
                    old_setsource != mysettings.setsource ||
                    old_zone != mysettings.zone ||
                    old_powerOffBothZones != mysettings.powerOffBothZones ||
                    old_maxVolumeMode != mysettings.maxVolumeMode
                ) {
                    setup_denon_connection(mysettings.hostname);
                }

                // Check if Audyssey settings changed and apply them serially (only if receiver is ON)
                if (denon.audyssey) {
                    // Check if receiver is powered on before trying to apply Audyssey settings
                    const receiverIsOn = denon.source_state && denon.source_state.Power === "ON";

                    if (!receiverIsOn) {
                        debug(
                            "Audyssey: Settings changed but receiver is in STANDBY - changes will be applied when receiver turns on",
                        );
                    } else {
                        let audysseyPromise = Promise.resolve();

                        if (old_audyssey.dynamicEQ !== new_audyssey.dynamicEQ) {
                            debug(
                                "Audyssey: Dynamic EQ changed from %s to %s - applying to receiver",
                                old_audyssey.dynamicEQ,
                                new_audyssey.dynamicEQ,
                            );
                            audysseyPromise = audysseyPromise.then(() =>
                                denon.audyssey
                                    .setDynamicEQ(new_audyssey.dynamicEQ)
                                    .then(() => {
                                        debug(
                                            "Audyssey: Dynamic EQ successfully set to %s",
                                            new_audyssey.dynamicEQ,
                                        );
                                    })
                                    .catch((err) => {
                                        debug(
                                            "Audyssey: Failed to set Dynamic EQ: %O",
                                            err,
                                        );
                                    }),
                            );
                        }
                        if (
                            old_audyssey.dynamicVolume !==
                            new_audyssey.dynamicVolume
                        ) {
                            debug(
                                "Audyssey: Dynamic Volume changed from %s to %s - applying to receiver",
                                old_audyssey.dynamicVolume,
                                new_audyssey.dynamicVolume,
                            );
                            audysseyPromise = audysseyPromise.then(() =>
                                denon.audyssey
                                    .setDynamicVolume(new_audyssey.dynamicVolume)
                                    .then(() => {
                                        debug(
                                            "Audyssey: Dynamic Volume successfully set to %s",
                                            new_audyssey.dynamicVolume,
                                        );
                                    })
                                    .catch((err) => {
                                        debug(
                                            "Audyssey: Failed to set Dynamic Volume: %O",
                                            err,
                                        );
                                    }),
                            );
                        }
                        if (
                            old_audyssey.referenceLevel !==
                            new_audyssey.referenceLevel
                        ) {
                            debug(
                                "Audyssey: Reference Level changed from %s to %s - applying to receiver",
                                old_audyssey.referenceLevel,
                                new_audyssey.referenceLevel,
                            );
                            audysseyPromise = audysseyPromise.then(() =>
                                denon.audyssey
                                    .setReferenceLevel(new_audyssey.referenceLevel)
                                    .then(() => {
                                        debug(
                                            "Audyssey: Reference Level successfully set to %s",
                                            new_audyssey.referenceLevel,
                                        );
                                    })
                                    .catch((err) => {
                                        debug(
                                            "Audyssey: Failed to set Reference Level: %O",
                                            err,
                                        );
                                    }),
                            );
                        }

                        // Bug #2 fix: Track promise completion and log final result
                        audysseyPromise
                            .then(() => {
                                debug("Audyssey: All settings applied successfully");
                            })
                            .catch((err) => {
                                debug("Audyssey: Error applying settings: %O", err);
                            });
                    }
                } else {
                    debug(
                        "Audyssey: Client not initialized, cannot apply settings",
                    );
                }

                debug("Saving settings to config file");
                roon.save_config("settings", mysettings);
            }
        })
        .catch((err) => {
            // Bug #8 fix: Catch any unexpected errors during save process
            debug("save_settings: Unexpected error during save: %O", err);
            settings.values.err = "Internal error: " + err.message;
            let l = make_layout(settings.values);
            req.send_complete("NotValid", { settings: l });
        });
    },
});

var svc_status = new RoonApiStatus(roon);
var svc_volume_control = new RoonApiVolumeControl(roon);
var svc_source_control = new RoonApiSourceControl(roon);

roon.init_services({
    provided_services: [
        svc_status,
        svc_settings,
        svc_volume_control,
        svc_source_control,
    ],
});

function probeInputs(settings) {
    let inputs = (
        settings.hostname
            ? queryInputs(settings.hostname).then((inputs) => {
                  delete settings.err;
                  settings.inputs = inputs;
              })
            : Promise.resolve()
    )

        .catch((err) => {
            settings.err = err.message;
        })
        .then(() => {
            return settings;
        });
    return inputs;
}

function queryInputs(hostname) {
    return Promise.resolve(
        Object.keys(Denon.Options.InputOptions)
            .filter((title) => title != "Status")
            .sort()
            .map((title) => {
                return { title, value: Denon.Options.InputOptions[title] };
            }),
    );
}

function setup_denon_connection(host) {
    debug("setup_denon_connection (" + host + ")");

    if (denon.keepalive) {
        clearInterval(denon.keepalive);
        denon.keepalive = null;
    }
    if (denon.audyssey) {
        // Clean up audyssey instance
        denon.audyssey.cleanup();
        delete denon.audyssey;
    }
    if (denon.client) {
        // Bug #4 fix: Destroy socket explicitly to ensure all listeners are removed
        // removeAllListeners() may not remove listeners if socket is actively emitting
        if (denon.client.socket && !denon.client.socket.destroyed) {
            debug("setup_denon_connection: Destroying socket to prevent listener leaks");
            denon.client.socket.destroy();
        }

        // Remove all event listeners to prevent memory leaks
        denon.client.removeAllListeners();
        denon.client.socket.removeAllListeners();
        denon.client.disconnect();
        delete denon.client;
    }

    if (!host) {
        svc_status.set_status("Not configured, please check settings.", true);
    } else {
        debug("Connecting to receiver...");
        svc_status.set_status("Connecting to " + host + "...", false);

        denon.client = new Denon.DenonClient(host);

        // Increase max listeners to prevent warnings from keep-alive once() listeners
        // These are legitimate temporary listeners that clean up after themselves
        denon.client.setMaxListeners(20);

        denon.client.socket.setTimeout(0);
        denon.client.socket.setKeepAlive(true, 10000);

        denon.client.socket.on("error", (error) => {
            // Handler for debugging purposes. No need to reconnect since the event will be followed by a close event,
            // according to documentation.
            debug("Received onError(%O)", error);
        });

        // Track repetitive messages to reduce log spam
        let lastDataMessage = null;
        let dataMessageCount = 0;

        denon.client.on("data", (data) => {
            // Filter out repetitive status messages that create log spam
            const isRepetitiveMessage =
                data === "SSAST CMP" || // Audyssey status (~every 100ms)
                data === "PWSTANDBY" || // Power standby echo
                data === "PWON"; // Power on echo

            if (data === lastDataMessage) {
                dataMessageCount++;
                // Don't log repetitive messages while they're repeating
                // We'll log a summary when the pattern changes
            } else {
                // New message - log summary of previous message if it repeated
                if (dataMessageCount > 1 && lastDataMessage) {
                    debug_data(
                        "RAW: Previous message repeated %d times total",
                        dataMessageCount,
                    );
                }
                lastDataMessage = data;
                dataMessageCount = 1;

                // Log non-repetitive messages or first occurrence
                if (!isRepetitiveMessage) {
                    debug_data("RAW: %s", data);
                }
            }
        });

        denon.client.socket.on("timeout", () => {
            debug("Received onTimeout(): Closing connection...");
            denon.client.disconnect();
        });

        denon.client.on("close", (had_error) => {
            debug(
                "LIFECYCLE: Connection closed - had_error=%s, source_control_exists=%s, volume_control_exists=%s",
                had_error,
                !!denon.source_control,
                !!denon.volume_control,
            );

            if (denon.client) {
                svc_status.set_status(
                    "Connection closed by receiver. Reconnecting...",
                    true,
                );
                debug(
                    "LIFECYCLE: Scheduling reconnection in 1 second... (will recreate client to prevent memory leaks)",
                );
                setTimeout(() => {
                    debug("LIFECYCLE: Executing reconnection attempt - calling setup_denon_connection to clean up and recreate client");
                    setup_denon_connection(mysettings.hostname);
                }, 1000);
            } else {
                debug(
                    "LIFECYCLE: Client was destroyed, not reconnecting. Setting not configured status.",
                );
                svc_status.set_status(
                    "Not configured, please check settings.",
                    true,
                );
            }
        });

        denon.client.on("powerChanged", (val) => {
            debug("EVENT: powerChanged: val=%s", val);

            // Guard against early events before state is initialized (Bug #6 fix)
            if (!denon.source_state) {
                debug("powerChanged: Ignoring event (source_state not initialized yet)");
                return;
            }

            let old_power_value = denon.source_state.Power;
            denon.source_state.Power = val;
            debug(
                "powerChanged: old_power=%s, new_power=%s, input=%s, source_control_exists=%s",
                old_power_value,
                denon.source_state.Power,
                denon.source_state.Input,
                !!denon.source_control,
            );

            if (old_power_value != denon.source_state.Power) {
                let stat = check_status(
                    denon.source_state.Power,
                    denon.source_state.Input,
                );
                debug(
                    "powerChanged: Power changed, new status would be=%s",
                    stat,
                );

                // Only report to Roon if status is NOT "deselected"
                // This prevents manual input changes from disrupting Roon's source control
                if (stat !== "deselected") {
                    debug(
                        "powerChanged: Updating source_control with status=%s",
                        stat,
                    );
                    if (denon.source_control) {
                        denon.source_control.update_state({ status: stat });
                        debug("powerChanged: update_state called successfully");
                    } else {
                        debug(
                            "powerChanged: WARNING - source_control is null/undefined, cannot update state",
                        );
                    }
                } else {
                    debug(
                        "powerChanged: Skipping update to Roon (status is 'deselected', keeping source control active)",
                    );
                }
            } else {
                debug(
                    "powerChanged: Power unchanged (%s), no update needed",
                    denon.source_state.Power,
                );
            }
        });

        denon.client.on("inputChanged", (val) => {
            debug("EVENT: inputChanged: val=%s", val);

            // Guard against early events before state is initialized (Bug #6 fix)
            if (!denon.source_state) {
                debug("inputChanged: Ignoring event (source_state not initialized yet)");
                return;
            }

            let old_Input = denon.source_state.Input;
            denon.source_state.Input = val;
            debug(
                "inputChanged: old_input=%s, new_input=%s, power=%s, configured_source=%s, source_control_exists=%s",
                old_Input,
                denon.source_state.Input,
                denon.source_state.Power,
                mysettings.setsource,
                !!denon.source_control,
            );

            if (old_Input != denon.source_state.Input) {
                let stat = check_status(
                    denon.source_state.Power,
                    denon.source_state.Input,
                );
                debug(
                    "inputChanged: Input changed, new status would be=%s",
                    stat,
                );

                // Only report to Roon if status is NOT "deselected"
                // This prevents manual input changes from disrupting Roon's source control
                if (stat !== "deselected") {
                    debug(
                        "inputChanged: Updating source_control with status=%s",
                        stat,
                    );
                    if (denon.source_control) {
                        denon.source_control.update_state({ status: stat });
                        debug("inputChanged: update_state called successfully");
                    } else {
                        debug(
                            "inputChanged: WARNING - source_control is null/undefined, cannot update state",
                        );
                    }
                } else {
                    debug(
                        "inputChanged: Skipping update to Roon (status is 'deselected', keeping source control active)",
                    );
                }
            } else {
                debug(
                    "inputChanged: Input unchanged (%s), no update needed",
                    denon.source_state.Input,
                );
            }
        });

        denon.client.on("muteChanged", (val) => {
            debug("muteChanged: val=%s", val);

            // Guard against early events before state is initialized (Bug #6 fix)
            if (!denon.volume_state) {
                debug("muteChanged: Ignoring event (volume_state not initialized yet)");
                return;
            }

            denon.volume_state.is_muted = val === Denon.Options.MuteOptions.On;
            if (denon.volume_control) {
                denon.volume_control.update_state({
                    is_muted: denon.volume_state.is_muted,
                });
            }
        });

        denon.client.on("masterVolumeChanged", (val) => {
            debug("masterVolumeChanged: val=%s", val - 80);

            // Guard against early events before state is initialized (Bug #6 fix)
            if (!denon.volume_state) {
                debug("masterVolumeChanged: Ignoring event (volume_state not initialized yet)");
                return;
            }

            denon.volume_state.volume_value = val - 80;
            if (denon.volume_control) {
                denon.volume_control.update_state({
                    volume_value: denon.volume_state.volume_value,
                });
            }
        });

        denon.client.on("masterVolumeMaxChanged", (val) => {
            const newMaxVolume = val - 80;
            debug(
                "masterVolumeMaxChanged: val=%s (current=%s, mode=%s)",
                newMaxVolume,
                denon.volume_state.volume_max,
                mysettings.maxVolumeMode,
            );

            // Ignore receiver updates when in fixed mode
            if (mysettings.maxVolumeMode === "fixed") {
                debug(
                    "masterVolumeMaxChanged: Ignoring receiver update (fixed mode at 0 dB)",
                );
                return;
            }

            // Only update Roon if the value actually changed (dynamic mode)
            if (denon.volume_state.volume_max !== newMaxVolume) {
                debug(
                    "masterVolumeMaxChanged: Value changed from %s to %s - updating Roon",
                    denon.volume_state.volume_max,
                    newMaxVolume,
                );
                denon.volume_state.volume_max = newMaxVolume;
                if (denon.volume_control) {
                    denon.volume_control.update_state({
                        volume_max: denon.volume_state.volume_max,
                    });
                }
            } else {
                debug(
                    "masterVolumeMaxChanged: Value unchanged, skipping Roon update",
                );
            }
        });

        denon.client.on("zone2Changed", (val) => {
            debug("EVENT: zone2Changed: val=%s", val);

            if (mysettings.zone === "zone2") {
                // Guard against early events before state is initialized (Bug #6 fix)
                if (!denon.source_state) {
                    debug("zone2Changed: Ignoring event (source_state not initialized yet)");
                    return;
                }

                let old_power_value = denon.source_state.Power;
                denon.source_state.Power =
                    val === Denon.Options.Zone2Options.On ? "ON" : "STANDBY";
                debug(
                    "zone2Changed: old_power=%s, new_power=%s, input=%s, source_control_exists=%s",
                    old_power_value,
                    denon.source_state.Power,
                    denon.source_state.Input,
                    !!denon.source_control,
                );

                if (old_power_value != denon.source_state.Power) {
                    let stat = check_status(
                        denon.source_state.Power,
                        denon.source_state.Input,
                    );
                    debug(
                        "zone2Changed: Zone2 power changed, new status would be=%s",
                        stat,
                    );

                    // Only report to Roon if status is NOT "deselected"
                    // This prevents manual input changes from disrupting Roon's source control
                    if (stat !== "deselected") {
                        debug(
                            "zone2Changed: Updating source_control with status=%s",
                            stat,
                        );
                        if (denon.source_control) {
                            denon.source_control.update_state({ status: stat });
                            debug("zone2Changed: update_state called successfully");
                        } else {
                            debug(
                                "zone2Changed: WARNING - source_control is null/undefined, cannot update state",
                            );
                        }
                    } else {
                        debug(
                            "zone2Changed: Skipping update to Roon (status is 'deselected', keeping source control active)",
                        );
                    }
                } else {
                    debug(
                        "zone2Changed: Zone2 power unchanged (%s), no update needed",
                        denon.source_state.Power,
                    );
                }
            } else {
                debug(
                    "zone2Changed: Ignoring event (configured zone is %s)",
                    mysettings.zone,
                );
            }
        });

        denon.keepalive = setInterval(() => {
            // Skip keep-alive if receiver is in standby (prevents listener accumulation)
            if (denon.source_state && denon.source_state.Power === "STANDBY") {
                debug_keepalive("Keep-Alive: Skipping (receiver in standby)");
                return;
            }

            // Make regular calls to getBrightness for keep-alive.
            denon.client.getBrightness()
                .then((val) => {
                    debug_keepalive("Keep-Alive: getBrightness == %s", val);
                })
                .catch((err) => {
                    debug_keepalive("Keep-Alive: getBrightness failed: %O", err);
                });
        }, 60000);

        connect();
    }
}

function connect() {
    debug(
        "LIFECYCLE: connect() called - zone=%s, setsource=%s, existing_source_control=%s, existing_volume_control=%s",
        mysettings.zone,
        mysettings.setsource,
        !!denon.source_control,
        !!denon.volume_control,
    );

    denon.client
        .connect()
        .then(() => {
            debug("LIFECYCLE: Connection established to receiver");

            // Clean up old Audyssey instance before creating new one (prevents memory leak during reconnections)
            if (denon.audyssey) {
                debug("LIFECYCLE: Cleaning up old Audyssey instance before creating new one");
                denon.audyssey.cleanup();
                delete denon.audyssey;
            }

            // Initialize Audyssey control
            denon.audyssey = new AudysseyControl(denon.client);
            debug("Audyssey control initialized");

            // Only create volume control for Main Zone
            if (mysettings.zone === "main") {
                debug(
                    "LIFECYCLE: Creating volume control for Main Zone (if not exists)",
                );
                return create_volume_control(denon);
            } else {
                debug(
                    "LIFECYCLE: Skipping volume control (zone=%s)",
                    mysettings.zone,
                );
                return Promise.resolve();
            }
        })
        .then(() => {
            if (mysettings.setsource) {
                debug(
                    "LIFECYCLE: Creating source control for source=%s (if not exists)",
                    mysettings.setsource,
                );
                return create_source_control(denon);
            } else {
                debug("LIFECYCLE: No source configured, skipping source control");
                return Promise.resolve();
            }
        })
        .then(() => {
            // Apply saved Audyssey settings after connection (only if receiver is ON)
            if (denon.audyssey && mysettings.audyssey && denon.source_state && denon.source_state.Power === "ON") {
                debug("LIFECYCLE: Applying saved Audyssey settings (receiver is ON)");
                return apply_audyssey_settings();
            } else if (denon.source_state && denon.source_state.Power === "STANDBY") {
                debug("LIFECYCLE: Skipping Audyssey settings (receiver is in STANDBY)");
            } else {
                debug("LIFECYCLE: No Audyssey settings to apply");
            }
            return Promise.resolve();
        })
        .then(() => {
            const zoneInfo =
                mysettings.zone === "zone2" ? " (Zone 2 - Power Only)" : "";
            svc_status.set_status("Connected to receiver" + zoneInfo, false);
            debug(
                "LIFECYCLE: Connection setup complete - source_control_exists=%s, volume_control_exists=%s",
                !!denon.source_control,
                !!denon.volume_control,
            );
        })
        .catch((error) => {
            debug(
                "LIFECYCLE: Connection error during setup. Error: %O. Will not retry automatically from here.",
                error,
            );
            svc_status.set_status("Could not connect receiver: " + error, true);
        });
}

function apply_audyssey_settings() {
    debug(
        "Audyssey: Applying all settings - dynamicEQ=%s, dynamicVolume=%s, referenceLevel=%s",
        mysettings.audyssey.dynamicEQ,
        mysettings.audyssey.dynamicVolume,
        mysettings.audyssey.referenceLevel,
    );

    return denon.audyssey
        .setDynamicEQ(mysettings.audyssey.dynamicEQ)
        .then(() => {
            debug(
                "Audyssey: Dynamic EQ applied: %s",
                mysettings.audyssey.dynamicEQ,
            );
            return denon.audyssey.setDynamicVolume(
                mysettings.audyssey.dynamicVolume,
            );
        })
        .then(() => {
            debug(
                "Audyssey: Dynamic Volume applied: %s",
                mysettings.audyssey.dynamicVolume,
            );
            return denon.audyssey.setReferenceLevel(
                mysettings.audyssey.referenceLevel,
            );
        })
        .then(() => {
            debug(
                "Audyssey: Reference Level applied: %s",
                mysettings.audyssey.referenceLevel,
            );
            debug("Audyssey: All settings applied successfully");
        })
        .catch((error) => {
            debug("Audyssey: Error applying settings: %O", error);
            // Don't fail connection if Audyssey settings fail
        });
}

function check_status(power, input) {
    let stat = "";
    if (power == "ON") {
        if (input == mysettings.setsource) {
            stat = "selected";
        } else {
            // Bug #10 fix: Use "deselected" when power is ON but wrong input
            // "standby" means device is OFF, "deselected" means device is ON but not active
            stat = "deselected";
        }
    } else {
        stat = "standby";
    }
    debug(
        "check_status: power=%s, input=%s, configured_source=%s => status=%s",
        power,
        input,
        mysettings.setsource,
        stat,
    );
    return stat;
}

// Zone-specific helper functions
function getPowerForZone() {
    if (mysettings.zone === "zone2") {
        return denon.client.getZone2().then((status) => {
            return status === Denon.Options.Zone2Options.On ? "ON" : "STANDBY";
        });
    } else {
        return denon.client.getPower();
    }
}

function setPowerForZone(powerState) {
    if (mysettings.zone === "zone2") {
        const zone2State =
            powerState === "ON"
                ? Denon.Options.Zone2Options.On
                : Denon.Options.Zone2Options.Off;
        return denon.client.setZone2(zone2State);
    } else {
        return denon.client.setPower(powerState);
    }
}

function setPowerBothZones(powerState) {
    debug("setPowerBothZones: powerState=%s", powerState);

    if (mysettings.powerOffBothZones && powerState === "STANDBY") {
        // Turn off both zones when powering off
        const mainZonePromise = denon.client.setPower("STANDBY");
        const zone2Promise = denon.client.setZone2(
            Denon.Options.Zone2Options.Off,
        );

        return Promise.all([mainZonePromise, zone2Promise])
            .then(() => {
                debug("Both zones powered off successfully");
            })
            .catch((error) => {
                debug("Error powering off both zones: %O", error);
                throw error;
            });
    } else {
        // Use zone-specific power control
        return setPowerForZone(powerState);
    }
}

function create_volume_control(denon) {
    debug("create_volume_control: volume_control=%o", denon.volume_control);
    if (!denon.volume_control) {
        denon.volume_state = {
            display_name: mysettings.zone === "zone2" ? "Zone 2" : "Main Zone",
            volume_type: "db",
            volume_min: -79.5,
            volume_step: 0.5,
        };

        var device = {
            state: denon.volume_state,
            control_key: 1,

            set_volume: function (req, mode, value) {
                debug("set_volume: mode=%s value=%d", mode, value);

                let newvol =
                    mode == "absolute" ? value : this.state.volume_value + value;
                if (newvol < this.state.volume_min)
                    newvol = this.state.volume_min;
                else if (newvol > this.state.volume_max)
                    newvol = this.state.volume_max;

                denon.client
                    .setVolume(newvol + 80)
                    .then(() => {
                        debug("set_volume: Succeeded.");
                        req.send_complete("Success");
                    })
                    .catch((error) => {
                        debug("set_volume: Failed with error: %O", error);
                        req.send_complete("Failed");
                    });
            },
            set_mute: function (req, inAction) {
                debug("set_mute: action=%s", inAction);

                const action = !this.state.is_muted ? "on" : "off";
                denon.client
                    .setMute(
                        action === "on"
                            ? Denon.Options.MuteOptions.On
                            : Denon.Options.MuteOptions.Off,
                    )
                    .then(() => {
                        debug("set_mute: Succeeded.");

                        req.send_complete("Success");
                    })
                    .catch((error) => {
                        debug("set_mute: Failed with error: %O", error);
                        req.send_complete("Failed");
                    });
            },
        };
    }
    let result = denon.client
        .getVolume()
        .then((val) => {
            denon.volume_state.volume_value = val - 80;

            // Handle max volume based on mode
            if (mysettings.maxVolumeMode === "fixed") {
                debug("create_volume_control: Using fixed max volume of 0 dB");
                denon.volume_state.volume_max = 0;
                return Promise.resolve();
            } else {
                debug(
                    "create_volume_control: Querying receiver for max volume (dynamic mode)",
                );
                return denon.client.getMaxVolume().then((val) => {
                    denon.volume_state.volume_max = val - 80;
                    debug(
                        "create_volume_control: Receiver max volume: %s dB",
                        denon.volume_state.volume_max,
                    );
                });
            }
        })
        .then(() => {
            return denon.client.getMute();
        })
        .then((val) => {
            denon.volume_state.is_muted = val === Denon.Options.MuteOptions.On;
            if (denon.volume_control) {
                denon.volume_control.update_state(denon.volume_state);
            } else {
                debug("Registering volume control extension");
                debug_roon(
                    "CONTROL REGISTRATION: Volume control being registered with Roon - display_name=%s, volume=%s dB, muted=%s, roon_connected=%s",
                    denon.volume_state.display_name,
                    denon.volume_state.volume_value,
                    denon.volume_state.is_muted,
                    roon_connection.connected,
                );
                denon.volume_control = svc_volume_control.new_device(device);
                debug_roon(
                    "CONTROL REGISTRATION: Volume control registered successfully - control_key=%s",
                    device.control_key,
                );
            }
        });
    return result;
}

function create_source_control(denon) {
    debug(
        "create_source_control: ENTRY - source_control_exists=%s, zone=%s, configured_source=%s",
        !!denon.source_control,
        mysettings.zone,
        mysettings.setsource,
    );

    if (!denon.source_control) {
        debug("create_source_control: Initializing new source_state object");
        denon.source_state = {
            display_name: mysettings.zone === "zone2" ? "Zone 2" : "Main Zone",
            supports_standby: true,
            status: "",
            Power: "",
            Input: "",
        };

        var device = {
            state: denon.source_state,
            control_key: 2,

            convenience_switch: function (req) {
                debug(
                    "convenience_switch: CALLED by Roon - current Power=%s, Input=%s, target source=%s, zone=%s",
                    denon.source_state.Power,
                    denon.source_state.Input,
                    mysettings.setsource,
                    mysettings.zone,
                );

                const powerWasStandby = denon.source_state.Power === "STANDBY";
                const inputNeedsChange =
                    denon.source_state.Input !== mysettings.setsource;

                debug(
                    "convenience_switch: powerWasStandby=%s, inputNeedsChange=%s",
                    powerWasStandby,
                    inputNeedsChange,
                );

                // Start the power-on sequence if needed
                const powerOnPromise = powerWasStandby
                    ? setPowerForZone("ON").then(() => {
                          debug(
                              "convenience_switch: Power turned on, waiting 12 seconds for receiver to be ready",
                          );
                          // Wait for receiver to be fully powered on and initialized before applying Audyssey
                          // Receiver sends multiple PWON messages and initialization takes ~12s
                          return new Promise((resolve) => setTimeout(resolve, 12000));
                      })
                    : Promise.resolve();

                // Only apply Audyssey settings if we're actually making a change
                // (turning on from standby or switching input)
                const shouldApplyAudyssey = powerWasStandby || inputNeedsChange;
                debug(
                    "convenience_switch: shouldApplyAudyssey=%s",
                    shouldApplyAudyssey,
                );

                const applyAudyssey = () =>
                    shouldApplyAudyssey && denon.audyssey && mysettings.audyssey
                        ? powerOnPromise.then(() => {
                              debug(
                                  "convenience_switch: Applying Audyssey settings (receiver should be ready)",
                              );
                              return apply_audyssey_settings();
                          })
                        : powerOnPromise;

                if (inputNeedsChange) {
                    debug(
                        "convenience_switch: Switching input to %s",
                        mysettings.setsource,
                    );
                    denon.client
                        .setInput(mysettings.setsource)
                        .then(() => {
                            debug(
                                "convenience_switch: Input switched successfully",
                            );
                            return applyAudyssey();
                        })
                        .then(() => {
                            debug("convenience_switch: Completed successfully");
                            req.send_complete("Success");
                        })
                        .catch((error) => {
                            debug(
                                "convenience_switch: Failed with error: %O",
                                error,
                            );
                            req.send_complete("Failed");
                        });
                } else {
                    // Already on correct input
                    if (shouldApplyAudyssey) {
                        debug(
                            "convenience_switch: Already on correct input, applying Audyssey after power-on delay",
                        );
                        applyAudyssey()
                            .then(() => {
                                debug(
                                    "convenience_switch: Completed successfully (input correct, power on, Audyssey applied)",
                                );
                                req.send_complete("Success");
                            })
                            .catch((err) => {
                                // Bug #7 fix: Log Audyssey errors explicitly but still report success
                                // Primary operation (power on) succeeded, Audyssey is secondary
                                debug(
                                    "convenience_switch: WARNING - Audyssey settings failed to apply: %O",
                                    err,
                                );
                                debug(
                                    "convenience_switch: Primary operation succeeded (power on), reporting Success despite Audyssey failure",
                                );
                                req.send_complete("Success");
                            });
                    } else {
                        debug(
                            "convenience_switch: Already on correct input and power ON, no action needed",
                        );
                        req.send_complete("Success");
                    }
                }
            },
            standby: function (req) {
                debug(
                    "standby: CALLED - getting current power state for zone=%s",
                    mysettings.zone,
                );
                getPowerForZone().then((val) => {
                    const newPowerState = val === "STANDBY" ? "ON" : "STANDBY";
                    debug(
                        "standby: Current power=%s, toggling to %s (powerOffBothZones=%s)",
                        val,
                        newPowerState,
                        mysettings.powerOffBothZones,
                    );
                    setPowerBothZones(newPowerState)
                        .then(() => {
                            debug("standby: Power state changed successfully");
                            req.send_complete("Success");
                        })
                        .catch((error) => {
                            debug("standby: Failed with error: %O", error);
                            req.send_complete("Failed");
                        });
                });
            },
        };
    }

    debug("create_source_control: Querying current power state from receiver");
    let result = getPowerForZone()
        .then((val) => {
            denon.source_state.Power = val;
            debug(
                "create_source_control: Power state retrieved: %s",
                denon.source_state.Power,
            );
            return denon.client.getInput();
        })
        .then((val) => {
            denon.source_state.Input = val;
            debug(
                "create_source_control: Input retrieved: %s",
                denon.source_state.Input,
            );
            denon.source_state.status = check_status(
                denon.source_state.Power,
                denon.source_state.Input,
            );
            debug(
                "create_source_control: Initial state determined - Power=%s, Input=%s, Status=%s",
                denon.source_state.Power,
                denon.source_state.Input,
                denon.source_state.status,
            );

            if (denon.source_control) {
                debug(
                    "create_source_control: Source control already exists, updating state",
                );
                denon.source_control.update_state(denon.source_state);
                debug(
                    "create_source_control: State updated with status=%s",
                    denon.source_state.status,
                );
            } else {
                debug(
                    "create_source_control: Registering NEW source control extension with Roon",
                );
                debug_roon(
                    "CONTROL REGISTRATION: Source control being registered with Roon - display_name=%s, status=%s, power=%s, input=%s, roon_connected=%s",
                    denon.source_state.display_name,
                    denon.source_state.status,
                    denon.source_state.Power,
                    denon.source_state.Input,
                    roon_connection.connected,
                );
                denon.source_control = svc_source_control.new_device(device);
                debug(
                    "create_source_control: Source control registered successfully - control_key=%s",
                    device.control_key,
                );
                debug_roon(
                    "CONTROL REGISTRATION: Source control registered successfully - control_key=%s",
                    device.control_key,
                );
            }
        })
        .catch((error) => {
            debug(
                "create_source_control: ERROR during state query or registration: %O",
                error,
            );
            throw error;
        });
    return result;
}

setup_denon_connection(mysettings.hostname);

// Periodic connection health monitoring
setInterval(() => {
    const controls_registered =
        (denon.volume_control ? 1 : 0) + (denon.source_control ? 1 : 0);
    const should_have_controls = denon.client && mysettings.hostname;

    debug_roon(
        "CONNECTION HEALTH: roon_connected=%s, controls=%d/%d, denon_client=%s, disconnect_count=%d, pair_count=%d",
        roon_connection.connected,
        controls_registered,
        should_have_controls ? (mysettings.zone === "main" ? 2 : 1) : 0,
        denon.client ? "connected" : "not connected",
        roon_connection.disconnect_count,
        roon_connection.pair_count,
    );

    // Warn if Roon is connected but controls are missing
    if (roon_connection.connected && should_have_controls && controls_registered === 0) {
        debug_roon(
            "CONNECTION HEALTH WARNING: Roon is connected but no controls are registered! This may indicate a problem.",
        );
    }
}, 60000); // Log every 60 seconds

roon.start_discovery();
