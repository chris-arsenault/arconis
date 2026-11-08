# Drawing tools and markup

## State and authorization

Execution authorized for all phases, including MCP language support and agent drawing journeys.
The user approved the proposal in this
conversation on 2026-11-08, then requested a plan and a pause while another agent works.
The subsequent request is to review recent commits before the drawing rewrite, with an explicit
requirement to fit the cleaned-up architecture and extend it as needed, never bypass it.
The architecture review reconciled the plan against `273967a`. All milestones are implemented,
including integrated MCP authoring, browser journeys, dense-board measurements and final checks.
The subsequent user request authorizes commit and push, followed by three independent agent
reviews against this spec. Deployment remains outside this task.

At review start the working tree was clean. The earlier concurrent changes have landed,
including Markdown, slide templates, shared policies, application boundaries and completed
actions. Concurrent interaction-plan and Auth0 edits remain outside this drawing work.

## Outcome and agreed scope

Provide a shared editable markup layer above the workspace, with a dedicated Drawing object
for sketches promoted into workspace content. The user's original examples were design
direction rather than individually mandatory requirements; the subsequent approved proposal
is the scope below. Tool grouping, phase order and implementation mechanisms remain revisable
when evidence supports a simpler implementation that preserves the agreed behavior.

- Markup is shared, saved and undoable, without automatic expiration. It does not participate
  in workspace layout, containment, connectors or ordinary selection. Drawing and erasing
  must not move or remove workspace objects. Freehand annotations remain at world positions.
- Show markup is local to each participant. Clear markup is undoable and leaves workspace
  content intact. Normal selection reaches workspace objects; markup lasso selects annotations.
- Pen has five visible width presets and finer adjustment. Highlighter has independent color
  and width settings and leaves underlying text readable. Offer a small color palette, recent
  colors, a picker and three editable favorites, with settings remembered per instrument.
- Highlight object adds a separate annotation that references a sticky, shape, picture or
  Drawing. Click again to remove it. It follows target geometry without changing target styles
  or vendor artwork. Multiple participants' highlights remain readable instead of accumulating
  stacked borders. Highlights obey markup visibility and export filtering.
- Pen and highlighter both work with freehand and quick shapes. Primary shapes: line, arrow,
  rectangle and ellipse. Secondary shapes: double arrow, polygon, bracket, brace and revision
  cloud. Drag arrows tail to tip with live direction preview; drag boxes and ellipses across
  bounds; Shift constrains proportions or angles; successive polygon clicks close at the start.
  Closed shapes support outline, fill or both; simple handles adjust shapes after creation.
- Whole-stroke eraser and lasso support practical markup editing. Lasso selects whole strokes
  and shapes for movement, scaling, rotation, recoloring, duplication, deletion or promotion.
  Precision eraser subsequently supports partial stroke removal.
- Make Drawing moves lassoed markup into a workspace Drawing in one undoable action, preserving
  appearance and editable source. Return to markup reverses it. A blank Drawing can also be
  placed directly. Drawings can be named, transformed, connected, commented on, and contained
  by frames and slides. They remain visible when markup is hidden.
- Double-click enters a Drawing with the same tools; Escape returns to workspace editing.
  Bounds clip its contents; Fit bounds to drawing removes empty space. Moving a Drawing moves
  its contents. Export as image is distinct from editable promotion.
- Fill applies solid color or a two-color linear gradient to a closed shape or explicitly
  closed freehand path. Gradient direction uses draggable handles. Include bucket cursor,
  eyedropper and recent colors.
- Export offers Include markup. Filtering applies to PNG pixels, embedded editable content
  and export bounds. Promoted Drawings are ordinary workspace content. Normal .arconis saves
  preserve everything by default; clean export may omit markup. Presentations have a local
  Show markup toggle.
- Keep the existing unified toolbar. Draw opens a compact contextual palette; avoid separate
  diagram/ideas workspaces or exposing every secondary setting at once.

## Boundaries and design provenance

Repository requirements: Yjs remains canonical; document fields, canvas language, files and
agent tools express one model; maxGraph remains the projection. See
[architecture](architecture.md), [ADR-0014](adr/0014-one-canvas-language.md), and
[ADR-0005](adr/0005-one-toolbar.md). Test against local servers and relays only, using real
pointer and keyboard input across independent browser contexts. No platform changes are
planned. Read Ahara integration guidance first if that scope changes.

