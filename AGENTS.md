# Repository Guidelines

This Roon extension controls Denon and Marantz receivers across the network. Follow these guardrails to stay consistent with the existing codebase.

## Project Structure & Module Organization

`app.js` wires the Roon API into the Denon client. Feature modules (Audyssey, zone orchestration, etc.) belong in `src/`. Patched vendor code sits in `lib/`, with the authoritative diffs in `patches/`. Jest specifications live in `test/` and mirror module names. Automation scripts, including Docker smoke checks, live in `scripts/`. Co-locate receiver-specific assets with the module that consumes them.

## Build, Test, and Development Commands

- `npm install` resolves dependencies and reapplies vendor patches through `patch-package`.
- `node app.js` starts the extension using the receiver options in `config.json`.
- `npm test` runs the Jest suite; `npm run test:watch` keeps rerunning; `npm run test:coverage` publishes HTML into `coverage/`.
- `bash scripts/test-docker.sh` builds the container and checks startup health before release.

## Coding Style & Naming Conventions

Code uses CommonJS (`require`, `module.exports`) with `"use strict"` headers and four-space indentation. Name files in kebab-case (`zone-functions.js`). Reuse the `debug` logger with component-oriented namespaces such as `roon-extension-denon:zones`. Prefer promise flows (`then`/`catch`) and keep Denon command tokens uppercase (`PSDYNEQ`). If you alter vendored modules, mirror the delta under `patches/` so installs stay reproducible.

## Testing Guidelines

Tests live in `test/` using the `*.test.js` suffix. Stub network I/O at the `denon-client` boundary for unit cases, and add broader flows to `test/integration.test.js`. Exercise success and failure paths, refresh fixtures when protocols shift, and run `npm run test:coverage` to guard against coverage regressions.

## Commit & Pull Request Guidelines

Git history follows Conventional Commits (`feat:`, `fix:`, `chore:`). Keep subjects under 72 characters and describe the scope plainly (`feat: add dynamic volume toggle`). Pull requests must include a clear summary, manual test notes (receiver model + command), relevant screenshots or logs, and confirmation that Jest and Docker checks passed. Link issues and flag breaking changes in bold.

## Security & Configuration Tips

`config.json` stores receiver hostnames and Roon tokens; keep secrets out of commits and redact values in shared logs. Document new configuration keys in the PR body, provide safe defaults, and never check in patched vendor code without the matching `patches/` entry. Avoid committing environment overrides; manage them locally.
