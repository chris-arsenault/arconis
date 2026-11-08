# Network efficiency and architecture refactoring

Prepared 2026-11-08 against `8483e42`. The owner has now authorized executing all phases locally.
Commit, push and deployment are not requested. The drawing plan is separate and is not resumed.

Correction after structural review: the architecture/SOLID completion claim below was too broad.
The network implementation and targeted ownership moves were performed, but they did not complete
the requested interface, module, inheritance and composition work. The six structural findings
and their implementation plan are now tracked in [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md).
Historical phase states and test results below describe the earlier execution; they are not
acceptance evidence for that new plan.

## Outcome and requirements

Publish completed user actions, like agent writes, while keeping local interaction responsive
and collaborative. No performance defect has been established. Make responsibilities, dependency direction and file ownership easier to
understand without replacing the application's working architecture.

The owner's five requested areas are:

1. Improve network use, including placement/dragging and text entry, using normal Yjs support
   and judgment appropriate to a collaborative canvas. No custom synchronization hacks.
2. Inspect architecture and apply appropriate software patterns. CQRS, visitors and decorators
   are examples to evaluate, not required additions.
3. Inspect all five SOLID principles and address demonstrated problems.
4. Inspect module separation and correct inappropriate dependencies.
5. Inspect file organization and improve placement where ownership is unclear.

Owner correction: the network request concerns how changes are determined and published:
completed actions/final state rather than transitions. It is not a request to tune 40 ms to
200 ms or an assertion that there is a performance problem. The earlier timer recommendation
is withdrawn. Measurements assess the consequences of action boundaries; they do not decide
whether to substitute timer tuning for the requested method.

Existing requirements remain: Yjs is canonical; maxGraph is its projection; files, people and
agents share one canvas language; anonymous rooms remain usable; password-room contents stay
encrypted; local editing and persistence work without a network. Automated tests use local
servers and relays only. Preserve safe Markdown rendering and vendor-icon geometry rules.

These are review and refactoring goals, not authorization for a new backend, command bus,
event store, alternate document model, framework, dependency-injection container or monorepo.
An unchanged module is an acceptable review result when its existing design fits its purpose.

## Inspection and evidence

This section records the initial source review at `8483e42`, before implementation. At that
point no new runtime timings, traffic measurements or tests had been run. Execution results
appear in the milestone expansions and current state below; earlier feature tests were not
treated as a performance baseline for this work.

Read the production bodies of the collaboration provider, transports and room composition;
document model and text binding; editor controller, input, projection, mutation capture,
arrangements, previews and collective transforms; workspace subscriptions, stencil controls;
language writer, draft, session and dispatch; picture/icon bridges; account saving and account
API adapters. Reviewed the existing traffic and scale browser journeys and applicable ADRs.
An import scan covered relative imports in production TypeScript, excluding tests and fixtures.
It locates dependencies; it is not a full semantic cycle analysis. Sulion code indexing reported
stale results, so current source bodies established the findings below. Not every source/test
file or infrastructure policy has been reviewed; subsequent milestones must inspect the full
affected workflows before changing them.