User correction, from the architecture-review request: the drawing rewrite MUST fit the new
architecture, without workarounds or bypasses. Extensions are allowed where the feature needs
them. This requirement governs every milestone and takes precedence over older file references
or implementation suggestions in this plan. Architectural fit includes real production callers
and ownership of behavior, not merely import direction or new interfaces.

Recommended deferrals from the approved proposal: arbitrary user-defined layers, Bezier-node
editing, boolean operations, masks, arbitrary-region flood fill across intersecting strokes,
pixel-fragment lasso selection and automatic shape recognition. These are scope choices,
not claims that such features necessarily cause poor performance. Whole-shape fills and
whole-stroke selection remain in scope. No hard object limits, runtime caps, mandatory
flattening or new CI performance budgets follow from performance goals.

Agent implementation proposal: reuse editable primitives for markup and Drawing contents;
promotion changes ownership and workspace behavior rather than rasterizing content. Avoid
a second opaque drawing document. Start with existing maxGraph rendering and measure it.
Do not select a cache, renderer replacement or new persistence mechanism without a measured
need that the simpler approach cannot satisfy. Any render cache is derived, never canonical.

## Architecture integration contract

Baseline: `273967a` (canvas policies, application boundaries and completed actions), following
`8483e42` (Markdown and slide templates), `69d1e8e` (Auth0 Action compilation), and `c424499`
(relay message-limit test). Current source and [architecture.md](architecture.md) establish
the ownership below. The Auth0 and relay-test changes do not require drawing-specific changes.

- **Domain policy:** extend `document/appearance.ts`, `capabilities.ts`, geometry, transforms
  and `relations.ts` for shared drawing semantics, eligibility and removal closure. UI,
  language Draft and graph capture must consume the same policy where semantics agree.
  Explicit adapter differences remain explicit. Do not create a drawing-only parallel set
  of containment, deletion, defaults or vendor-geometry rules.
- **Appearance:** authored looks remain sparse; `effectiveAppearance` resolves named styles,
  defaults and overrides. Define highlighter transparency, closed fills and gradients as
  semantic fields through these owners. Only graph adapters encode renderer styles, and
  scale applies once. Leaf controls must not read graph styles to discover product values.
- **Commands and UI:** compose focused semantic values and callbacks into drawing controls,
  as Inspector does for existing leaf controls. Cohesive application commands own mutations,
  transaction origins, Undo grouping and follow-up view work; extend `editor/commands.ts`
  or adjacent cohesive command modules. Do not move selection-operation policy into React
  controls or expose the whole controller merely to make a new control convenient.
- **Action lifetime:** use `CanvasDocument.actions` and the existing provider publication
  boundary for drawing gestures that make intermediate local Yjs changes. Finish each
  stroke, shape, transform or eraser gesture at its operation boundary; merely entering a
  Drawing for a long editing session must not hold every local update until exit. Keep
  preview state derived/local or use existing awareness, as appropriate. Never add direct
  transport sends, per-item update filtering, a second Y.Doc or timer-based publication
  to bypass completed actions. Cleanup must close any action it opened.
- **Language:** extend `language/look.ts` for new Look terms; its typed descriptor owns
  keyword/value/print metadata. Extend `attributeRouting.ts`, `effects.ts` and writer
  dispatch when new syntax needs them. Preserve exhaustive classification, atomic Draft
  writes, authored-value round trips and LanguageSession stale-write/Undo semantics.
- **Projection:** maxGraph remains the rendering/interaction adapter behind the existing
  projection guard. Markup hiding, clipping and derived highlight outlines must not appear
  to mutation capture as canonical deletion. Preserve template underlays as noncanonical,
  noneditable copies; a Drawing held by a template must project into slides correctly.
- **Files:** extend `files/canvasFiles.ts` for portable export orchestration and
  `files/canvasFile.ts` for the language codec. Keep rasterization, selection closure and
  viewport work in editor/composition adapters. Supply the same export selection/filter
  to pixels, embedded text and picture preparation, preserving abort/room-switch handling.
  Handle an explicitly empty filtered selection correctly: current empty-ID APIs mean
  the whole document, so filtering all markup away must not accidentally export everything.
  Do not rebuild file sequencing in toolbar handlers or RoomSession.
