# Docker Usage Guide

This repository provides Docker images for easy deployment of the Roon Denon/Marantz extension with zone configuration support.

## Quick Start

### Using Docker Compose (Recommended)

1. Create a directory for your deployment:
   ```bash
   mkdir roon-denon-extension
   cd roon-denon-extension
   ```

2. Download the docker-compose.yml file:
   ```bash
   curl -O https://raw.githubusercontent.com/arthursoares/roon-extension-denon/main/docker-compose.yml
   ```

3. Start the service:
   ```bash
   docker-compose up -d
   ```

4. Check logs:
   ```bash
   docker-compose logs -f
   ```

### Using Docker Run

```bash
docker run -d \
  --name roon-denon-extension \
  --network host \
  --restart unless-stopped \
  -v ./data:/usr/src/app/data \
  ghcr.io/arthursoares/roon-extension-denon:latest
```

## Available Images

Images are automatically built for multiple architectures:

- `ghcr.io/arthursoares/roon-extension-denon:latest` - Latest stable version
- `ghcr.io/arthursoares/roon-extension-denon:main` - Latest development version  
- `ghcr.io/arthursoares/roon-extension-denon:v*` - Specific version tags

### Supported Architectures

- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Raspberry Pi 4, Apple Silicon, etc.)

## Configuration

### Network Configuration

The extension requires network access to:
1. **Roon Core** - For extension discovery and communication
2. **Denon/Marantz Receiver** - For device control

#### Host Network (Recommended)
```yaml
network_mode: host
```
This provides the best compatibility for Roon discovery but shares the host's network.

#### Bridge Network (Alternative)
If you prefer network isolation, use the bridge profile:
```bash
docker-compose --profile bridge up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Node.js environment | `production` |
| `DEBUG` | Debug logging pattern | (disabled) |

### Debug Logging

Enable debug logging to troubleshoot issues. The extension includes comprehensive logging for diagnosing connection problems, state changes, and source control issues.

#### Enable All Debug Output

Edit your `docker-compose.yml` to uncomment or add the DEBUG environment variable:
```yaml
environment:
  - DEBUG=roon-extension-denon*
```

Then restart the container:
```bash
docker-compose down
docker-compose up -d
```

#### View Debug Logs

View real-time logs with:
```bash
docker-compose logs -f
```

Or view logs for the last hour:
```bash
docker-compose logs --since 1h
```

#### Debug Output Categories

The extension now provides detailed logging for:

**State Changes:**
- Power state transitions (ON/STANDBY)
- Input source changes
- Volume and mute changes
- Status determination (selected/deselected/standby)

**Connection Lifecycle:**
- Connection establishment and disconnection
- Reconnection attempts
- Control registration with Roon
- Keep-alive ping activity

**Event Handlers:**
- Receiver events (powerChanged, inputChanged, zone2Changed)
- Before/after state comparisons
- Skipped updates (e.g., deselected status suppression)

**User Actions:**
- Source control button presses (convenience_switch)
- Standby/power toggle requests
- Volume control changes

#### Specific Debug Areas

For focused debugging, enable specific areas:
```yaml
environment:
  - DEBUG=roon-extension-denon:zone,roon-extension-denon:keepalive
```

Available debug namespaces:
- `roon-extension-denon` - Main application logs (recommended)
- `roon-extension-denon:keepalive` - Keep-alive ping logs
- `roon-extension-denon:zone` - Zone-specific operations
- `roon-extension-denon:data` - Raw receiver data (very verbose, usually not needed)

**Note:** The default `DEBUG=roon-extension-denon*` intentionally excludes `:data` to prevent log spam from repetitive receiver messages (like "SSAST CMP" Audyssey status updates every ~10 seconds).

#### Common Debug Patterns

**Troubleshooting Source Control Issues:**
Look for these log patterns:
```
inputChanged: Skipping update to Roon (status is 'deselected', keeping source control active)
check_status: power=ON, input=TV, configured_source=CD => status=deselected
```

**Tracking Reconnections:**
```
LIFECYCLE: Connection closed
LIFECYCLE: Scheduling reconnection in 1 second...
LIFECYCLE: Executing reconnection attempt
LIFECYCLE: Connection setup complete
```

**Verifying State Updates:**
```
powerChanged: Updating source_control with status=selected
inputChanged: update_state called successfully
```

**Enable Raw Receiver Data (for protocol debugging):**
If you need to see ALL raw data from the receiver (e.g., debugging communication issues):
```yaml
environment:
  - DEBUG=roon-extension-denon*,roon-extension-denon:data
```

This will show messages like:
```
RAW: SSAST CMP
RAW: PWSTANDBY
RAW: MVMAX 980
```

Note: Repetitive messages are automatically filtered - only unique messages and every 100th repetition are logged to reduce spam.

### Persistent Data

The container creates a `/usr/src/app/data` volume for persistent configuration:
```yaml
volumes:
  - ./data:/usr/src/app/data
```

This preserves your receiver settings, zone configuration, and connection preferences between container restarts.

## Zone Configuration Features

This enhanced version includes:

- **Zone Selection**: Choose between Main Zone and Zone 2
- **Dual-Zone Power Control**: Configure whether to turn off both zones or just the selected zone
- **Volume Control**: Available for Main Zone only (Zone 2 supports power control only)

### Configuration via Roon

1. Start the container
2. Open Roon → Settings → Extensions
3. Find "Denon/Marantz AVR" in the list
4. Configure:
   - **Hostname/IP**: Your receiver's network address
   - **Zone**: Main Zone or Zone 2 (Power Only)
   - **Power Off Behavior**: Both zones or selected zone only
   - **Input**: Select your preferred input source

## Troubleshooting

### Extension Not Appearing in Roon

1. **Check network connectivity**:
   ```bash
   docker-compose logs
   ```

2. **Verify host network mode**:
   ```bash
   docker inspect roon-denon-extension | grep NetworkMode
   ```

3. **Test receiver connectivity**:
   ```bash
   docker-compose exec roon-extension-denon ping <receiver-ip>
   ```

### Connection Issues

1. **Enable debug logging**:
   ```yaml
   environment:
     - DEBUG=roon-extension-denon*
   ```

2. **Check receiver network settings**:
   - Ensure network control is enabled
   - Verify IP address is correct
   - Test telnet connectivity: `telnet <receiver-ip> 23`

### Container Health

Check container health status:
```bash
docker-compose ps
docker inspect roon-denon-extension | grep Health -A 10
```

## Building from Source

To build your own image:

```bash
git clone https://github.com/arthursoares/roon-extension-denon.git
cd roon-extension-denon
docker build -t my-roon-denon-extension .
```

For multi-architecture builds:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t my-roon-denon-extension .
```

## Updates

To update to the latest version:

```bash
docker-compose pull
docker-compose up -d
```

The container will automatically restart with the new version while preserving your configuration.

## Support

- **Issues**: [GitHub Issues](https://github.com/arthursoares/roon-extension-denon/issues)
- **Discussions**: [GitHub Discussions](https://github.com/arthursoares/roon-extension-denon/discussions)
- **Original Project**: [docbobo/roon-extension-denon](https://github.com/docbobo/roon-extension-denon)