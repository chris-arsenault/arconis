# Arconis agent guide

## Critical rules

- Read `../ahara/INTEGRATION.md` and applicable Ahara standards before platform changes.
- Yjs is canonical. Do not introduce a competing diagram document, snapshots-per-drag,
  a custom application backend or shared server-side document persistence.
- Preserve anonymous rooms and permissive licensing. InfiniPaint inspires interactions;
  its GPL source must not be copied.
- Use native agent file editing, current Git branches and broker-backed credentials.
- Preserve unrelated edits in Ahara repositories. Deployment failures require real logs.
- No manual user validation gate. Verify product behavior through independent browsers.

## Project overview

Arconis combines architectural diagramming, sticky notes and original freehand drawing
on one collaborative canvas. Static assets run in the browser; AppSync Events carries
Yjs updates and peer synchronization; IndexedDB keeps a local copy.

## Code layout

| Path | Purpose |
| --- | --- |
| `frontend/src/document/` | Stable object maps, Y.Text, undo and portable documents |
| `frontend/src/editor/` | maxGraph projection, mutation capture, input and geometry |
| `frontend/src/collaboration/` | Peer protocol, frames, persistence, presence and transports |
| `frontend/src/components/` | Interface and object/room controls |
| `infrastructure/terraform/` | Events API and Ahara website deployment |
| `.github/workflows/ci.yml` | Shared CI plus deployed browser verification |
| `docs/ARCONIS-PLAN.md` | Full product contract and implementation plan |

## Architecture patterns

Graph-origin edits write changed properties into Yjs transactions with a local origin.
The projection guard prevents remote graph updates feeding back into the document.
Yjs undo tracks local origins; remote edits remain independent. Connectors identify
their endpoint objects; dangling references are omitted from the graph and object list
while retained in Yjs so out-of-order endpoint updates can complete them. Parent cycles
are broken deterministically during projection.

Transport adapters do not depend on graph or UI types. Joining and reconnecting exchange
state vectors/differences in both directions. The test-only AppSync fixture is never
imported by production entry points; deployed tests use the real service without mocks.

There is no backend package, database, migration directory or authentication system.
The accepted durability limit is that new devices need an active peer with a local copy.

## Commands

| Command | Purpose |
| --- | --- |
| `make ci` | Required lint/types/tests/Terraform formatting before commits |
| `make build` | Build production assets |
| `make test-browser` | Independent-context browser journeys |
| `make format` | Apply Prettier formatting |
| `with-cred -- scripts/deploy.sh` | Local authorized build/deploy/live verification |

Frontend uses pnpm. Browser tests own temporary servers and shut them down.
Generated logs, screenshots and coverage stay in ignored output directories.