- **Room and persistence:** use existing room composition, saved-copy adapter, frame channel
  and picture capabilities. New drawing content persists through the canonical document.
  Do not couple drawings to relay activation/upload services or put drawing-specific save
  logic back into RoomSession. Local visibility and active editing state stay outside Yjs.

Extend the existing precise ESLint dependency restrictions to new leaf controls where the
same boundary applies. Do not weaken checks or hide violations behind casts, wrappers or
duplicated rules. Boundary checks supplement real UI/language/file behavior tests.

## Context and reuse map

Sources inspected during proposal research and architecture review; re-read changed files
on execution resume:

| Source | Reuse or affected contract |
| --- | --- |
| `frontend/src/document/types.ts` | Existing drawing item stores a path; extend canonical types and shared style terms. |
| `frontend/src/document/appearance.ts`, `frontend/src/document/capabilities.ts` | Shared semantic appearance and operation eligibility; extend these owners rather than re-deriving their rules in controls. |
| `frontend/src/document/relations.ts`, `frontend/src/document/transform.ts` | Shared removal closure and collective geometry; add Drawing/highlight policies here where applicable. |
| `frontend/src/document/actions.ts`, `frontend/src/collaboration/provider.ts` | Local action lifetime and deferred completed-action publication; gestures must integrate with them. |
| `frontend/src/document/geometry.ts` | Existing stroke simplification; reuse where it preserves appearance. |
| `frontend/src/editor/input.ts` | Pointer sampling, local SVG preview, stroke creation on release. |
| `frontend/src/editor/commands.ts`, `frontend/src/components/Inspector.tsx` | Application commands own mutations and Undo; composition supplies semantic values and focused callbacks to leaf controls. |
| `frontend/src/editor/styles.ts` | Existing drawing projection and sole maxGraph style translation boundary. |
| `frontend/src/editor/projection.ts` | Shared document projection; markup visibility and Drawing rendering must respect its guard. |
| `frontend/src/editor/culling.ts` | Existing size-based culling, not evidence of viewport culling or dense-board performance. |
| `frontend/src/components/LeftRail.tsx` | Existing unified tools; contextual drawing controls belong with this interaction. |
| `frontend/src/components/SelectionFrame.tsx` | Existing collective scale and rotation gestures. |
| `frontend/src/language/` | Parser, writer, printer, reference and agent sessions must express the same new model. |
| `frontend/src/language/look.ts`, `frontend/src/language/effects.ts`, `frontend/src/language/attributeRouting.ts` | Typed look metadata and exhaustive syntax/effect ownership contracts used by production interpretation. |
| `frontend/src/files/canvasFile.ts`, `frontend/src/document/pngCopy.ts` | File persistence and embedded editable PNG data. |
| `frontend/src/files/canvasFiles.ts`, `frontend/src/account/savedRoom.ts` | Portable-file orchestration and saved-copy application ownership, separately composed by RoomSession. |
| `frontend/src/editor/pngExport.ts` | Current graph draw-pane export; extend bounds and content filtering together. |
| `frontend/src/editor/presenter.ts`, `frontend/src/components/Presenter.tsx`, `frontend/src/editor/templates.ts` | Local presentation and derived template underlays; preserve them for Drawing content and markup visibility. |
| `frontend/eslint.config.js` | Existing precise domain, leaf-control, file/saved-copy and protocol dependency restrictions. |

Research informing the controls:

