# Structural architecture and SOLID refactoring

Prepared 2026-11-08 against `8483e42` plus the current uncommitted working tree.
Sulion plan: `3e8cc970-6a4e-4cf8-87c1-fb2ecf0220dd`.
The owner has authorized executing all phases locally. Commit, push and deployment are not
requested. Existing uncommitted work is the implementation baseline and remains preserved.

## Outcome and boundaries

Correct the six structural findings: shared domain policy, editor interfaces and rendering
boundaries, transport capabilities, room/file/save ownership, language extension contracts,
and account wire contracts. The result must change responsibility and dependency ownership
in production, not just introduce interfaces or move existing code to different files.

User requirements and corrections:

- Review interfaces, module structure, inheritance and composition. A collection of minor
  defects is not a substitute for architecture and SOLID work.
- Fix all six findings. A phase cannot omit a finding because unrelated tests pass.
- Preserve canonical Yjs, the one canvas representation and language, browser collaboration,
  anonymous and local rooms, local persistence, password encryption and vendor-icon rules.
- Preserve completed-action publication. No performance defect is assumed; timer tuning and
  a new synchronization protocol are outside this plan.
- Use the current branch, native editing and local test services. Preserve existing edits.

Implementation proposals, subject to source evidence:

- Prefer pure policy functions, focused ports and explicit composition. Keep the flat item
  representation, tagged syntax, Draft staging and useful existing infrastructure ports.
- Share rules only where their semantics match. UI gesture defaults, file fidelity and agent
  placement may intentionally differ; adapters keep those differences explicit.
- Retain EditorController and RoomSession as coordinators after removing misplaced policy.
  No command bus, event store, class hierarchy, DI container, plugin framework or package split.
- Keep this plan as the record of decisions and phase status. Do not create separate audit,
  verification or handoff reports. Update current-state architecture documentation as work lands.

Assumptions to check at each phase: these changes can preserve stored fields, file formats,
wire messages and user behavior. If apparent duplicates implement different rules, separate
their responsibilities instead of forcing equivalence. If a correction would change an agreed
product behavior or durability/privacy boundary, identify that decision before implementing it.

This plan supersedes the architecture-completion claim in [REFACTOR-PLAN.md](REFACTOR-PLAN.md).
The previous network implementation and useful ownership moves remain existing work; they
do not establish completion of the structural findings below.

## What counts as a fix

Each implementation phase starts by reading `sulion plan current`, its source bodies and callers.
Record the current owners and real production consumers briefly in that phase's notes. Then:

1. State the intended dependency direction and the responsibility of the changed contract.
2. Migrate every relevant production consumer, including UI, language, files and relay consumers
   where applicable. A new abstraction used only by tests does not count.
3. Remove superseded policy implementations and bypasses. A wrapper that delegates policy back
   to the previous owner does not complete the extraction. Distinct adapter behavior may remain,
   with its reason and owner stated.
4. Check observable outcomes through the real consumers, plus focused type/import checks for
   the claimed boundary. Neither test totals nor import direction alone establish both.
5. Have an independent reviewer trace the changed production paths against the phase outcome.
   Supply the requirements and actual diff, not only the implementer's completion summary.
   Unresolved structural findings keep the phase open; explain disagreements with source evidence.

Use the existing TypeScript, ESLint, Vitest and browser harness. Add targeted import restrictions
where a precise forbidden dependency is established, not a new architecture-testing framework.
Tests should assert independently specified behavior, not duplicate a function or derive both
expected and actual results from the same new table. Keep artifacts in ignored output folders.

## Target responsibility map

These are responsibility destinations, not a requirement to create one class/file per row.

