# Arconis

A shared visual workspace for diagrams, mind maps, sticky notes and freehand ideas.

Application: <https://arconis.ahara.io>

## Development

Use Node 24 and pnpm 10.29.3:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

The development configuration uses same-browser BroadcastChannel collaboration. Open
the same room in another tab to work together. Deployment injects AppSync configuration
through Ahara's `config.js`; no browser build secrets are needed.

```sh
make ci                # lint, types, focused tests and Terraform formatting
make build             # production frontend
make test-browser      # real browser journeys with an isolated AppSync protocol fixture
```

Browser tests use Vitest and Playwright. Install Chromium once with
`cd frontend && pnpm exec playwright install chromium`. Tests own and clean up their
temporary Vite and WebSocket servers. They do not require a development server.

## Editing

Create a room, then choose a tool and click the canvas. One toolbar provides shapes,
notes, text, connectors and freehand drawing in the same document. Connect notes
and shapes by choosing the connector tool and clicking its two endpoints, dragging
connection handles, or selecting two objects and choosing Connect.

Double-click to edit text directly. The right panel edits text, colors, line widths,
font settings, geometry and connector routing/endpoints. Shift-click selects multiple
objects; drag a selection rectangle to select an area. Drag handles to resize. Group
and ungroup through the panel or Ctrl/Command G and Ctrl/Command Shift G.

- V selects; H or held Space pans; scroll zooms around the pointer.
- N creates a note; R a rectangle; D a decision; P draws freehand.
- Delete removes the selection; Ctrl/Command Z and Shift Z undo and redo local work.
- Ctrl/Command D duplicates; Ctrl/Command A selects all.
- Saved Views store named viewport positions. They do not move other participants.
- Export downloads a portable `.arconis` document; Import adds its contents to the room.

Share Room provides the link and an ephemeral display name. Room codes contain 192
random bits. Each browser controls its own viewport and selection; object changes,
labels, groups, connections, views and participant cursors synchronize.

## Architecture and data

React/TypeScript renders the interface; maxGraph provides geometry editing and routing.
Yjs owns the shared object model and collaborative text; maxGraph projects that model.
The small transport adapter exchanges incremental updates and state-vector differences
through AppSync Events. Updates are coalesced, divided into 32 KiB chunks and published
in bounded batches. Reconnection exchanges state again in both directions.

IndexedDB keeps the document on each participating device. A returning browser restores
its local copy. New devices need an online participant holding the document; AppSync
is a messaging bus and retains no document history. Export a file for a portable copy.
No document database, custom application server or server-side persistence exists.
Object positions and paths use world coordinates, so concurrent grouping and movement
retain a common coordinate frame. Existing rooms and version-1 files remain readable;
new exports use version 2. Reload previously opened tabs after updating the application.

Rooms are anonymous. The browser API key is public configuration and the room code
does not provide independently enforced authorization. Use this deployment for
non-sensitive work. Accounts, access control and durable shared storage are outside
the current product contract.

## Deployment

Ahara admission lives in `ahara-infra/infrastructure/terraform/control/project-arconis.tf`.
Its `appsync-events` permission primitive supports the new service. Product Terraform
owns the Events API, room namespace, public key and existing Ahara website module.
The website uses private S3 with S3-managed encryption behind CloudFront and ACM TLS.
There is no HTTP application API or login client to register.

The shared Ahara CI workflow gates deployment on browser tests, lint, types and unit
tests. A dependent job exercises the deployed domain and real AppSync through independent
browser contexts, including offline recovery. No manual validation is a release gate.

Local deployment is parameterless:

```sh
with-cred -- scripts/deploy.sh
```

`with-cred --` supplies authorized credentials in this environment. Other installations
can use normal AWS environment variables or the standard credential provider chain.
State uses the shared bucket at `projects/arconis.tfstate`. The public API key expiration
extends 360 days from each Terraform deployment; redeploy before it expires.

To verify an existing deployment:

```sh
cd frontend
ARCONIS_URL=https://arconis.ahara.io/ pnpm test:deployed
```

AppSync Events costs $1/million operations and $0.08/million connection minutes, plus
data transfer; messages are metered per 5 KiB. See [AWS pricing](https://aws.amazon.com/appsync/pricing/).

## License

MIT; see [LICENSE](LICENSE). maxGraph is Apache-2.0; React, Yjs and y-indexeddb are MIT.
The production build includes [bundled dependency notices](https://arconis.ahara.io/licenses.txt),
generated from the installed packages by Vite.
Canvas interactions inspired by InfiniPaint are independently implemented; its GPL
source and assets are not incorporated.
