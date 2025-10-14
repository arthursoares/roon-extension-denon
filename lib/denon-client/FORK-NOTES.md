# Forked from node-denon-client

This is a forked and modified version of [node-denon-client](https://github.com/lmoe/node-denon-client) v0.2.4.

## Original Author
Lukas Möller <lmoe@codingart.de>

## License
GPL-3.0 (see LICENSE file)

## Modifications Made

### 1. Fixed EventEmitter Memory Leak (connection.js)
**Issue:** The library called `initializeSocket()` twice - once in the constructor and again in `connect()`, causing duplicate socket initialization and EventEmitter memory leak warnings during reconnections.

**Fix:** Added a guard flag `_socketInitialized` to prevent double initialization. The socket is initialized once in the constructor, and the redundant call in `connect()` is skipped via the guard.

**Files Changed:**
- `lib/connection.js`:
  - Added `_socketInitialized` flag in constructor
  - Added guard in `initializeSocket()` to prevent double initialization
  - Commented out redundant `initializeSocket()` call in `connect()` method

**Why this approach:** Maintains compatibility with code that expects `socket` to exist immediately after client creation, while preventing the memory leak from double initialization.

### 2. Future Modernization (Planned)
- Replace bluebird with native Promises
- Minimize/remove lodash dependency
- Add TypeScript definitions

## Why Forked?
1. The original library is 9 years old with no recent updates
2. Critical bug fixes needed (memory leak)
3. Full control over maintenance and features
4. Small codebase (~1,270 lines) makes maintenance manageable