| Owner                     | Responsibility                                                                          | Consumers and excluded dependencies                                                           |
| ------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `document/`               | Canonical records, shared domain policies and effective semantic appearance             | Editor and language consume it; no React, maxGraph or runtime server implementations          |
| `language/`               | Syntax, interpretation, explicit effect analysis, atomic Draft and agent session policy | Uses document policies; does not own a parallel set of domain rules                           |
| `editor/`                 | maxGraph adaptation, gestures, renderer translation and editor composition              | Graph-specific work stays here; renderer encoding is not the product control API              |
| `components/`             | UI and browser bindings using focused editing/query capabilities                        | Controls use semantic values and operations; composition may connect concrete editor adapters |
| `collaboration/`          | CRDT synchronization, frame channels, encryption and browser room coordination          | Provider needs messaging; relay control and picture services are separate capabilities        |
| `files/`                  | Portable canvas import/export orchestration and file picture preparation                | Uses document/language and supplied picture capabilities; does not require RoomSession        |
| `account/`                | Browser account access, saved-copy codec/adapter and WorkspaceSaver                     | Saved-copy adapter implements SaveableRoom without importing room/editor implementations      |
| Shared protocol contracts | Account request/reply types and channel/service message types                           | Runtime-neutral; browser and server adapters consume the same definitions                     |
| `relay/`, `accounts/`     | Runtime composition and infrastructure adapters                                         | Browser entry cannot reach these implementations; agents do not require browser editor code   |

## Phases

### P1 — Domain policy and semantic appearance

Addresses finding 1 and the rendering-policy foundation of finding 2. Start with
`document/canvasDocument.ts`, `language/draft.ts`, `language/describe.ts`, `document/transform.ts`,
`editor/graphChanges.ts`, `editor/arrangements.ts` and `editor/styles.ts`.

- Separate shared relationship-deletion decisions from applying their results to Draft, Yjs
  or graph edits. Reconcile the actual semantics before replacing the separate cascade loops.
- Put effective named/item look resolution and semantic appearance defaults under one owner.
  Distinguish authored values, effective semantic values and renderer encoding. Keep maxGraph
  keys, image resolution and asset loading in the rendering adapter.
- Give repeated geometry/text capabilities an explicit owner: vendor aspect/rotation constraints,
  eligible text sizing and relevant box/link preconditions. Use narrow types/type guards where
  they express a real operation's input. Do not replace the canonical Item with another model.
- Update all producers/consumers of these policies, including language writes, transforms,
  arrangements, mutation capture and rendering. Keep peer-data rendering protections.

Completion evidence: independently expected deletion sets for nested holders, line anchors and
incident links agree through document, language and native editor paths. Named-style plus item
overrides resolve consistently for controls, rendering and transform calculations. Vendor geometry
and text-sizing cases preserve their intended constraints. Raw authored fields still round-trip
through files. No parallel cascade or effective-look implementation remains for the same policy.
Any intentional differences are identified rather than normalized out of comparisons.
Appearance cases include type/stencil defaults, named styles, item overrides, explicit `false`,
cleared/default fields and mixed selections. Effective resolution leaves authored values sparse;
deep-zoom scale applies once. Controls, preview, measurement and canvas agree on typography,
while approximate domain footprint estimates remain distinct from browser text measurement.
Renderer-only defaults and asset loading stay outside semantic appearance queries.

### P2 — Editor commands and focused consumer interfaces

Depends on P1. Addresses finding 2. Inspect `editor/controller.ts`, `topics.ts`, `composition.ts`,
`textLayout.ts` and every production consumer of EditorController, not only TextProperties.

- Define who owns selection-wide style/geometry/topology operations, transaction boundaries,
  Undo grouping, action completion and follow-up view work. Put shared operations in cohesive
  functions; keep graph gestures as adapters and keep native Y.Text editing intact.
- Replace broad controller parameters where a real consumer needs only a document, selection,
  callback or focused operation. Keep graph access in graph-facing adapters and composition.
  An interface reproducing the entire controller surface is not a change in dependency.
- Migrated leaf controls receive semantic query values and focused operations/callbacks. Merely
  passing `Pick<EditorController, "document">` while the control still chooses transaction, Undo
  and selection-operation policy does not satisfy this phase. Mutable document access remains
  appropriate for canonical text bindings, application operations and graph adapters.
- Migrate Inspector, TextProperties, MarkdownPreview, text measurement and other style consumers
  to P1's semantic appearance. Remove product-control decoding of maxGraph keys and font bits.
- Separate read-only endpoint/viewport queries from explicit topology creation. Trace
  `endpointFor` and navigation callers so viewport work does not accidentally own document writes.
  Establish whether any existing write is intentional before changing observable behavior.

