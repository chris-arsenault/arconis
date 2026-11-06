# Arconis product implementation

## Contract and authority

Build and deploy the entire supplied product at <https://arconis.ahara.io>.
The source brief is `.sulion-paste/paste-2026-11-06T20-12-46-238Z.txt`.
The user's subsequent instructions supersede it: Ahara integration takes precedence,
AppSync Events must be supported, use permissively licensed original code rather than
InfiniPaint's GPL code, and complete the full feature set rather than stopping at an MVP.
Execution, cross-repository Ahara admission, CI publication and deployment are authorized.
The user's later manual validation is not a completion prerequisite.

Required behavior:

- One canvas containing rectangles, ellipses, diamonds, architectural components,
  sticky notes, editable labels and their relationships.
- Pan/zoom, placement, selection, multi-selection, dragging, resizing, deletion,
  grouping, ungrouping and editable geometry/style properties.
- Object-attached shape/shape, sticky/sticky and mixed connectors, including
  orthogonal routing, editable connector properties and retained attachments on moves.
- Direct text editing; small sticky color palette; coherent diagram/sticky tool modes.
- Anonymous create/join/share rooms with browser-generated high-entropy identifiers.
- Concurrent creation, geometry, text, styles, relationships, grouping and deletion
  converge; no dangling edges corrupt the visible graph.
- Incremental Yjs exchange over AppSync, active-peer initial state exchange, bounded
  messages and chunked state, coalesced drags and recovery after reconnection.
- IndexedDB recovery on reload and offline edits. A new device cannot recover a room
  when all devices holding its state are offline; this accepted limitation remains.
- Participant names/cursors, independent viewports and selections, connection/sync status.
- Original InfiniPaint-inspired freehand drawing, cursor-centered zoom, space-to-pan,
  selection transforms and named viewport bookmarks, integrated into the same document.
- Complete usable interface, documentation, focused automated integration/browser tests,
  Ahara admission, shared CI and verified live deployment.

Excluded: custom application servers, document databases, server-side document storage,
accounts, permission hierarchy, AI, comments, timers/voting/workshops, template marketplaces,
full draw.io file compatibility and generalized collaboration frameworks.

## Decisions and source map

User decisions are above. Implementation choices below remain revisable against evidence.

- React/TypeScript, maxGraph and Yjs; graph cells project canonical Yjs objects rather
  than owning a second document. Stable IDs and property maps preserve concurrent edits.
- Y.Text labels support concurrent edits; a graph edit is reconciled as a text delta.
- Transport knows Yjs updates and state vectors; it does not know maxGraph or UI state.
- y-indexeddb provides local durability. Browser BroadcastChannel supports same-origin
  local development; deployed collaboration must be proven through AppSync, including
  independent browser contexts without shared local storage.
- maxGraph supplies routing, connections and grouping. A custom editor is only warranted
  if direct integration proves disproportionately complicated, not merely unfamiliar.
- Ahara sources: `../ahara/INTEGRATION.md`, `../ahara/CI-WORKFLOW.md`, applicable
  `../ahara-standards/standards/`, actual `website` module and managed-project policy library.
- AppSync API-key anonymous access is the specified prototype trust model. Its public
  runtime key and unguessable room IDs do not provide sensitive-document access control.
- AppSync pricing checked against AWS: $1/million operations, $0.08/million connection
  minutes plus transfer, no fixed service fee. Example 1M operations + 100K minutes:
  $1.008 before transfer. Reuse existing hosting; avoid a new KMS key with `encrypt=false`.
- Integration prerequisites belong in the actual Ahara repositories. Existing unrelated
  changes (currently `ahara-infra/.../services/db-migrate.tf`) are not owned by this work.

Assumptions to verify: maxGraph offers a manageable mutation/projection boundary; current
AWS provider supports Events resources; the deployer can obtain the documented narrow
permissions through existing Ahara admission. Credential failures stop the affected path,
not independent local product work. No substitute credentials or relaxed guardrails.

## Milestones and Sulion mapping

Root: `80897753-012b-4482-958e-f138f26f86ec`.

### M0 — Product contract and platform fit

Phase: `773a5550-956b-4021-820d-08474a1f4f41`.
Read actual requirements, instructions, modules and CI contracts; establish tool and
credential availability and current pricing. Acceptance: scope and platform choices have
current source support, full functional coverage is retained, and execution can proceed.
Evidence: source inspection and command results; no artificial document-content tests.

### M1 — Complete local editor [depends on M0]

Phase: `45ee9886-e936-4c8c-8903-4fbae7919505`.
Build the full local canvas, common and architectural shapes, notes, attached connectors,
properties, groups, selection, shortcuts, freehand drawing, bookmarks, undo/redo and
document export/import. Acceptance: these operate together in one document and survive
serialization; connections remain attached when either endpoint moves or is grouped.
Evidence: typecheck, production build, focused document tests and real browser interaction.

