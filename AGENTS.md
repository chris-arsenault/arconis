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
  with a relay that forwards frames and stores nothing
  ([ADR-0001](docs/adr/0001-yjs-canonical-maxgraph-projection.md),
  [ADR-0009](docs/adr/0009-relay-on-ec2.md)).
- Keep rooms anonymous and dependencies permissively licensed. InfiniPaint inspires
  interactions only; write original code ([ADR-0007](docs/adr/0007-permissive-licensing.md)).
  Vendor architecture icons are the one exception, and stay unrotated and evenly scaled
  ([ADR-0008](docs/adr/0008-vendor-architecture-icons.md)).
- Run automated tests and CI against the local server and local relay only. Real
  AWS services stay out of testing, especially pay-per-use ones; deploying is separate
  ([ADR-0006](docs/adr/0006-automated-tests-use-local-fixtures.md)).
- Keep escaping labels in `editor/rendering.ts`, because labels come from peers and render as
  HTML.
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
| `frontend/src/relay/` | The relay process and its control Lambda, bundled separately from the site |
| `infrastructure/terraform/` | Relay, control Lambda and Ahara website deployment |
| `.github/workflows/ci.yml` | Shared CI and deployment |
| `docs/` | Current-state documentation, ADRs and backlog |

## Architecture patterns

Graph-origin edits become Yjs transactions with a local origin, and remote changes project
back into the graph behind a guard. Transport adapters know Yjs updates and state vectors,
never graph or UI types. The relay fixture is test-only and the site's entry points never
import it or `relay/`. [docs/architecture.md](docs/architecture.md) covers the full model.

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