Completion evidence: the consumer inventory accounts for every remaining controller dependency;
each has a graph/composition reason or has been narrowed. Controls and preview no longer call
`objectStyle` to discover product values or trigger unrelated asset resolution. Real pointer and
keyboard journeys cover multi-selection formatting, geometry, grouping, topology, navigation,
text completion and peer-local Undo. Selection operations produce their intended atomic changes;
viewport-only operations have explicitly established document-write behavior. Superseded direct
transaction/policy code is removed from migrated controls, not copied behind a nominal interface.

### P3 — Language extension and effect contracts

Depends on P1; reconcile with P2's shared operations. Addresses finding 5. Inspect `syntax.ts`,
`attributes.ts`, `describe.ts`, `writer.ts`, `session.ts` and `printer.ts` as one pipeline.

- Make statement target/effect analysis exhaustive. Every statement explicitly declares its
  targets/effects or its reason for having none; no missing handler means an implicit empty set.
- Classify attribute ownership across interpretation passes as handled, delegated or rejected.
  Preserve legitimate multipass layout; do not make each pass interpret every attribute.
- Make these classifications govern production dispatch and actual receiving passes. An exhaustive
  metadata checklist beside unchanged optional-call tables is insufficient. Distinguish direct
  stale-check targets, affected canvas state and intentional derived effects; preserve the existing
  stale-write policy, including conversation/view behavior, unless a concrete correctness finding
  justifies a change within the agreed requirements.
- Consolidate overlapping look keyword, value and canonical-print metadata where one typed
  descriptor removes independent definitions. Enforce coverage of the model's Look keys across
  words/flags/printing, and of all statement/attribute variants across their owning passes.
- Retain tagged syntax and ordered resolution/layout passes, Draft's atomic commit and
  LanguageSession's observation/stale-write/Undo policy. Use functional traversal where analyses
  share child traversal; do not add visitor classes merely to name a pattern.

Completion evidence: omitted statement/effect and attribute ownership classifications fail type
checking. Canonical parse/write/print round trips cover every Look property and representative
statement family, including multiline Markdown/math. Agent read-change-write cases exercise stale
rejection for edits, nested items, links, deletion and conversation operations as applicable.
Failed writes remain atomic. Existing omissions are explicitly intentional or corrected; making
Writer exhaustive while leaving silent fallback analysis elsewhere does not finish the phase.

### P4 — Compose transport capabilities separately

Independent of P1–P3. Addresses finding 3. Inspect `collaboration/transport.ts`, `provider.ts`,
`relayTransport.ts`, `lockedTransport.ts`, `room.ts`, `pictureUploads.ts` and `relay/serverPeer.ts`.

- Define the frame-channel contract used by CollaborationProvider. Separate relay activation
  and picture-upload authorization capabilities for the room/application consumers that use them.
- Compose these capabilities explicitly for local, relay and password rooms. One concrete relay
  adapter may implement several ports; separate interfaces do not require separate connections.
- Make LockedTransport decorate only the frame channel. Remove manual forwarding of unrelated
  service capabilities. Keep shared channel/service DTOs independent of browser configuration.
  Its key/unlock and envelope-exchange protocol remains encryption-owned behavior.
- Migrate browser RoomSession, agent InProcessTransport and all other production consumers.
  Preserve callback ownership, readiness, ordering, reconnect and close expectations at the channel
  boundary, including the provider's completed-action integration.
- Include picture-download enablement, fresh-arrival marking, automatic edit-triggered activation,
  the Start collaboration control and upload authorization in the migration. Compose their status
  reporting explicitly. Preserve one underlying connection and one owner of its close operation;
  provider destruction and service capabilities must not compete to own the carrier.

Completion evidence: provider accepts a real channel without relay/upload capabilities; ordinary,
local, encrypted and in-process consumers use the intended composition. Encryption no longer
depends on the activation/upload contracts. Shared channel scenarios exercise the substitutable
behavior, while capability-specific tests exercise their legitimate differences. Real independent
browser contexts verify joining, edits, action completion, reconnect and password rooms; local
picture fixtures verify upload behavior. No wire-format or encryption/persistence change is used
to make the interface split easier.

### P5 — File and saved-copy application ownership