### M2 — Shared rooms and synchronization [depends on M1]

Phase: `9055fc06-00af-4515-bc48-4d72547ebd48`.
Integrate canonical Yjs editing, collaborative labels, local persistence, anonymous rooms,
presence, incremental updates, chunked state-vector/difference exchange and reconnect.
Acceptance: independent sessions converge after concurrent/offline edits, late join,
deletion and reload; separate rooms remain isolated; viewports remain independent.
Evidence: concurrent Yjs tests, transport protocol tests and browser journeys.

### M3 — Ahara and AppSync integration [depends on M0, M2]

Phase: `cc579a4c-3405-418e-99ec-a41454b0fd2a`.
Add scoped Events support and Arconis managed-project registration to Ahara; configure
S3/CloudFront hosting, runtime configuration, Events API/channel and shared CI.
Acceptance: actual admission and deployable Terraform exist; CI uses the shared workflow;
no application server or unrequested persistence is introduced.
Evidence: formatting, Terraform validation/plan, platform checks and CI.

### M4 — Product verification and usability [depends on M1, M2, M3]

Phase: `5bdbda04-91ce-4fea-bb86-ce3a27966996`.
Finish accessible controls, onboarding, status/error handling, responsive layout and docs.
Acceptance: every specified scenario and object relationship is covered; no placeholder
tools or simulated deployed behavior; focused browser checks operate real editor paths.
Evidence: `make ci`, production build and browser tests. Generated artifacts stay ignored.

### M5 — Publication and deployed verification [depends on M4]

Phase: `13e1360a-e638-4dd1-940c-f784e8fa68ee`.
Publish owned changes on current branches in dependency order; monitor actual CI logs;
deploy to the required domain. Acceptance: HTTPS, runtime configuration, assets and
independent-browser editing/late join/reconnect/reload/isolation pass on the deployed
application using AppSync. Verify deployed revision rather than inferring from a push.
No user validation gate. Diagnose failures from logs; branch prerequisite repairs when needed.

## Execution and current state

M0–M4 are complete. The full editor and shared-room behavior pass local automated checks.
GitHub workflow access succeeds. Local AWS broker access is unavailable; deployment uses
the normal shared CI/OIDC route already required by this plan. Platform Terraform apply
succeeded; product run `42295581087` deployed commit `f78c9f5` and identified the
offline lifecycle defect described below in its live browser gate.
Milestone expansions and material evidence are maintained here, not in separate reports.

### M1 execution expansion

Sulion branch: `13662095-fb49-4455-b1aa-ae42d0fc1d7f`.

1. Canvas and canonical document (in progress). Files: `frontend/src/document/`,
   `frontend/src/editor/`, package/build configuration. Implement stable-ID Yjs object maps,
   text deltas and maxGraph projection with origin guards. Verify real cell mutation,
   attachment and serialization rather than a standalone library demonstration.
2. Complete tools and interface. Files: `frontend/src/components/`, editor interactions,
   application styles. Implement all specified editing tools plus original freehand/bookmark
   behavior, property controls and keyboard commands. Verify mixed document workflows.
3. Local editor evidence. Files: colocated focused tests and browser journeys. Run types,
   build and real DOM/canvas interactions; review against every M1 behavior before returning.

M1 evidence: TypeScript and production Vite build pass. The mixed-canvas browser journey
creates and connects shapes/notes, moves them, groups/ungroups them, edits canvas text and
saves/restores a view. Screenshot inspected locally. ESLint has no errors; external-data
optionality warnings will be resolved during usability refinement. Direct maxGraph
integration works; no replacement editor is needed.

### M2 execution expansion

Sulion branch: `fe5b56e3-b9ad-4eaf-a73c-d5f95d79ce92`.

1. Peer protocol and durability. Files: `frontend/src/collaboration/`, document modules,
   room controls. Implement symmetric state-vector/difference exchange, 32 KiB update
   chunks, coalescing, IndexedDB, display names and awareness. Evidence: seven passing
   tests establish concurrent text/geometry/style convergence, undo ownership, portable
   relationships, peer late join/reconnect, room entropy and large out-of-order chunks.
2. Network lifecycle and evidence. Files: AppSync transport and browser tests. Validate
   actual socket loss, online recovery, same-object independent changes and persistence.
   Browser fixtures use independent contexts over the actual AppSync client protocol;
   only the service boundary is replaced locally. Deployed tests use real AWS with no
   route override. No temporary WebSocket fixture is included in the application build.

M2 complete: seven unit/protocol tests and both independent-context browser journeys pass,
including an asserted offline connection state before edits and reconnect convergence.

