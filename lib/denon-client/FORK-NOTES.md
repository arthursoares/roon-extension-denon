# Forked from node-denon-client

This is a forked and modified version of [node-denon-client](https://github.com/lmoe/node-denon-client) v0.2.4.

## Original Author
Lukas Möller <lmoe@codingart.de>

## License
GPL-3.0 (see LICENSE file)

## Modifications Made

### 1. Fixed EventEmitter Memory Leak (connection.js)
**Issue:** The library called `initializeSocket()` twice - once in the constructor and again in `connect()`, causing duplicate socket initialization and EventEmitter memory leak warnings during reconnections.

**Fix:** Removed `initializeSocket()` call from constructor, keeping only the call in `connect()` method. This prevents duplicate listener registration.

**Files Changed:**
- `lib/connection.js` - Removed line 27 `this.initializeSocket()`

### 2. Future Modernization (Planned)
- Replace bluebird with native Promises
- Minimize/remove lodash dependency
- Add TypeScript definitions

## Why Forked?
1. The original library is 9 years old with no recent updates
2. Critical bug fixes needed (memory leak)
3. Full control over maintenance and features
4. Small codebase (~1,270 lines) makes maintenance manageable