Depends on P4 for composition; uses P1 policies where relevant. Addresses finding 4. Inspect
`collaboration/room.ts`, `files/canvasFile.ts`, `components/WorkspaceHeader.tsx`,
`account/workspaceFile.ts`, `workspaceSaver.ts` and `components/SaveWorkspace.tsx`.

- Move portable-file picture preparation, hash renaming and import/export sequencing into the
  file application module. Supply document, picture and codec collaborators; do not pass a whole
  RoomSession or move its implementation unchanged behind a wrapper.
- Give saved-copy creation/application a focused adapter implementing the existing SaveableRoom
  contract. Account-specific saved-copy policy leaves the room coordinator; room-key ownership
  and transport/persistence coordination remain with their existing owners.
- Migrate App's saved-copy application paths and SaveWorkspace's room adapter consumption, as
  well as the header's file operations. Preserve saved-copy/persistence transaction-origin filtering
  and the generic account-list title that prevents password-room titles leaking. A RoomSession
  facade retaining the old saved-copy implementation does not satisfy the extraction.
- The saved-copy adapter owns the actual encode/decode, picture inclusion, envelope adoption and
  Yjs merge work. Read current envelope/key state at operation time, preserving adoption before
  awaiting unlock. Composing the adapter must not capture a stale key/envelope snapshot or supply
  callbacks that delegate its policy back to old RoomSession methods.
- Reduce UI file handlers to choosing a file, invoking the operation and displaying/fitting its
  result. Assign validation, mutations and asynchronous operation lifetime to explicit owners.
- Keep graph rasterization, selection closure and viewport fitting in editor/UI adapters. File
  orchestration accepts selected IDs and PNG bytes or a focused renderer callback; it does not
  acquire an EditorController/maxGraph dependency. Preserve whole-document canvas-file export
  separately from PNG export of either the selection or the whole canvas.
- Keep RoomSession as browser room composition/coordination. Extract construction only when it
  simplifies a real dependency; ServerPeer keeps its smaller server composition.

Completion evidence: RoomSession no longer parses portable canvas syntax or implements its
picture preparation, and the header no longer sequences the import pipeline. The saved-copy
adapter works with the existing WorkspaceSaver without a room/editor implementation dependency.
Exercise ordinary/password/local file import and export, pictures, PNG-embedded copies, id
collisions, exact source fidelity, local reload and saved-copy merging using local fixtures.
Assert plain portable picture hashes versus room-sealed storage and encrypted saved copies.
Failure and room-switch cases establish ownership of in-flight operations. No hidden plain copy,
alternate canvas model or durability reduction is introduced by the extraction.

### P6 — Shared account wire contract

Independent of P1–P5; P5's saved-copy representation remains separate. Addresses finding 6.
Inspect `account/accountStore.ts`, `accounts/api.ts`, their adapters and existing local fixtures.

- Establish one runtime-neutral owner for shared profile/workspace requests and replies, including
  upload authorization and revision metadata. Client projections such as a reduced profile remain
  explicit projections of that contract, not accidentally duplicated declarations.
  Keep account HTTP metadata contracts separate from private SavedCopy/WorkspaceContents and
  browser auth configuration; no generic shared-types dumping ground is needed.
- Type both request creation and server response construction against it. Retain validation at
  the HTTP boundary; shared TypeScript types do not validate untrusted JSON.
- Ensure the actual endpoint reply constructions and client outbound bodies are checked, not just
  annotated imports. Generic `ApiReply.body: object`, `api<T>` assertions or equivalent casts must
  not bypass the new contract at those construction sites. Keep boundary decoding and errors
  explicit without introducing a general HTTP framework.
- Keep AccountTable/AccountServices and AWS adapters server-owned, Auth browser composition
  intact, and saved contents opaque to the account service. Avoid an API-generation framework.

Completion evidence: both sides consume the same wire types and duplicate DTO declarations are
removed. Local AccountStore-to-AccountsApi tests exercise profile and workspace listing, save/load,
revisions, profile updates, workspace/account deletion, malformed input and refusal responses.
Check every existing route's request, successful reply and error/empty/not-found status behavior.
Browser builds reach no server/AWS implementation; server contracts do not require browser
configuration or decode private saved contents.