### M3 execution expansion

1. Admission and Events permissions. Register `project-arconis.tf` in Ahara control;
   add the `appsync-events` primitive and integration guidance. Scope API/namespace
   mutations by Project tag. AWS's documented API-key action limitation requires `*`
   resources for key management; restrict those four operations to `us-east-1`.
2. Hosting and CI. Product Terraform creates native Events resources and uses the
   existing website module for `arconis.ahara.io`. `encrypt=false` selects S3-managed
   encryption and avoids a new KMS key. Shared CI gates deployment on browser, lint,
   type, unit and Terraform checks. A dependent job runs the same browser journeys
   against the deployed HTTPS application and real AppSync service.
   Validate Terraform without AWS access, then run actual CI/apply when authorized
   credentials are available. Local broker AWS access remains blocked until unlocked.

M3 code complete: product and platform Terraform validate; platform `make ci` passes.
Registration/Events primitive published in `ahara-infra` commit `859dd78`; guidance
published in `ahara` commit `4616fa5`. Platform run `42292540216` is applying through
the normal shared CI/OIDC path. Cloud completion and actual admission are M5 checks;
no alternate credential source is used. An existing cached S3 backend caused platform
`terraform init -backend=false` to attempt credential discovery and fail; platform
`terraform validate` subsequently passed without cloud access.

### M4 execution expansion

Sulion branch: `c2c856ac-be1a-4296-a0a3-3c13f856b200`.

1. Full interaction coverage. Files: browser journeys, document/import validation,
   graph mutation and selection code. Exercise physical drags and resize handles,
   all shape tools, mixed relationships/routing, freehand movement, grouping, local
   undo and complete document round trips. Measure a representative larger canvas.
2. Usability and release checks. Files: UI, protocol edge cases, documentation and CI.
   Fix observed defects without reducing feature coverage; run `make ci`, production
   build and browser tests, inspect local screenshots, check deployed revision wiring.

M4 complete: `make ci` passes with zero lint warnings, nine domain/protocol tests,
types, formatting and Terraform formatting. Production build and all five browser
journeys pass. The journeys cover create/join, all shape tools, mixed connectors,
physical dragging/resizing, routing, direct/collaborative text, groups and remote
group deletion, duplicate/undo, note color, drawing/moving strokes, view/file round
trips, late join, actual offline/reconnect, reload and isolation. A 450-object canvas
imports and converges in independent browser contexts; raw timing/screenshots remain
in ignored test output. The projection avoids resetting unchanged cell styles.
Upstream maxGraph's build-time eval warning remains; its graph evaluation option is
disabled by default and is not enabled here.

### M5 execution expansion

1. Publish owned changes on current main branches and await actual platform admission.
   Verify registration through actual CI role assumption and deployment. An optional
   secret-metadata listing returned HTTP 403 with the broker's GitHub credential; no
   alternate credential is used and secret listing is not a product completion gate.
2. Run the product shared workflow, inspect failures from logs if any, and deploy.
   The dependent browser job verifies the exact commit via its embedded revision.
3. Verify HTTPS and independent-browser journeys against real AppSync at the required
   domain, review resulting CI status, reconcile the working trees, and close this plan.
   The user's subsequent manual validation is outside these completion gates.

M5 branch: `e227d0b2-b204-4c42-87d9-2aa5ac558385`. Platform run `42292540216`
reports successful AWS credential configuration and Terraform deployment. Product
commit `f78c9f5` is published on the original main branch. Shared CI lint, types,
unit tests, browser fixture tests, build, deployment and reporting passed. The
exact-revision deployed-browser job caught the offline defect below.

### Live offline repair

Live HTTPS returns 200 and revision `f78c9f5` is confirmed. Four of five browser
journeys pass against real AppSync, including the large chunked synchronization.
The offline journey fails because status waits for the socket close event; a real
network may leave that handshake pending. The repair updates ready/status state on
the browser offline event, retires the old socket immediately, and ignores late
callbacks from it. A focused delayed-close regression protects this behavior.
Re-run local checks, publish, and repeat the same exact-revision deployed suite.
Do not relax the offline assertion or substitute fixture success for deployed proof.

Repair branch: `ee9befd4-ac7c-43ba-8020-6bafad2f09da`.
Local repair checks pass: ten unit/protocol tests, all five browser journeys,
zero lint warnings, types, formatting and production build. The browser suite now
also reloads a room with no other participant online to prove IndexedDB recovery.

The earlier platform run's engineering reporting returned HTTP 502 from
`/api/ci/report`; its server-side cause remains unverified. Product run
`42295581087` subsequently passed reporting. The broker credential cannot rerun
workflows; no substitute credential or reporting bypass is introduced.
