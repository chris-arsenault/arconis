# Development

The frontend lives in `frontend/` and uses pnpm. The versions are in `frontend/.node-version` and
the `packageManager` field of `frontend/package.json`.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

The development configuration in `frontend/public/config.js` uses same-browser BroadcastChannel
collaboration, so opening a room in a second tab joins it. Deployed builds receive AppSync
configuration through Ahara's `config.js`, with no build-time secrets.

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

Each run starts its own Vite server and an AppSync protocol fixture, then shuts them down, so no
development server is needed. Journeys use independent browser contexts with no shared local
storage, and drive the canvas with real pointer and keyboard input. Automated tests use these local
fixtures only ([ADR-0010](adr/0010-automated-tests-use-local-fixtures.md)).

Failure screenshots, traces and other generated output go to the ignored `frontend/test-results/`.
