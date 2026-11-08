# Development

The frontend lives in `frontend/` and uses pnpm. Runtime and package-manager versions are in
[.node-version](../frontend/.node-version) and [package.json](../frontend/package.json).

## Run locally

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite. [public/config.js](../frontend/public/config.js) uses same-browser
BroadcastChannel collaboration: open a room in a second tab of the same browser and origin.
Independent browsers require a relay-backed configuration, as used by the test fixtures.

Deployed configuration is delivered through Ahara's `config.js`, including relay, account and
MCP addresses. The ordinary local configuration provides canvas editing without deployed
account or relay services. Keep secrets out of frontend assets and runtime browser configuration.

## Required checks

Run these from the repository root:

| Command             | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `make ci`           | Lint, types, unit/protocol tests, source formatting and Terraform formatting. |
| `make build`        | Build the site, relay, control Lambda, accounts API and Auth0 Action.         |
| `make test-browser` | Run independent-context browser journeys against local fixtures.              |
| `make format`       | Apply the frontend Prettier formatting rules.                                 |

The [Makefile](../Makefile) and frontend package scripts are the command authority. Before a
commit, complete `make ci`; run build and browser checks appropriate to the changed behavior.
Documentation changes also need local link, anchor and example checks.

## Focus a test run

```sh
cd frontend
pnpm test src/language/drawing.test.ts
pnpm test:browser src/editor/drawingReview.browser.test.ts
```

Tests live beside their owners. Domain/application tests establish canonical values and
transaction behavior; browser journeys establish actual rendering, input and collaboration. A
browser journey earns its place only where a unit test cannot reach: several browsers converging
on one room, real pointer and keyboard semantics, the clipboard, pictures and what the canvas
draws. A feature's logic, including each command's behavior on a document, is unit-tested
beside its module, and the browser suite does not repeat it.

## Browser setup and lifecycle

Install the selected browser once:

```sh
cd frontend
pnpm exec playwright install chromium
```

Each browser run starts a temporary Vite server and the real local relay, with local stand-ins
for external services, and closes them afterward. A separately running development server is
unnecessary. Contexts have independent browser storage; journeys use real pointer and keyboard
input. Automated tests use local fixtures only ([ADR-0006](adr/0006-automated-tests-use-local-fixtures.md)).

The harness defaults to Chromium. `BROWSER=firefox` or `BROWSER=webkit` selects another engine;
install that engine and its supported host dependencies first. An engine that cannot launch
provides no behavior evidence for that browser.

Failure screenshots, traces, logs and performance observations belong in ignored
`frontend/test-results/`. Performance journeys record their workload and measurements rather
than enforcing object limits or runtime timing budgets.

## MCP integration

[agents.test.ts](../frontend/src/relay/agents.test.ts) exercises authenticated HTTP sessions,
local collaboration, help discovery and error responses.
[bundledRelay.test.ts](../frontend/src/relay/bundledRelay.test.ts) builds and starts the production
CommonJS bundle with a local signing-key service and a real peer socket, then opens and edits
a room through HTTP MCP.

[drawingMcp.browser.test.ts](../frontend/src/editor/drawingMcp.browser.test.ts) uses HTTP MCP
alongside independent browser contexts. It verifies editable authoring, transform/Undo behavior,
atomic refusals and exported content through production owners.

To test an already-downloaded relay bundle, set `RELAY_TEST_BUNDLE` to its path relative to
`frontend/` when running the bundled test. With no override, it builds current source.
Keep downloaded bundles in the ignored test-output directory.

## Follow the architecture

[Architecture](architecture.md) maps domain, language, editor, collaboration, file and account
owners. Domain rules stay in `document/`; language extensions update the canonical parser,
writer, printer and help together. Only the style adapter translates semantic appearance into
maxGraph keys. Leaf controls consume values and focused operations.

Use [AGENTS.md](../AGENTS.md) for repository rules and [deployment](deployment.md) for CI and
operations. Deployments are separate from local tests.