- [Miro Pen](https://help.miro.com/hc/en-us/articles/360017730573-Pen): tool presets,
  highlighter, whole/partial erasing and lasso.
- [Microsoft Whiteboard ink](https://support.microsoft.com/en-us/whiteboard/draw-and-ink-in-whiteboard):
  widths, highlighter and single/double ink arrows.
- [tldraw performance](https://tldraw.dev/sdk-features/performance): culling, selective updates
  and batching are relevant approaches, not measured evidence for Arconis or a dependency choice.

## Milestones

### M0 — Canonical markup and drawing model

Scope: reconcile current sources with the architecture integration contract; settle canonical primitive ownership,
Drawing contents, highlight references, local visibility and shared ordering. Include language,
files, agent tools and undo boundaries. Decide how existing ordinary drawing strokes retain
their workspace role, rather than silently reclassifying them as temporary markup.
Map each new policy, command, control, syntax extension and file operation to its existing
owner before implementing it. Extend the owner where needed rather than introducing a bypass.

Acceptance: all new content has a single editable representation; round trips preserve paths,
styles, references and ownership. Concurrent changes converge, and local undo leaves peer work
intact. Define target deletion/undo behavior for highlights and containment/transform behavior
for Drawing contents before the corresponding interactions are built.
The production call paths follow the architecture integration contract, including existing
completed-action publication; a parallel implementation passing isolated tests is insufficient.

Evidence: focused model/language round trips and collaboration tests. Check existing consumers
of drawing geometry and holders; type-level coverage alone does not prove user behavior.

### M1 — Usable markup tools

[depends on M0]

Scope: compact palette, pen widths, highlighter, favorites, attached object outlines, primary
quick shapes plus double arrow/polygon, whole-stroke eraser, lasso, visibility, undoable clear,
and export filtering. Include the presentation visibility toggle.
Route controls through focused commands and shared appearance/capabilities. Define operation
completion and cleanup for each gesture; retain export orchestration in CanvasFiles.

Acceptance: participants annotate the same mixed board without disturbing underlying objects;
normal selection and markup selection reach their intended targets. Highlights track moving
and resized targets; hide is local, clear is shared and undoable. Clean PNGs exclude markup
from visible pixels, embedded content and bounds. Normal saves retain markup.

Evidence: independent browser-context journeys with real input, filtered file round trips and
PNG import checks. Inspect highlighter readability over text, pictures and colored notes.

### M2 — Promote and edit Drawing objects

[depends on M1]

Scope: blank Drawings, lasso promotion, reverse promotion, focused editing, clipped bounds,
Fit bounds, workspace transforms, naming, connections, comments and frame/slide containment.
Keep edit-session state local, finish individual actions while the Drawing remains open, and
extend shared containment/removal/transform policies. Preserve template-underlay projection.

Acceptance: a multi-stroke sketch becomes one workspace object without losing appearance or
editability; all peers see it; markup hide/clear leaves it intact. Enter/exit editing, move,
resize, rotate, undo, save/load and reverse promotion preserve geometry and ownership. Existing
workspace relationships work on Drawings without operating on their individual strokes.

Evidence: cross-context promotion/edit/undo journeys and file/PNG round trips; include nested
holders and connector attachment during transformations.

### M3 — Paint and annotation refinements

[depends on M2]

Scope: closed-shape and closed-freehand fills, gradient colors and direction, eyedropper,
precision stroke erasing, bracket, brace and revision cloud.
Extend semantic appearance, language descriptors and routed attributes together. Apply fills,
gradients and stroke splitting through application commands, with one Undo/action boundary
for each completed operation and no renderer-owned canonical fields.

Acceptance: bucket fill changes the intended closed shape, without treating underlying canvas
objects as paint regions. Solid and gradient appearance survives transforms, collaboration,
files and export. Precision erasing preserves surviving stroke segments and is undoable.
Secondary shapes use the same instruments and editing conventions as primary shapes.

Evidence: representative geometry and rendering checks, browser input journeys and round trips.
Explicitly check erasing boundaries and gradient appearance after resize and rotation.

### M4 — Integrated behavior and measured performance

[depends on M1, M2, M3]

Scope: integrated browser journeys, representative dense-board measurements, documentation
and required repository checks. Measure during earlier milestones too; this is the final
integration milestone, not permission to postpone discovering performance problems.

Acceptance: the complete workflow works across independent contexts, late join, reconnect,
undo and export/import. Document observed responsiveness and material limitations honestly.
Update existing usage/architecture/reference documentation as needed; do not create a separate
verification report. Run `make ci`, `make build` and relevant `make test-browser` checks before
any subsequently authorized commit.

Proposed measurement workload: around 1,000 workspace objects plus 1,000 strokes, including
long strokes and dense overlap, with two collaborating browsers. Record point counts, browser
and viewport/zoom so comparisons are meaningful. Measure input latency, pan/zoom, memory,
synchronization and export. Compare with the current renderer before introducing machinery;
these sample sizes are workloads, not product limits or hard CI thresholds. Keep generated
measurement artifacts in ignored output locations and summarize findings in chat.

## Assumptions and deferred choices

- Existing projection and simplification may be sufficient initially. The executor resolves
  this through measurements in M0/M1 and revisits it if dense cases perform poorly.
- Exact field names and ownership structure are implementation choices for M0, constrained
  by one representation, editable promotion and existing world-coordinate geometry.
- The executor settles highlight deletion, overlapping highlight composition and primitive
  hit testing in M0/M1 using the stated user behavior; these are not pending user approvals.
- Additional layer/vector features remain deferred. Reconsider only with a concrete user
  need and performance evidence; ask before materially expanding the agreed scope.

## Sulion mapping and resume

Root: `36242596-3382-4467-8ed5-c2e8b1224632` — Drawing tools and markup.

| Milestone | Phase ID | State |
| --- | --- | --- |
| M0 | `fdb9d8de-abaa-49da-982c-c6f5e10030a7` | completed |
| M1 | `c8891d36-b9d1-4ede-a006-6b7feb477cf8` | completed |
| M2 | `e6931690-bd7e-4aac-ae34-899fdbf14406` | completed |
| M3 | `3ef678b3-dec0-435a-a346-6212ab8ac554` | completed |
| M4 | `0e83bf7e-829b-4d6f-8e0c-0909da02f12a` | completed |

The architecture review reconciled this plan with `273967a`. Execution expansions below
record each milestone. On resume, read `sulion plan current`, this contract, applicable
instructions and changed sources. The architecture integration requirement remains live.

## M0 execution expansion

Sulion branch: `3bf85dab-1cce-4ed3-a319-35c0b13b5e2a`.

1. Canonical drawing policies (`f0753227-9b2c-4e42-94e3-df4b6c3829be`). Extend Item with
   optional markup membership and highlight target; retain existing drawing paths and add a
   boxed `sketch` holder displayed as Drawing. Optional primitive metadata and semantic look
   terms describe editable ink, never a separate drawing store. Shared removal policy removes
   highlights with their targets; Undo restores both. Existing strokes remain workspace items.
2. Language and MCP representation (`5fbd046d-9ddd-4a5f-82b4-c1986bdd5d26`). Extend the
   existing item/attribute pipeline and typed Look descriptor, canonical printer and exact
   language reference. Resolve imported highlight IDs after declarations. MCP keeps its
   existing read/write/undo tools; a drawing is readable and writable without browser code.
3. Verify contracts (`6ec571ad-499b-42d0-9202-20071d2472fb`). Test canonical file round trips,
   references, gradients, authored sparsity, shared removal and agent edit/Undo semantics.
   The final M4 journey must also exercise actual MCP authoring and browser rendering with
   human edits preserved by agent Undo. No phase is complete from type checks alone.

Owners: document policies and geometry remain browser-independent; language owns syntax and
atomic Draft interpretation; editor adapts these records to maxGraph. Controls and file
orchestration retain the architecture integration contract above. UI gestures are implemented
in subsequent milestones; M0 establishes their canonical contracts first.

M0 result: canonical sketch/highlight types, optional annotation and ink metadata, shared
appearance/removal policy, exhaustive language attributes and typed look terms implemented.
Typecheck and 16 focused language tests pass, including file round trips and agent Undo.

## M1 execution expansion

1. Adapt canonical paths and highlights through maxGraph projection, including local selection
   and visibility rules. Hidden annotations remain graph records so mutation capture cannot
   mistake visibility for deletion. Existing workspace strokes remain selectable.
2. Implement semantic drawing commands and pointer adapters: pen/highlighter, sizes/presets,
   quick shapes, lasso, erase, object highlighting and undoable clear. Leaf palette takes
   values and callbacks. Whole gestures own Undo/completed-action boundaries.
3. Extend CanvasFiles export filtering and editor rasterization with the same selected set,
   including the empty-filter result. Verify actual browser gestures and peer behavior.

M1 branch: `6e410f48-023e-47b1-8e25-7a5dfcb917d6`. The local two-context drawing journey
passes after correcting SVG pointer interception on object highlights. It covers highlighter
creation, object protection, attached highlights, clean export, clear and Undo.

## M2 execution expansion

1. Add application commands for promotion, reverse promotion, blank Drawings and fitting.
   Reuse canonical holders, paths, shared removal and world-coordinate geometry. Preserve
   content and appearance in one Undo action, including rotation and nested holders.
2. Compose focused Drawing actions into the palette; double-click enters drawing editing,
   Escape exits. Keep per-gesture completion, clip through the graph adapter, and let the
   existing selection frame transform the Drawing plus its descendants together.
3. Verify promotion/edit/transform/save/Undo with independent browser contexts; retain template
   underlay behavior and ordinary workspace relationships. Finish all M2 steps before M3.

M2 branch: `b4f64ac7-0f22-469b-ac54-cb739a6033eb`. Two browser journeys pass, including
lasso/promotion, live content editing, clear-markup isolation, reverse promotion and peer Undo.
Double-click hit testing now recognizes graph text labels outside their object's bounds.
Drawing clipping remains derived SVG view data; it never changes saved paths.

## M3 execution expansion

1. Expose solid and two-color linear fills, close/open path, eyedropper and secondary shape
   controls through the same semantic palette and commands. Add draggable gradient direction
   handles through the graph-facing selection adapter, preserving filled-path editability.
2. Implement precision erasing as pure geometry splitting plus an application command that
   preserves surviving strokes, shared styles and one Undo/action boundary per eraser gesture.
3. Verify fill/gradient/erase geometry, browser controls, collaboration, PNG and file fidelity.
   Keep arbitrary intersecting-stroke region discovery and pixel-fragment selection deferred.

M3 branch: `160edf44-40be-4d14-9bb1-9743cfbad822`. Three real-input browser journeys pass,
including a filled shape, gradient direction drag, precision splitting and Undo. Focused
geometry/application tests detect sparse-stroke crossing and preserve one completed action.

## M4 execution expansion

1. Exercise actual MCP read/write/Undo against a browser-held room through the local relay,
   plus PNG pixels/embedded text, template Drawings, transforms, highlights, hiding, reload
   and late joining. Extend existing local fixtures rather than inventing a second protocol.
2. Measure a mixed board with 1,000 workspace objects and 1,000 dense paths in two contexts,
   including input, pan/zoom, synchronization and PNG export. Report observed variability;
   optimize demonstrated costs through the existing owners without runtime caps.
3. Reconcile usage, architecture, reference, backlog and changelog; run make ci, make build
   and the required browser journeys. Keep logs/screenshots in ignored test-results, report
   failures honestly, review the final diff and close the plan only when all work is complete.

M4 branch: `21640da0-77d0-4295-a23e-a9cf5bc324fc`. Actual MCP-to-browser authoring,
gradient PNG pixels/embedded source and human-edit-preserving agent Undo pass. Template
Drawings also retain derived clips and gradients without adding canonical copies.
Performance measurements are generated under ignored `frontend/test-results/`; no performance
threshold or runtime cap was introduced. Final `make ci` passes with 402 unit tests;
`make build` passes. The full browser suite passes 108 tests across 30 files. After the
gradient-transform repair below, 22 affected browser tests across five files also pass,
including the new real-input rotation/Undo regression. No commit or deployment was performed.

### M4 prerequisite — gradient rotation

The focused regression in `document/transform.test.ts` initially failed: rotating an editable
path did not return a matching gradient direction. The same path-result branch spread the
entire Item despite its geometry-only return contract. This temporarily blocked M4 integration;
it follows M3's existing gradient/rotation acceptance, not additional product scope.

1. Extend the shared transform result with an optional gradient-angle change and return only
   geometry fields for paths, preserving unrelated peer-authored fields. Resolve the paint
   direction in `document/transform.ts` from the authored/effective look supplied by callers.
2. Update both controller and Drawing dimension commands to apply the returned angle to Look
   inside the existing transaction/action boundary. Verify a real selection-frame rotation
   carries the gradient and Undo restores its points and angle together.
3. Run the focused domain/command tests and affected browser journeys, then return to M4.
   The full browser run stayed on its frozen application source while this repair's regression
   and contract were prepared.

Prerequisite branch `ad34ba2e-a7af-40ed-b002-856ffb4576d2` is complete. Shared transforms now
return only geometry and explicit paint changes; command consumers apply gradient direction
through Look in the existing transaction. The real rotation gesture restores points and paint
together in one Undo. Focused domain/command tests and all affected browser journeys pass.