| Finding                                                                                             | Current source                                                                                                  | Implication                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Updates already merge over a fixed 40 ms window. This is coalescing, not an action boundary.        | `collaboration/provider.ts`, `onUpdate`                                                                         | Timer tuning does not establish the requested final-state publication behavior.                                                            |
| Rail stencils move as a local DOM ghost and create an item only in the drop handler.                | `components/StencilBrowser.tsx`, `StencilButton` and its consumers                                              | Preserve this path; do not add redundant document debouncing to it. Confirm its actual traffic with pointer input.                         |
| Native moves/resizes commit through maxGraph's mouse-up handlers; previews use awareness.           | Installed maxGraph `SelectionHandler.mouseUp` and `VertexHandler.mouseUp`; `editor/preview.ts`, `controller.ts` | Distinguish transient awareness frames from committed document updates. Click placement currently creates at pointer-down.                 |
| Freehand creation accumulates points locally and creates one drawing at pointer-up.                 | `editor/input.ts`, `bindPointerTools`                                                                           | Keep the existing local preview and final write.                                                                                           |
| Collective scaling/rotation writes geometry at 100 ms intervals and flushes on release.             | `components/SelectionFrame.tsx`, `editor/controller.ts`, `rateLimitedWrite.ts`                                  | This differs from native dragging. Measure both update bytes and repeated local path work.                                                 |
| Presence coalesces at 80 ms; native preview publication also checks 80 ms.                          | `collaboration/provider.ts`, `editor/controller.ts`                                                             | Presence has a separate purpose and budget. Do not treat every cursor frame as wasteful document traffic.                                  |
| Text writes immediately into Y.Text; the provider schedules its transmission.                       | `document/useCollaborativeText.ts`, `canvasDocument.ts`                                                         | Investigate publishing an edit's CRDT changes together at completion while preserving concurrent editing, selection and local persistence. |
| Every document update invokes full graph projection; mutation capture scans all graph cells.        | `editor/controller.ts`, `projection.ts`, `graphChanges.ts`                                                      | Network batching alone will not remove per-character local work. Profile invalidation and transaction scope separately.                    |
| Workspace subscribes to room and editor versions; room awareness changes emit the room version.     | `components/Workspace.tsx`, `collaboration/room.ts`                                                             | Presence can refresh broad UI subtrees. Measure before narrowing subscriptions.                                                            |
| Room composition imports editor picture globals; relay icon search imports editor icon code.        | `collaboration/room.ts` -> `editor/pictureSource.ts`; `relay/agentSession.ts` -> `editor/icons.ts`              | These are concrete ownership/dependency targets. Shared asset code should not appear editor-only.                                          |
| Document files depend on the language and browser download APIs; a document hook imports React/DOM. | `document/files.ts`, `document/useCollaborativeText.ts`                                                         | Separate core model code from file/application adapters and UI bindings. This does not by itself prove a runtime import cycle.             |
| Writer stages changes in Draft, then commits; transport encryption wraps another transport.         | `language/writer.ts`, `draft.ts`, `collaboration/lockedTransport.ts`                                            | Retain useful existing patterns rather than replacing them for naming consistency.                                                         |

Paths in the table are relative to `frontend/src/` unless stated otherwise.

## Recommended network design

The preferred direction is **local interaction followed by publication of the completed action**.
An agent builds a coherent result and commits it; placement, drag, resize and text editing should
be assessed against that same boundary. Native geometry and rail placement already demonstrate
much of this approach. Keep local animation/feedback separate from shared committed state.

For geometry, use normal local previews and commit the resulting geometry in one synchronous
Yjs transaction when the action completes. Extend that approach to collective transforms where
existing maxGraph mechanisms support it cleanly. This is a change in when an edit becomes shared,
not a slower stream of intermediate edits. Transient awareness is a separate UX decision; it is
not required as a replacement stream of geometry transitions to satisfy this request.

For text, investigate the edit-session boundary rather than a longer character timer. Immediate
local editing and final-only publication are compatible in principle: Yjs permits delayed delivery
and combining updates with `Y.mergeUpdates`. Applying the combined update gives the peer the
result without replaying each keystroke in the UI. It still carries the CRDT information required
for merging; final-state presentation does not require a replacement-string network protocol.
Do not discard earlier incremental updates or overwrite a peer's concurrent text with a stale
whole-string draft. Existing Y.Text selection, composition and Undo behavior must survive.

Yjs does not decide when a user action is complete. The application must use existing gesture
completion and text-editor finish paths. Select the smallest normal integration after inspecting
them; this plan does not yet choose between local edit staging and buffering the existing CRDT
updates until completion. In particular, simply withholding the periodic update send is incomplete:
current join/repair replies encode the live document and can expose unfinished edits. Per-item
filtering must also respect causal dependencies within a document. These are implementation
questions to check, not evidence that final-state publication is a bad product choice.

Preserve the remote-origin guard, encryption ordering, framing, local persistence and ordinary
state-vector synchronization. Check completed-action visibility on join/reconnect, editing while
peers change the same item, finish/cancel, room switching and reload. Do not keep a Yjs transaction
open across pointer events or awaits, introduce edit locks or a second synchronization protocol,
or claim guaranteed unload delivery. If strict text-session isolation requires machinery outside
normal Yjs/provider integration, report that concrete limitation instead of silently replacing
the request with timer tuning or declaring the phase complete.