### P7 — Integration and independent structural review

Depends on P1–P6. This phase checks the architecture outcome as well as regression behavior.

- Revisit all six findings against the final production source and dependency graph. Trace a
  formatting edit, relationship deletion, agent write, encrypted-room join, picture-bearing file
  import and account save end to end. Identify the actual policy owner and each adapter.
- Independently review interfaces, composition roots, module/file placement and inheritance.
  Confirm the real consumers use each changed contract and old bypasses/duplicate rules are gone.
  Retain useful Stage, SaveableRoom, storage/auth ports and record/function composition. Review
  Liskov against channel/port promises; no item subclass hierarchy is required.
- Preserve meaningful error inheritance (LanguageError, StaleError and WrongPassword), and inspect
  maxGraph method/callback overrides as adapter contracts rather than checking only `extends`.
  State channel guarantees and legitimate differences: encrypted readiness waits for unlock;
  relay reconnect/control, local BroadcastChannel and in-process delivery have different mechanics.
- Use precise existing-linter restrictions for established forbidden dependencies, and inspect
  browser/relay/account/control build entry reachability. Folder arrows alone do not prove a cycle.
- Run `make ci`, `make build` and the independent-context local browser suite. Use focused browser
  checks in other configured engines for changed text behavior. Existing failures retain their
  original scenarios until diagnosed; changing input methods is a different test, not resolution.
- Update architecture/code-map/usage documentation for actual ownership and behavior. Keep
  completion notes in this plan and Sulion phase notes, with remaining uncertainty stated.

Completion evidence: each P1–P6 outcome has structural proof and behavior proof, and the reviewer
has checked both. Record failures honestly; passing broad tests does not waive structural work.
Do not claim a speedup, require a performance threshold, or substitute new profiling work for
the requested architecture changes. Close only when every outcome is supported. Commit/push
and deployment require their own authorization.

## Ordering and current state

P1 establishes shared domain policy; P2 and P3 consume it. P4 establishes transport composition
before P5 simplifies room/file/save ownership. P6 can proceed independently. P7 integrates all
six. Concurrent execution is optional where ownership does not overlap; phase dependencies and
shared-file ownership take precedence over parallelism.

| Sulion phase | Work                                             | State     |
| ------------ | ------------------------------------------------ | --------- |
| 1            | Prepare and challenge this plan                  | Completed |
| 2            | P1 Domain policy and semantic appearance         | Completed |
| 3            | P2 Editor commands and focused interfaces        | Completed |
| 4            | P3 Language extension contracts                  | Completed |
| 5            | P4 Transport capability composition              | Completed |
| 6            | P5 File and saved-copy ownership                 | Completed |
| 7            | P6 Account wire contract                         | Completed |
| 8            | P7 Integration and independent structural review | Completed |

Planning was independently challenged and its corrections incorporated before execution.
All phases are complete locally after source review and integration. No commit, push or deployment
was performed for this work.

P1 deletion ownership: `document/relations.removalClosure` now supplies CanvasDocument, Draft and
graph mutation capture. Graph capture evaluates surviving cells' current relationships before
applying deletion, preserving native ungroup/reparent operations. The duplicate item-default
record was removed from Draft. Document/language deletion, dependent anchors/links and Undo
cases pass alongside existing model/language suites; native browser deletion/navigation checks pass
in Chromium, Firefox and WebKit.

P4 production migration: provider and agent transports consume FrameChannel; RoomSession composes
activation and picture services separately, including download availability and automatic/manual
start. LockedTransport retains envelope/key handling and no longer forwards those services.
Root source review confirmed one carrier/close path and neutral protocol ownership; 97 targeted
tests passed. Final browser integration and terminal-close contract checks also pass.

P6 production migration: shared HTTP metadata contracts type the real client request bodies and
each server success response. Generic asserted reply handling and duplicate DTOs were removed.
Root reviewed both endpoint construction and client decoding. Local API/client/saved-copy tests
pass 39 cases, including revisions, refusals, unsupported methods and opaque password contents.
Final build/dependency and independent-context integration checks pass.

