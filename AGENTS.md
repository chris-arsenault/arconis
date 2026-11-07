# Agent guide

Arconis is a browser-first collaborative canvas that combines architectural diagramming,
sticky notes and freehand drawing in one shared document.

## Read first

| Topic | Link |
| --- | --- |
| Overview and quickstart | [README.md](README.md) |
| Documentation index | [docs/README.md](docs/README.md) |
| Product scope | [docs/product.md](docs/product.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Architecture decisions | [docs/adr/README.md](docs/adr/README.md) |
| Backlog | [docs/backlog.md](docs/backlog.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

## Critical rules

- Read `../ahara/INTEGRATION.md` and applicable Ahara standards before platform changes.
- Keep Yjs canonical: maxGraph projects the document, and collaboration runs in the browser
  with AppSync Events as a message bus ([ADR-0001](docs/adr/0001-yjs-canonical-maxgraph-projection.md),
  [ADR-0002](docs/adr/0002-appsync-events-peer-sync.md)).
- Keep rooms anonymous and dependencies permissively licensed. InfiniPaint inspires
  interactions only; write original code ([ADR-0011](docs/adr/0011-permissive-licensing.md)).
- Run automated tests and CI against the local server and AppSync protocol fixture only. Real
  AWS services stay out of testing, especially pay-per-use ones; deploying is separate
  ([ADR-0010](docs/adr/0010-automated-tests-use-local-fixtures.md)).
- Keep escaping labels in `editor/rendering.ts`, because labels come from peers and render as
  HTML ([ADR-0006](docs/adr/0006-escaped-html-labels.md)).
- Use native agent file editing, current Git branches and broker-backed credentials.
- Preserve unrelated edits in Ahara repositories. Diagnose deployment failures from real logs.
- Verify product behavior through independent browser contexts using real pointer and keyboard
  input; releases have no manual validation gate.

## Code map

| Path | Purpose |
| --- | --- |
| `frontend/src/document/` | Stable object maps, Y.Text, undo, geometry, transforms and portable files |
| `frontend/src/editor/` | maxGraph projection, mutation capture, input, rendering and drag previews |
| `frontend/src/collaboration/` | Peer protocol, frames, persistence, presence and transports |
| `frontend/src/components/` | Interface, selection frame and object and room controls |
| `infrastructure/terraform/` | Events API and Ahara website deployment |
| `.github/workflows/ci.yml` | Shared CI and deployment |
| `docs/` | Current-state documentation, ADRs and backlog |

## Architecture patterns

Graph-origin edits become Yjs transactions with a local origin, and remote changes project
back into the graph behind a guard. Transport adapters know Yjs updates and state vectors,
never graph or UI types. The AppSync fixture is test-only and production entry points never
import it. [docs/architecture.md](docs/architecture.md) covers the full model.

## Commands

| Command | Purpose |
| --- | --- |
| `make ci` | Required lint, types, tests and Terraform formatting before commits |
| `make build` | Build production assets |
| `make test-browser` | Independent-context browser journeys |
| `make format` | Apply Prettier formatting |
| `with-cred -- scripts/deploy.sh` | Local authorized build and deploy |

The frontend uses pnpm. Browser tests own their temporary servers and shut them down.
Generated logs, screenshots and coverage stay in ignored output directories.
