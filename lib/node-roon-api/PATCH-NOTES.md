# node-roon-api Patch Notes

This document explains why we're patching the node-roon-api library and what changes were made.

## Latest Update (2025.10.12) - Enhanced Diagnostic Logging

### Purpose
Added comprehensive diagnostic logging to identify the root cause of disconnections that persist despite the empty frame fix. While empty frames are now handled gracefully, disconnections continue to occur silently with no logging to indicate why.

### Changes Added
1. **Enhanced MOO Parser Error Logging** (`moo.js`)
   - Added `[MOO_ERROR]` prefix to all 10+ parse failure points
   - Includes JSON-serialized message state at point of failure
   - Captures buffer length and position information
   - Specific error messages for each failure mode:
     - Missing Request-Id header
     - Content-Type without Content-Length
     - Content-Length without Content-Type
     - Bad JSON body parsing
     - Malformed header lines
     - Invalid MOO protocol format
     - Message lacks newline in header

2. **WebSocket Close Event Logging** (`transport-websocket.js`)
   - Logs `[WS_CLOSE]` events with:
     - Close code (indicates reason per WebSocket spec)
     - Close reason text
     - Whether close was clean
     - Timestamp, host, and port

3. **MOO Parse Failure Logging** (`transport-websocket.js`)
   - Logs `[MOO_PARSE_FAILURE]` before closing connection
   - Captures raw data preview (first 200 bytes)
   - Includes data type and length
   - Timestamp for correlation with other logs

4. **Full MOO Protocol Logging** (`app.js`)
   - Added `log_level: "all"` to RoonApi configuration
   - Enables logging of all MOO protocol messages (REQUEST, CONTINUE, COMPLETE)
   - Allows correlation between MOO messages and parse failures

### Expected Diagnostic Output
When a disconnection occurs, logs will now show:
```
[WS_CLOSE] { timestamp: '...', host: '...', code: 1006, reason: '', wasClean: false }
[MOO_PARSE_FAILURE] { timestamp: '...', data_length: 156, data_type: 'object', data_preview: '...' }
[MOO_ERROR] Missing Request-Id header: {...}
```

This will reveal exactly which validation is failing and what data is causing the failure.

### Usage
Run with standard Roon debug logging:
```bash
DEBUG=roon-extension-denon:roon node app.js
```

All diagnostic logs will be visible in standard output alongside Roon connection monitoring.

### Next Steps
1. Run this diagnostic version for 24-48 hours
2. Capture logs showing disconnection events
3. Analyze which MOO_ERROR or parse failure is occurring
4. Implement targeted fix based on root cause
5. Release permanent fix in subsequent version

---

## Original Issue (2025.10.11) - Empty Frame Handling

### Issue Description

### Problem
The extension was experiencing intermittent disconnections from Roon Core, causing the ConvenienceSwitch and Volume controls to disappear from the Roon UI. This issue was particularly noticeable when pausing playback or when the receiver was in standby mode.

### Root Cause
The node-roon-api library's WebSocket transport layer (`transport-websocket.js`) was treating empty WebSocket frames as errors, causing the connection to close. The sequence was:

1. Roon Core sends an empty WebSocket frame (valid WebSocket ping/pong heartbeat)
2. The `onmessage` handler receives `event.data` with length 0
3. `moo.parse()` is called with empty data, returns `undefined`
4. The handler interprets this as an error and calls `this.close()`
5. Connection drops, causing "ROON UNPAIRED" event
6. All registered controls (Volume and Source) are removed from Roon UI

### Evidence
From production logs (2025-10-14):
```
15:29:15 - MOO: empty message received
15:29:15 - ROON UNPAIRED: core_id=..., disconnect_count=1, time_connected=221s
15:29:15 - Controls status - volume_control=was registered, source_control=was registered
```

The issue occurred immediately after user actions (like pausing playback) that likely triggered WebSocket heartbeat frames.

## Patch Details

### File Modified
`node_modules/node-roon-api/transport-websocket.js`

### Changes Made
Added empty frame handling in the `onmessage` handler (lines 53-60):

```javascript
// Handle empty WebSocket frames (ping/pong heartbeats)
// Empty frames are valid WebSocket behavior - ignore them gracefully
// This prevents disconnection when Roon Core sends heartbeat frames
const data = event.data;
if (!data || (data.length !== undefined && data.length === 0)) {
    // Silently ignore empty frames - they're part of WebSocket keep-alive
    return;
}
```

### Why This Fix Works
Empty WebSocket frames are **valid** according to the WebSocket protocol (RFC 6455). They're commonly used for:
- Ping/pong heartbeat mechanisms
- Keep-alive functionality
- Connection health checks

By checking for empty frames **before** calling `moo.parse()`, we:
1. Prevent the MOO protocol parser from seeing invalid (empty) data
2. Avoid treating valid WebSocket frames as protocol errors
3. Maintain stable connections during normal WebSocket heartbeat activity

## Patch Persistence

### Using patch-package
We use `patch-package` to persist this patch across npm installs and Docker builds:

1. **Local Development**: The patch is automatically applied after `npm install` via the `postinstall` script
2. **Docker Builds**: The `patches/` directory is copied before npm install in the Dockerfile
3. **Version Control**: The patch file `patches/node-roon-api+1.2.3.patch` is committed to git

### Applying the Patch Manually
If needed, you can manually apply the patch:
```bash
npx patch-package node-roon-api
```

Or remove and reapply:
```bash
npm install  # This automatically runs patch-package via postinstall
```

## Testing

### Verification Steps
1. Start the extension with Roon connection monitoring: `DEBUG=roon-extension-denon:roon node app.js`
2. Play audio and pause multiple times
3. Leave receiver in standby for extended periods
4. Monitor logs for:
   - ✅ No "MOO: empty message received" → disconnect sequence
   - ✅ No "ROON UNPAIRED" events during normal operation
   - ✅ Controls remain visible in Roon UI

### Expected Results
- Connection remains stable during playback state changes
- ConvenienceSwitch and Volume controls persist in Roon UI
- Normal operation shows only: `CONNECTION HEALTH: roon_connected=true, controls=2/2`

## Future Considerations

### When to Update This Patch
- If RoonLabs releases a new version of node-roon-api that fixes this issue
- If the WebSocket transport implementation changes significantly
- If issues persist and additional debugging is needed

### Alternative Solutions Considered
1. ❌ **Don't patch**: Would require reporting to RoonLabs and waiting for upstream fix
2. ❌ **Fork node-roon-api**: Too heavyweight for a single small fix
3. ✅ **Use patch-package**: Lightweight, version-controlled, Docker-compatible

## Related Files
- `patches/node-roon-api+1.2.3.patch` - The actual patch file
- `package.json` - Contains `postinstall` script to apply patches
- `app.js` - Contains Roon connection monitoring (core_paired/core_unpaired callbacks)

## References
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455) - WebSocket Protocol Specification
- [patch-package](https://github.com/ds300/patch-package) - Package patching tool
- [Issue Analysis](../../CLAUDE.md#troubleshooting) - See CLAUDE.md for detailed troubleshooting steps
