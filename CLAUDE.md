# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Roon Volume Control extension for controlling Denon/Marantz AV receivers via network connection. The extension allows volume control and muting from within Roon by connecting to the receiver's network interface.

## Common Commands

### Installation and Running
- Install dependencies: `npm install`
- Run the extension: `node .` or `node app.js`

### Development
- The main entry point is `app.js`
- No build process or test suite is configured
- Uses standard Node.js debugging with the `debug` package

## Architecture

### Core Components

The extension is a single-file Node.js application (`app.js`) that integrates several key components:

1. **Roon API Integration**: Uses multiple Roon API modules:
   - `node-roon-api` - Core Roon API functionality
   - `node-roon-api-settings` - Settings management UI
   - `node-roon-api-status` - Status reporting
   - `node-roon-api-volume-control` - Volume control interface
   - `node-roon-api-source-control` - Source switching interface

2. **Denon Client Integration**: Uses `denon-client` package to communicate with Denon/Marantz receivers via TCP connection

3. **Extension Services**:
   - **Settings Service** (`svc_settings`): Manages hostname/IP configuration and input selection
   - **Status Service** (`svc_status`): Reports connection status to Roon
   - **Volume Control Service** (`svc_volume_control`): Handles volume and mute operations
   - **Source Control Service** (`svc_source_control`): Manages input switching and standby

### Key Architecture Patterns

- **Event-driven**: Uses event listeners for Denon client state changes (power, input, volume, mute)
- **Connection Management**: Implements automatic reconnection with keep-alive mechanism (60-second intervals)
- **State Synchronization**: Maintains local state objects (`denon.volume_state`, `denon.source_state`) that sync with both Denon receiver and Roon
- **Promise-based**: Async operations use Promises for Denon client communication

### Configuration Flow

1. Settings UI probes available inputs from Denon receiver
2. User configures hostname/IP and desired input source
3. Extension establishes TCP connection to receiver
4. Creates volume and source control devices in Roon
5. Maintains real-time synchronization via event handlers

### Connection Lifecycle

- `setup_denon_connection()`: Initializes connection with error handling and event setup
- `connect()`: Establishes connection and creates control interfaces  
- Keep-alive mechanism prevents connection timeout
- Automatic reconnection on connection loss

## Important Notes

- Only supports one Denon client connection at a time (receiver limitation)
- Connection prevents other Telnet-based applications from connecting
- Extension ID: `org.pruessmann.roon.denon`
- Volume range: -79.5 dB to receiver max, 0.5 dB steps
- Requires receiver network interface to be enabled