Sources: [Yjs document updates](https://docs.yjs.dev/api/document-updates),
[Y.Doc transactions and observers](https://docs.yjs.dev/api/y.doc),
[awareness](https://docs.yjs.dev/api/about-awareness).

## Architecture and SOLID review direction

These are initial recommendations to test against each affected workflow, not mandates to add
every pattern. Record retain/change decisions and their reasons in this working plan.

| Area                              | Assessment and recommended direction                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command/query separation and CQRS | Keep mutation APIs separate from reading/deriving canvas state. Yjs plus the graph projection already provides a useful write/projection boundary; it does not justify a second authoritative domain model, separate database or command bus. Agent reads may update session bookkeeping without mutating the canvas.           |
| Visitors and dispatch             | Keep plain functions and typed discriminated statements. Existing handler tables and recursive traversal fit the language. Inspect dispatch coverage and intentional fallbacks; improve exhaustiveness where a missing case could silently skip behavior. Do not introduce an AST class hierarchy or generic visitor framework. |
| Decorators and adapters           | Keep LockedTransport as a composition-based decorator. Verify it preserves optional carrier capabilities, callback semantics and lifecycle. Existing AccountTable/AccountServices and Presenter Stage are useful ports; retain them. TypeScript decorator syntax is not needed.                                                 |
| Observers and derived queries     | Retain Yjs observers and React's external-store integration. Investigate broad subscriptions and repeated derivation. Prefer observing the relevant shared maps/types and coalescing redundant projection work before maintaining a persistent dirty-cell graph or a second store.                                              |
| Single responsibility             | RoomSession coordinates transport, persistence, pictures and saving; EditorController coordinates graph interaction. Inspect change ownership, not just their line counts. Extract cohesive save/picture or gesture work only where it separates a real dependency or repeated lifecycle concern.                               |
| Open/closed                       | Keep data-driven stencil/style/statement mappings. Adding a type legitimately touches the one model, language and renderer. Do not introduce plugin registries to make every future type possible without editing code.                                                                                                         |
| Liskov substitution               | Exercise the existing transport implementations against the promises consumers actually use: readiness, close, reconnect, ordering and capabilities. Preserve legitimate differences between local, relay and encrypted carriers. No new inheritance tree is proposed.                                                          |
| Interface segregation             | Use existing focused ports and TypeScript Pick/structural types when consumers need less than a controller/session. Keep upload/start capabilities distinct from basic synchronization needs; splitting interfaces requires an actual consumer problem, not an interface-count target.                                          |
| Dependency inversion              | Remove core/session dependence on editor-owned asset state. Let application composition connect picture stores to rendering. Give browser and relay icon consumers a shared asset module. Keep AWS implementations behind existing account/relay ports.                                                                         |

CQRS is a selective design tool, not a maturity checklist; see
[Fowler's discussion](https://martinfowler.com/bliki/CQRS.html). Narrow UI subscriptions should
continue to use cached, stable snapshots under
[React's external-store contract](https://react.dev/reference/react/useSyncExternalStore).

## Module and file ownership proposal

Retain one frontend project and its existing browser/relay/control/accounts build entry points.
Use the current folders as the starting point. Proposed moves address observed dependencies:

| Current code                                                                       | Proposed owner                                                                                   | Reason and boundary                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document/useCollaborativeText.ts`                                                 | `components/useCollaborativeText.ts`                                                             | React/textarea binding belongs beside UI consumers; Y.Text mutations stay in the document model.                                                                                                            |
| `document/files.ts`                                                                | `files/canvasFile.ts` plus a browser download helper if needed                                   | File orchestration may depend on model and language. Browser download code does not belong in the core model. Keep one language and exact source round trips.                                               |
| `editor/icons.ts`, `iconData.ts`, `vendorIcons/`                                   | `assets/icons/`                                                                                  | Browser stencils, rendering and agent search share the catalog. Preserve lazy vendor loading and bundle separation. Split catalog/rendering only if an actual server dependency or bundle cost warrants it. |
| Room-to-editor picture wiring                                                      | UI composition around the existing picture bridge                                                | RoomSession owns its picture store; UI owns registering render callbacks and cleanup. Do not add a service locator or general multi-room asset framework.                                                   |
| Reusable placement/arrangement/routing calculations currently owned by `language/` | Move only the shared pure functions into `document/` where both editor and language require them | Parsing and language-specific statements stay in `language/`; shared canvas geometry should not depend on syntax. Inspect each helper's real inputs before moving it.                                       |

Keep server implementations in `relay/` and `accounts/`, browser account code in `account/`,
and fixtures out of production imports. Their existing naming is imperfect, but renaming all
directories or splitting packages has not earned its cost. Keep tests near their owning modules;
browser journeys may stay together where they test whole editor workflows. Avoid barrel files
that accidentally join browser and server dependencies, generic `utils/` dumping grounds and
mechanical file splitting to meet a line-count target.

## Milestones

### M0 — Network efficiency

#### Execution expansion

Branch `59c001e0-8560-4e0e-a52e-681131a65074`.

1. Add an application action boundary shared by the existing text binding and provider. Local
   Y.Text changes remain immediate and locally persisted. Merge outbound CRDT updates when the
   action finishes; defer document-derived join/vector replies while it is open. Keep receiving
   peer updates and awareness normally. All local document writes during an action publish
   together, rather than attempting unsafe per-item CRDT filtering.
2. Use the same boundary for collective transforms. Retain the existing local geometry writes
   and measurement rate, which already protect drawing-path work; publish their merged result
   on release. This replaces the proposed separate geometry preview work with a smaller complete
   solution and preserves local persistence without another document or geometry representation.
3. Verify unpublished text/geometry during editing, concurrent merging, final publication,
   joining/reconnecting and local reload. Preserve normal browser composition and Undo coverage.
   Text finishes on leaving its editor/tools, Escape or Ctrl/Command Enter; plain Enter remains
   multiline content. Escape retains its current finish behavior rather than becoming cancel.

Completed: 13 provider/action tests and 22 browser journeys pass across action publication,
Markdown controls, interface reachability, active selection, composition, Undo, PNG, reload and
traffic. Existing four traffic journeys passed before the change. Browser helpers now explicitly
finish a text edit before expecting it at a peer; active-edit assertions remain covered separately.
No timer was lengthened. Tests demonstrate zero intermediate updates and one final update for a
20-character action while still receiving and merging a peer's text.

The action boundary is application lifecycle state, not stored canvas data or a new wire protocol.
It is needed because provider timers and state-vector replies cannot infer user completion.

Scope: identify completion boundaries and assess normal Yjs mechanisms for publishing completed
actions across geometry and text. Implement the simplest applicable approach only after execution
is authorized. No current performance failure or send-interval change is assumed.

Use the existing traffic browser harness, provider tests and local relay. Exercise rail drag,
native move/resize, collective transform, freehand, realistic timed typing/deletion/paste,
sustained typing, idle, late join and reconnect. Separate update, awareness, vector and framing
traffic; count actual serialized bytes, logical actions, local writes and peer-visible delay.
Use small canvases and the existing representative larger fixtures. Compare the same workload
before and after; report variability. Validate shared-state publication during an unfinished
action and on completion; an improvement in packet count alone does not prove the requested behavior.

Acceptance: local input stays immediate; peers receive completed actions rather than a timed
stream of intermediate text/geometry; finished text/geometry converges; Undo, selection,
composition and local reload retain their behavior. Define the text finish/cancel semantics from
the actual editor and explain the loss of live text visibility during an unfinished edit.
Test both ordinary/password rooms and the agent provider consumer. No guarantee of network
delivery on unload, new persistence service, bandwidth quota or arbitrary runtime cap is added.

### M1 — Architecture patterns

#### Execution expansion

Branch `1213fa6f-e7c7-4bd8-b864-4bc7022c769e`.

1. Retain canonical Yjs with graph projection, Draft's atomic commit, existing narrow account
   and presenter ports, and the encrypted transport decorator. They match current consumers.
   Replace the writer's optional fallback dispatch with explicit conversation classification
   and exhaustive handler tables. Keep recursive functions rather than adding visitor classes.
   Existing language/session tests establish preserved parsing, atomicity, comments and Undo.
2. Retain the full projection and existing React subscriptions for now: source inspection shows
   broad work, but no measured editing bottleneck warrants a second incremental projection cache
   or another UI store. Keep local transform rate control for its existing drawing-path cost.
   Action completion now controls publication independently. Lifecycle review found capture-loss
   and controller teardown could strand a transform; M0 closes those through the existing finish path.

Review the complete affected command/query, language traversal, adapter/decorator, observer and
resource-lifecycle paths using current code and M0 observations. Classify each as keep, simplify,
or refactor, with source evidence and a concrete benefit. Trace UI and agent producers through
document mutation, projection, networking and saving. Review errors and disposal alongside the
happy path. Do not turn the list of example patterns into a framework adoption exercise.

Acceptance: every material recommendation identifies its owner, caller/callee contracts and
preserved behavior; existing appropriate patterns are explicitly retained. Implement only
bounded changes justified by this review when execution is authorized. Profile broad projection
and UI notifications before selecting an invalidation strategy. No speculative full CQRS rewrite.

### M2 — SOLID responsibilities [depends on M1]

#### Execution expansion

Branch `3d935f8a-4786-4c65-9c8b-c97a4bb0bb74`.

1. Single responsibility: keep EditorController and RoomSession as lifecycle coordinators; their
   size alone does not justify new services. Move UI binding and file/asset ownership in M3/M4.
   Open/closed: retain the data-driven stencil/style mappings and strengthen closed statement
   coverage in M1. Do not change the canonical Item shape into an inheritance tree.
2. Liskov: retain Local/Relay/Locked transport composition and capability forwarding, verified
   by existing transport tests and a new actual encrypted completed-action/late-join case.
   Interface segregation: the provider consumes only the action port's active/subscribe members,
   not ownership of beginning/ending UI actions. Existing Stage and account ports stay narrow.
   Dependency inversion: preserve those ports; remove the concrete editor asset dependencies in
   M3/M4 rather than introducing a container. No new interface has only a mock consumer.

Apply all five principles to the inspected workflows and the concrete coupling identified above.
Prefer focused functions, composition and existing structural ports. Consolidate duplicated
behavior only when its semantics and ownership really match. Keep one canonical item model and
the current language/agent transaction and stale-write behavior.

Acceptance: each changed contract has a real consumer and a stated responsibility. Transport
substitution and cleanup remain correct. Tests exercise observable differences and failures,
not mock-heavy class diagrams. A principle that already fits needs a reasoned retain decision,
not a compulsory code change. Reconcile findings here with M1/M3 rather than duplicating work.

### M3 — Module separation [depends on M1, M2]

#### Execution expansion

Branch `dd13aad1-fb0c-4b53-a221-2103552889de`.

1. Move shared icon catalog/assets, pure layout/route functions and arrangement calculations
   to their owning modules, keeping syntax-dependent draft operations in language. Move React
   text binding beside components and canvas file orchestration into files; separate browser
   download behavior from the reusable codec. Update every consumer with the move, without
   compatibility barrels. Wire picture store/render subscriptions in Canvas composition and
   remove RoomSession's import of editor globals.
2. Typecheck and run existing model/language/icon/agent tests; final browser/build verification
   is shared with M4/M5. Saved-copy types and encryption codecs remain shared contract dependencies;
   a directory-level arrow alone does not warrant another abstraction or package.

Establish the dependency direction for model, language, files, UI composition, rendering assets,
collaboration and server adapters. Remove RoomSession's editor-picture wiring dependency and
give shared icon and geometry code appropriate ownership. Review shared saved-copy types
between `account/` and `collaboration/` as a contract dependency, not an automatic violation.

Acceptance: model code has no React/maxGraph/server implementation dependency; synchronization
does not depend on UI state; the browser entry cannot reach server/fixture code; relay agent
catalog use does not require browser rendering. Preserve privacy, file semantics and encryption.
Use current import/build checks; add only targeted existing-linter restrictions if a concrete
boundary needs enforcement. No architecture-testing framework or new package layer is assumed.

### M4 — File organization [depends on M3]

#### Execution expansion

Branch `6496a162-d8b5-4a1a-891c-b1f33e221114`.

1. Complete moved-path consumers, including the vendor import generator and formatter exclusion.
   Keep vendor JSON bytes unchanged. Update the code map, architecture and text-completion usage
   documentation. Keep browser journey tests in editor because their consumer is the whole canvas;
   keep icon tests with their shared module. Correct the drawing plan's stale file path without
   resuming drawing work. No package split, compatibility barrel or broad directory rename.
2. Verify source imports, typecheck, existing tests and production build. M3's ownership changes
   and required physical moves landed together to keep every consumer coherent. Final browser
   verification is M5's shared integration check.

Complete the ownership moves selected above, update imports/tests/build entry points and the
normal architecture/code-map documentation, and remove superseded paths. M3 responsibility
changes and their necessary moves may land together; do not duplicate refactors just to obey
phase labels. Further subfolders require a navigation/ownership benefit demonstrated in review.

Acceptance: a reader can locate domain rules, rendering, synchronization, codecs, UI hooks and
runtime adapters without crossing misleading directories. No compatibility re-export layer,
stale imports, new general-purpose bucket or unrelated rename sweep. Browser/server bundles
still contain only their intended runtime dependencies, and icon/font assets still load/export.

### M5 — Integration verification [depends on M0, M1, M2, M3, M4]

#### Execution expansion

Branch `0d8f54f3-a985-42ef-a030-57629257d930`.

1. Run full CI and browser journeys, production builds and focused Firefox action/selection
   checks. Review the actual failures without weakening assertions. Compare the same controlled
   20-edit workload through ordinary 40 ms delivery and through action completion, recording
   actual frames and serialized bytes rather than claiming a general speedup. Reuse the existing
   scale/450-object journeys for local canvas timing; no new latency cap or loader is introduced.
2. Review the final diff and source/runtime ownership, update this plan's actual state and close
   only after required checks complete. No commit, push or deployment is authorized.

Run required `make ci`, `make build` and local independent-context browser journeys. Verify
concurrent editing and same-item conflicts, peer-local Undo, grouping/world geometry, connector
editing, arrangements, diagrams at scale, pictures/password rooms, slides/templates/presentation,
Markdown/code/math, exact files and PNG content, and agent writes/reads/stale rejection.
Use existing journeys wherever they already establish behavior. Add targeted cases for changed
batch scheduling, final commits and lifecycle boundaries; do not duplicate implementation in tests.

Acceptance: required checks pass without weakening unrelated assertions. Repeat M0 measurements
on the final implementation; distinguish frame savings, byte savings, local CPU work and peer
latency. Keep existing performance controls; aspirations do not authorize new hard budgets or
threshold tuning. Record results briefly here/chat and use ignored outputs for artifacts, without
a separate audit/verification report. Update normal architecture/usage docs for actual changes.

## Decision ownership

Action boundaries, normal Yjs integration and focused ownership moves were implementation choices
made within the requested scope. New evidence may invalidate those mechanisms;
revise the mechanism while retaining the requested coverage. If a future result requires changing
Yjs authority, encryption, persistence guarantees or another agreed product boundary, that becomes
a user-owned decision before dependent work proceeds.

## Sulion mapping and current state

Root: `5da414cf-c266-4c14-ae80-64a1231acb6b`.

| Milestone | Phase ID                               | State     |
| --------- | -------------------------------------- | --------- |
| M0        | `8f36a8f1-59a8-4d04-8a1f-a0e7fea0a0ee` | Completed |
| M1        | `f12b115b-81c1-4f03-8c8b-8294eb1fdd60` | Completed |
| M2        | `40181a16-974f-4681-85a6-883caf86e175` | Completed |
| M3        | `a55f244c-f607-40ba-b05d-0e5ff497e206` | Completed |
| M4        | `07fbcf31-df3f-4528-9af8-5b86e4ffd1d2` | Completed |
| M5        | `d8871919-752e-4145-a5a0-c0c86f41436f` | Completed |

The earlier execution marked all phases complete locally. Its final CI passed 329 tests, types, formatting and Terraform formatting,
with 103 lint warnings and no lint errors; the production build passes. The sole-holder join case
also passes. The first full Chromium run passed 92/93: the remaining
presentation journey expected unfinished peer text, and now explicitly finishes that edit before
its unchanged rendering assertions. The clean full Chromium run passes all 93 tests in 429 seconds.

Seven focused Firefox action/selection/composition journeys pass. The selection/composition tests
now express peer appends/prepends through actual keystrokes instead of replacing the whole field;
their caret and composition assertions remain unchanged. No diagnostic probes remain in the app.

In a controlled provider workload of 20 edits at 100 ms intervals, ordinary 40 ms delivery sent
20 update frames / 3580 serialized bytes; completion sent 1 / 407. This measures that workload,
not general editing speed. The final 450-object journey measured 680 ms import and 1428 ms
sync on this host; the existing 3000-object scale journey also passes. Broad projection
and UI subscriptions were retained because no measured bottleneck justified additional machinery.

Tradeoff: while an action is open, this client's document-derived sync replies wait too. A new
participant can receive the committed canvas from another peer; if the active editor is its sole
reachable holder, the join waits for completion. Local persistence and incoming edits continue.
WebKit and native OS IME integration have not been verified in this work; composition event and
real pointer/keyboard journeys cover the tested behavior. No commit, push or deployment performed.
The earlier source review, dependency scan and diff checks passed. Subsequent structural review
found the architecture/SOLID outcome incomplete; remaining work is tracked in ARCHITECTURE-PLAN.md.
