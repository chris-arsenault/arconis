# Development

The frontend lives in `frontend/` and uses pnpm. The versions are in `frontend/.node-version` and
the `packageManager` field of `frontend/package.json`.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

The development configuration in `frontend/public/config.js` uses same-browser BroadcastChannel
collaboration, so opening a room in a second tab joins it. Deployed builds receive the relay's
address through Ahara's `config.js`, with no build-time secrets.

## Checks

| Command | Purpose |
| --- | --- |
| `make ci` | Lint, types, unit and protocol tests, formatting and Terraform formatting |
| `make build` | Production frontend |
| `make test-browser` | Browser journeys |
| `make format` | Apply Prettier formatting |

## Browser tests

Browser tests use Vitest and Playwright. Install Chromium once:

```sh
cd frontend
pnpm exec playwright install chromium
```

Each run starts its own Vite server and the real relay on a local port, with a stand-in for the
control Lambda, then shuts them down, so no development server is needed. Journeys use independent browser contexts with no shared local
storage, and drive the canvas with real pointer and keyboard input. Automated tests use these local
fixtures only ([ADR-0006](adr/0006-automated-tests-use-local-fixtures.md)).

Failure screenshots, traces and other generated output go to the ignored `frontend/test-results/`.

## MCP integration

`relay/agents.test.ts` exercises authenticated HTTP sessions, room collaboration, guidance discovery
and error responses against a local relay. `relay/bundledRelay.test.ts` builds and starts the production
CommonJS bundle, uses a local signing-key service and a real peer socket, then opens and edits a room
over HTTP MCP. The drawing browser journey also uses HTTP MCP alongside independent browser contexts
and pointer/keyboard edits.

To diagnose an already-downloaded relay artifact locally, set `RELAY_TEST_BUNDLE` to its path relative
to `frontend/` when running the bundled relay test. With no override, the test builds the current
source. Neither route calls deployed AWS services; keep downloaded bundles in `test-results/`.