P1 appearance ownership: `appearance.ts` owns authored merging and semantic defaults; renderer
encoding/assets remain in styles, browser typography consumes the semantic values, and shared
capabilities express repeated eligibility and aspect policies. Controls, preview, measurement,
arrangements and transforms use these owners; named-style rotation reaches collective transforms.
Independent source review covered default precedence, sparse fields, scaling and producer differences.

P2 consumer migration: leaf object/text/Markdown/connection/topic/slide/comment/view controls now
receive semantic values and focused operations. Inspector/Canvas compose canonical text bindings;
Workspace, Presenter mask, SelectionFrame, StencilBrowser, LeftRail and Header retain graph or
composition responsibilities. Selection formatting and derived fitted height commit together.
Topology commands plan anchors before one transaction; viewport queries create no canonical items.
Independent review caught and corrected split Undo for derived height and scaled line-width conversion.
Source and caret edits remain synchronous; measuring visible fonts avoids an asynchronous source-edit
gap, with later edit/refit available after late font loading. Four real command/peer browser journeys
cover topology Undo/Redo, appearance+height Undo, Markdown+height Undo and scaled width editing.

The Firefox sub-plan `bad10d00-9433-4cd2-8b70-ea455bb3a478` reproduced the original replacement
failures. Firefox delivered whole-field replacement as composition; deleting/reinserting unchanged
characters invalidated peer relative positions. Composition now uses existing text reconciliation.
Both replacement and keystroke scenarios pass with the original selection/composition/Undo assertions
(five Firefox interaction cases); eleven focused Chromium action/selection/deletion/navigation cases
also passed. Temporary event diagnostics were removed.

P3 production contracts: effects govern writer routing and actual stale targets; attribute routing
selects receiving passes with explicit context-specific ignore/reject behavior. Look parsing and
printing consume one key-complete typed descriptor. Optional target/description dispatch and parallel
keyword/range/order tables were removed. Inline item restatements at link endpoints now receive the
same direct-target stale protection as other restatements; endpoint reads, derived cascades and
conversation policies retain their existing meaning. Root reviewed actual execution paths and an
independent `Required<Look>` round-trip fixture. Combined language/account checks passed 92 cases.

P5 production ownership: `CanvasFiles` performs actual file/picture preparation and sequencing;
`SavedRoom` performs actual saved-copy encoding, key adoption, merging and origin filtering.
RoomSession only composes these collaborators. App, Header and SaveWorkspace use the new adapters.
Signals terminate departed-room work; graph rasterization and viewport work remain editor adapters.
Independent review identified an inherited plain-copy fallback for a key-bearing room without an
envelope; the adapter now rejects instead. Only a room without key capabilities can return a plain
SavedCopy. Tests retain live-envelope reads, generic titles and restore/persistence-origin filtering.

P4 final contract review also exercised pending start/control responses and queued cryptography
after close. Terminal guards prevent status, reconnect, frames and callbacks reaching retired
consumers. These cases reproduced before correction. Independent source review confirms one carrier
close owner and preserved local/relay/encrypted/in-process distinctions.

P7 import checks found no browser path into relay/accounts implementations, no relay path into
editor/components, and no accounts path into private saved-copy/browser code. Targeted existing-ESLint
restrictions preserve domain, leaf-control, file-adapter and shared-protocol boundaries. Error
inheritance remains intact; maxGraph callback/method adapters preserve delegation and return values.
Final `make ci` passes all 389 tests in 45 files, types, formatting and Terraform formatting, with
100 lint warnings and no lint errors. Production site, relay, control, accounts and Auth0 Action
builds pass. The full Chromium suite passes 101 journeys in 25 files. Fifteen focused journeys
each pass in Firefox and WebKit, covering both full replacement and keystrokes, composition,
actions, command Undo, deletion and query-only navigation.

The host could not launch WebKit because OS libraries were absent; Playwright's dependency dry run
also failed because this host has no apt-get. Sub-plan `b66a9347-23e3-4844-8bf8-6d4417ea6ec9` used the
matching official Playwright image with the existing harness and local fixture, without publishing
ports or changing the host. All 15 cases passed and the temporary container was removed. Build/test
logs and artifacts remain in ignored `frontend/test-results/`. No source assertions or thresholds
were weakened to obtain passing results. Browser composition coverage does not exercise native OS IME.
