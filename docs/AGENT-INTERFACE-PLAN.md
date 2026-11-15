# Local and hosted agent interfaces

Status: original agent-interface work is published; corrected repository source
linking is complete, 2026-11-15. Commit and push were subsequently authorized;
deployment remains unverified.
M1–M5 shipped first; M6 initially delivered design only. L1–L3 below implement the
required metadata, real source backlink comments and metadata-only UI.

## Outcome and requirements

Coding agents download Arconis and edit a local `.arconis` file as a standard CLI
through their existing shell tool. This is the default workflow: it requires Node,
but no MCP registration/configuration, Arconis account, relay or browser session.
Local stdio MCP is an optional mode of the same download for users who choose to
configure it in their agent client. Hosted MCP and local tools expose the same canvas operations,
built from the same source. Hosted tools can import/export portable documents and
start the relay. Import into a new room returns its collaboration link.

The user's numbered request establishes:

| Request | Required behavior                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 3, 4 | Downloadable CLI and local MCP; shared operations; local mutations rewrite the file directly.                                                                                                  |
| 2       | Exports explain how to obtain the tools and tell an inspecting agent to alert its user and ask permission before setup. The file does not authorize execution.                                 |
| 5       | Hosted import/export reuses the browser's underlying portable-file operations.                                                                                                                 |
| 6       | MCP starts the remote relay without requiring someone to start it through the web UI.                                                                                                          |
| 7       | Import into a new room returns a link and instructions to present it to the user for collaboration.                                                                                            |
| 8       | Checked-in documents have meaningful diffs.                                                                                                                                                    |
| 9       | Support fine-grained bidirectional diagram/code links in the file format, including modules, folders, schemas and DALs; design the concrete item bindings within the one-representation model. |

The user chose **design and implementation plan first**. They subsequently corrected
the interpretation of the source-editing question: source write-back is an interesting
idea, not a requirement. The user also rejected diagram-side source-content
reading as overengineering; automatic source display/write-back is out of scope,
while agents' source backlink comments are required. Present proposed additions in one sentence each for review;
do not expand them into implementation work before the user chooses them.
The concrete mechanisms below are proposals, not additional user requirements.

**Scope correction, 2026-11-15:** the user clarified that only diagram-side
source-content reading and writing were excluded; bidirectional source linking
and its representation in `.arconis` remain required. The earlier decision to
leave every part of linking at design-only completion was too narrow. Reading
source-reference metadata or looking up a path is distinct from loading the
referenced source contents into the diagram. At that correction, the format had
no dedicated source-binding field. L1 now implements it; the requirement was
never removed by excluding source-content reading or write-back.

Preserve Yjs as the live canvas model and the canvas language as its file/tool
representation. Keep ordinary rooms accessible without accounts; retain hosted MCP
authentication and password/device-only room exclusions. Preserve unrelated work.
Local implementation is now authorized; data publication, package release, Git
branch creation, commits and pushes remain separate. Tests use temporary local
servers and fixtures, never real AWS.

## Current source and reuse

Read current source before implementing each milestone; this checkout contains
concurrent document, language, rendering and inspector changes.

| Owner                                                            | Current behavior and intended reuse                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/document/`                                         | Canonical canvas fields, transactions, identity, undo and picture codecs.                                                                                               |
| `frontend/src/language/session.ts`                               | Describe/read/write/layout/undo, seen-item checks and reports of others' changes. Reuse for file and room targets.                                                      |
| `frontend/src/language/printer.ts`                               | Canonical text, nested items, stacking order, styles, comments and picture data. Already suitable as the foundation for Git diffs.                                      |
| `frontend/src/files/canvasFile.ts`                               | Serialize/import the language and read text or an embedded PNG copy. Import retains free ids and stamps from the file.                                                  |
| `frontend/src/files/canvasFiles.ts`                              | Portable picture preparation, hash translation, import, export and selected copies. Use this from all runtimes.                                                         |
| `frontend/src/relay/mcp.ts`                                      | Tool schemas, instructions and dispatch currently depend directly on room sessions. Extract this contract, not a second implementation.                                 |
| `frontend/src/relay/agentSession.ts`, `agentSessions.ts`         | Hosted peer ownership, authenticated handles and session-local undo/read state; 30-minute idle expiry.                                                                  |
| `frontend/src/relay/serverPeer.ts`                               | Currently needs a browser to supply a room's envelope and canvas. New-room seeding must initialize both.                                                                |
| `frontend/src/relay/mcpProxy.ts`, `lambda.ts`, `control.ts`      | Authenticated always-available MCP entry, forwarding and existing budget-aware relay start. Proxy currently reports unavailability instead of starting.                 |
| `frontend/src/collaboration/pictureStore.ts`, `relay/uploads.ts` | Picture codecs and existing encrypted shared-picture transfer. Room import/export needs this path, not plain public uploads.                                            |
| `docs/adr/0013-*.md`, `0014-*.md`, `0011-*.md`                   | Current agent lifetime, one-representation contract and disposable relay behavior. New hosted imports require an explicit amendment of the browser-required agent rule. |

`frontend/package.json` is private and currently builds browser, relay, control and
accounts bundles. There is no downloadable CLI target in that manifest.

## Proposed runtime structure

Use one runtime-neutral agent operation module with the tool names, input schemas,
descriptions and handlers. Its session works with a `CanvasDocument`,
`LanguageSession` and `CanvasFiles`. Target adapters supply opening/closing,
participants, picture access and committing changes. Extract only the capabilities
needed by these operations; do not build a general plugin framework.

Three entry points consume this module:

1. Standard CLI commands are the default for coding agents and dispatch the shared
   operations directly, without an MCP connection; a foreground session supports the
   same read history and undo lifetime as stdio MCP.
2. Optional local stdio MCP opens a file and commits successful mutations to that file.
3. Hosted HTTP MCP uses authenticated room sessions and existing relay peers.

The browser continues to use its existing document/actions and `CanvasFiles`.
It need not route pointer input through agent calls. Shared behavior is below the
transport, including file operations, rather than a dependency on HTTP MCP.

### Tool and command contract

Keep `describe_canvas`, `read`, `write`, `check_layout`, `undo`, `canvas_help` and
`list_stencils`. Keep `open_room`/`close_room` for existing callers. Add
`open_file`/`close_file` for local sessions and `import_document`/`export_document`
to the common contract. Target availability differs by runtime and is explained
explicitly; a hosted server cannot open a path on an agent's machine.

Hosted import takes portable document content and either an existing session id
or a new-room destination. Export returns complete `.arconis` content, a suggested
filename and format version. It is independent of the bounded inspection `read`;
it must not truncate at `READ_LIMIT` or omit pictures. Use MCP resource content
where supported, with a text result usable by clients that cannot save resources.
Do not create public download objects to deliver an export.

CLI import/export accept local paths; their adapters read/write bytes around the
same handlers. Standard CLI invocations after downloading the script:

```text
node /path/to/arconis.mjs --file architecture.arconis read
node /path/to/arconis.mjs --file architecture.arconis write --statements-file change.canvas
node /path/to/arconis.mjs session --file architecture.arconis
```

For optional local MCP, configure the agent client to launch
`node /path/to/arconis.mjs mcp --file architecture.arconis`. This configuration is
not part of the standard CLI setup and is never a prerequisite for local editing.

The foreground CLI session accepts the common operation names and arguments, so
multi-step work and undo do not require an unattended daemon. One-shot commands
have no prior process's undo stack; retain the full undo action in session mode
and document this lifetime. Do not introduce a second persistent history store.

### Local file writes and distribution

Open text through shared import code into Yjs, retain stable ids, and preserve all
pictures and metadata. Commit a successful write/import/undo before returning
success. A failed parse, refused stale edit, or read-only call never writes.
Keep file-read state separate from publication state: if commit fails, report it
and reload/close the affected session rather than claim the file was updated.

Use a temporary sibling and atomic rename for a complete file replacement. Check
the opened revision before committing; serialize writes by cooperating local
sessions. External edits cause a conflict with a supported reopen/read workflow,
not a silent overwrite. Document that arbitrary editors do not obey Arconis locks;
do not claim a revision check alone is an atomic compare-and-swap filesystem API.

Recommend distributing a bundled Node script through Arconis's existing website
deployment. The npm publication proposal is withdrawn: it introduced a registry,
publisher account and release process without an established project mechanism.

Verified existing path:

- `frontend/package.json` already uses esbuild for Node bundles.
- Ahara's shared CI workflow runs `pnpm run build` before its Terraform deployment.
- `infrastructure/terraform/main.tf` passes `frontend/dist` to the website module.
- At the exact pinned module revision `34287b1925e1b5681281c1fb3ee9199211202ec9`,
  the module enumerates that directory's files, publishes them to the existing S3
  bucket and serves them through CloudFront; `.mjs` is already a supported MIME type.

Proposed process:

1. Extend the existing build to produce one bundled Node entry point with the
   shared canvas operations, MCP stdio transport and required assets, after Vite
   has produced its output. Use `frontend/dist/downloads/arconis-<revision>.mjs`.
2. Test the built file outside the checkout, including local read/write and stdio
   MCP. Establish and document the supported Node version; current server bundles
   target Node 24. The downloaded file must not need `node_modules` or a source build.
3. Let the normal website deployment publish that file alongside the application.
   Its revision-specific name fits the module's immutable asset caching. This adds
   build output, not a new registry, deployment credential or publishing workflow.
4. Link the current download from the existing web help/agent guide using the same
   build revision. Exported setup guidance points to that maintained guide and asks
   permission before downloading or running the tool.
5. Users save the file locally and run `node /path/to/arconis.mjs ...` through the
   coding agent's shell tool. Only users who choose local MCP configure that same
   file with `mcp --file /path/to/diagram.arconis`.
   Updating means downloading the current build again. There is no self-updater.

The URL shape would be
`https://arconis.ahara.io/downloads/arconis-<revision>.mjs`; this is a proposed path,
not an existing download. Existing site deployment does not preserve removed build
files as a release archive, so do not promise permanent historical download URLs.
The installed copy stays usable independently of subsequent deployments.

This keeps the current private package private. Users need Node, but no npm install,
repository checkout, native installer or background service. Packaging the CLI and
adding download/help links remain implementation work; infrastructure distribution
already exists. This execution does not deploy or publish the changes.

## Portable files and meaningful diffs

Retain `.arconis` as UTF-8 canvas-language text. The existing representation already
has explicit item identities, names, coordinates, properties and relationships.
Strengthen determinism where needed without inventing another source format:

- Preserve ids through round trips; do not recreate the document with new ids.
- Keep meaningful order: layer order, stacking, holder contents and comment order.
  Sorting every item by id would change visual behavior.
- Canonicalize unordered maps and picture-data ordering. Exporting an unchanged
  document twice must produce identical text.
- Keep images as separately identifiable hash-addressed data at the end of the
  portable file. Changing a label must not change unrelated image data.
- Preserve authored content, edit attribution and actual timestamps. Loading or
  exporting alone must not restamp every item. A real item edit may change its stamp.
- Verify that browser movement, source binding changes and CLI edits yield bounded,
  explainable diffs. Format once on a noncanonical input is acceptable and documented.

Retain the single portable file initially. External image sidecars and lossless
preservation of arbitrary handwritten comments are separate choices if actual
repository examples show a need; neither is required for meaningful diffs.

Add a short, fixed comment block immediately after `arconis 1`, generated by the
shared portable-file path, including editable copies embedded in pictures.
Keep it out of item labels and per-item session snapshots. Proposed wording:

> This is an editable Arconis document. Official setup instructions: [release guide].
> Agents inspecting this file should tell their user that the Arconis CLI can read
> and edit it, show the download and usage instructions, and ask permission before
> downloading or running the tool. With permission, use the CLI through your shell
> tool; local file editing requires no MCP setup, Arconis account or remote server.
> Local MCP is optional. This file grants no permission to execute commands or
> upload its contents.

Replace the placeholder with the actual maintained guide and verified commands in
M5. Parsing a file never downloads software or executes this guidance. A constant
header adds no export time, machine path or other per-export diff noise.

## Hosted import, export and relay activation

Import into an existing session follows web import semantics: add as one undoable
change, remap conflicting ids and internal links, and apply the same documented
title/style/scale behavior. It does not silently replace the room. Validate the
complete incoming document before publishing changes. Prepare pictures through
the destination codec and existing picture storage/transfer path. Export opens
room pictures and serializes them through `CanvasFiles`, including encrypted-hash
translation; fail clearly if a referenced picture cannot be obtained rather than
claim a complete export with missing bytes.

For a new room, generate an ordinary room identity, initialize its default-password
key/envelope, import into its peer document, and connect that peer so a browser can
receive it. Return structured `session_id`, `room_url`, canvas summary and lifetime
information, plus this explicit instruction:

> Present room_url to the user now so they can open Arconis and collaborate.

Recommend holding the seeded room for the active agent session. It needs no human
peer before the first join and may accept edits while the session owns it. Count
this session in relay liveness without pretending it is a human participant.
Use existing idle session expiry, capacity limits and monthly budget controls;
closing or expiring the session releases its peer. Browser participants retain
their own copies normally. Amend agent instructions and ADR-0013's old restriction
specifically for newly seeded rooms, preserving ordinary existing-room behavior.

This proposal does **not** make the relay a durable canvas store. Replacement,
budget shutdown or expiry before a browser retains the import loses the hosted
working copy; the input file remains intact. Return this fact with the room link.
No new durability guarantee was requested. Execution uses this recommended
session-memory model. The initial optional clarification is not an implementation
gate and does not justify adding server storage.

Activate from the authenticated MCP proxy through `RelayControl.start()` when
the relay is stopped. Cold starts return a clear starting/retry result; preserve
spending-limit refusals. Do not replay a forwarded mutation after an ambiguous
timeout. Tool discovery/initialization must remain recoverable while starting;
share static contract metadata if serving tools/list at the proxy is necessary,
instead of maintaining another tool list. No user AWS credentials belong in the CLI.

Check actual ALB/Lambda/MCP payload limits against picture-heavy portable files in
M3. A transport limit must produce a clear refusal, not truncation. If the existing
file/picture transfer capabilities cannot carry supported documents, plan a bounded
transfer path using those capabilities before claiming complete import/export.

## Repository bindings — required support and proposed representation

Required behavior: `.arconis` must retain links from arbitrary diagram items to
source targets, and the linked source files must contain comments linking back
to the relevant diagram items. This is what bidirectional means here. A reverse
query derived only from diagram metadata does not meet that requirement.
Removing diagram-side source-content read/write does not remove either link.
The implementation uses the shared source attribute and source-comment convention
described below, without adding source-integration machinery.

**Agent/repository boundary:** these relationships are for agents working in a
repository. The browser has no checkout to resolve, open, browse or validate.
Its only source-reference UI is a field/list on the selected item where a person
can set, edit or remove reference metadata. Do not add source navigation buttons,
a source viewer, a repository connection, a local-editor integration or file
pickers that imply access to a checkout. Arconis stores the references; an agent
uses its existing repository tools to inspect or change the actual source.

Put bindings on the canonical **item**, independent of its stencil. Any node,
frame, text, line or other item can name several source targets; several items can
refer to the same target. Do not consume the item's existing single navigation
`link`, and do not invent unrelated string properties for a typed source contract.
Extend document types, language parsing/printing/reference and tools together.

Recommend repository-relative file or folder references with optional anchors as
link metadata. Paths are relative to the repository root containing the diagram,
not relative to the diagram's subdirectory or this browser's location. The UI
does not check that a path or anchor exists. These references do not require
Arconis to read, parse or display the referenced files. The implemented language
uses repeated `source "path"` attributes with optional `anchor "target"`.
Never export this machine's absolute checkout path.

Represent both directed links in the repository:

- A diagram item stores the implementing source path and optional anchor.
- A comment beside the relevant source declaration, or at module scope for a
  whole-module relationship, stores the diagram path and stable item ID with a
  short explanation of the relationship.

The source comment is a real, checked-in backlink, discoverable when an agent
reads the source file. It is not a generated reverse index hidden elsewhere.
The earlier proposal to store only diagram-side bindings and derive the reverse
direction is withdrawn. No repository-wide scanning/index subsystem is required
to satisfy this feature.

An agent establishes or updates the pair using existing Arconis actions for the
diagram and its ordinary file-editing tools for the source comment. The diagram
and source-comment changes are reviewed together in Git. Excluding source
write-back means the Arconis browser does not edit implementation contents; it
does not prohibit agents from adding the required backlink comments to source.
No source parser, automatic synchronization or comment-rewriting engine is implied.

Recommended agent-facing backlink convention, with the path rooted at the
repository root (illustrative syntax, not an implemented browser URL):

```typescript
// Arconis: docs/architecture.arconis#item=storage — persistence boundary and schema ownership.
```

The agent follows this reference by opening the named `.arconis` file and reading
the named item with the CLI. The browser only edits forward-reference metadata;
it does not resolve the source or create the source comment. Shared canvas
actions expose that metadata to local and hosted agents; hosted MCP has no
checkout and cannot modify repository files. For a folder-level relationship,
choose an appropriate existing source/documentation file for the backlink;
do not require a new mapping manifest or blanket comments in unrelated files.

The supplied screenshot establishes six initial targets, not a limit on item types:

| Canvas item                         | Example binding target                               |
| ----------------------------------- | ---------------------------------------------------- |
| Typescript View and UI              | UI folder(s), components or exported symbols         |
| Type Script DataStorageFacade       | Facade module, interface and implementation symbols  |
| Generation                          | Generation package and its entry points              |
| Feature Extraction                  | Extraction package and its entry points              |
| Generation Numerical Representation | Numerical schema/type declarations and relevant DAL  |
| GIS Layers And Rasters              | GIS schema/migrations, raster types and relevant DAL |

These labels come from the image. Implementing repository paths are unverified;
do not fabricate them from the screenshot. The outer PostGIS/GEOS frame and its
individual relationships can also bind independently if useful.

The shared format and source-comment convention implement these explicit links.
A binding alone does not establish that a diagram's
architectural explanation stays consistent with code. Automatic source-content
reading/display in the diagram and source write-back are excluded.
The local browser server, filesystem bridge, source-content resolvers, source undo system
and remote workspace permissions are removed from this plan.

## Milestones and acceptance

The root Sulion plan is `7c4e7f54-7d1e-4530-a103-77359f7f5b66`.
The user authorized execution of these phases after reviewing the plan.
Expand one milestone just before implementing it using plan-phase.

| Milestone                                          | Scope and observable acceptance                                                                                                                                      | Evidence                                                                                                                                             | Sulion phase                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| M0 Design contract                                 | All nine requests, user corrections, architecture proposals and decision ownership are recorded.                                                                     | Current source review and request-to-design traceability.                                                                                            | `b74273f1-292d-46a9-b7d0-5204adf12875` |
| M1 Portable files and Git diffs                    | Export setup guidance; stable no-change exports; small edits retain identities, picture bytes and meaningful order.                                                  | Shared file round trips including pictures, layers, comments, markup and bounded before/after diffs.                                                 | `87644c5f-9704-4525-aff8-275b63c5be68` |
| M2 Shared actions and local tools [depends on M1]  | CLI and stdio MCP execute common actions, commit mutations directly, refuse external-file conflicts and support session-local undo.                                  | Same operation corpus over local and hosted adapters; actual CLI/stdio subprocess tests, failed commit and stale-file cases.                         | `7dd393b7-2b81-4a39-b30e-98763a3758d8` |
| M3 Hosted import and export [depends on M1, M2]    | Existing-room imports match web semantics; new-room imports return working links; portable exports include pictures; chosen lifetime is explicit.                    | Local relay plus two independent browser contexts; real pointer/keyboard edits after joining a seeded room, undo, re-export and picture round trips. | `d3b3bde6-7347-430a-a14f-3a9922de6182` |
| M4 Relay activation [depends on M2]                | Authenticated MCP requests start a stopped relay and report startup, budget and auth failures correctly. Discovery recovers without a browser-start step.            | Proxy/control fixture tests and cold-start MCP client journey; no real AWS calls or ambiguous mutation replay.                                       | `0476ec4f-b1dc-414e-9d4c-9ae87399f40a` |
| M5 Integration and distribution [depends on M1–M4] | Downloadable artifact works outside checkout; actual setup instructions match it; hosted/local semantics and web interoperability agree.                             | Required `make ci`, production build and affected browser journeys; artifact smoke tests. Publication remains separate.                              | `dece48d5-9633-4ed5-91a3-dc8c0ae71288` |
| M6 Repository linking design [depends on M1, M2]   | Review arbitrary item bindings, reverse lookup and ways to avoid separately maintained diagram/code content; distinguish requested outcomes from optional additions. | Apply the proposal to the supplied diagram and real repository examples; present unresolved choices for user review before implementation planning.  | `6466732b-305e-45d7-81f8-b73b73f3c55f` |

M3 and M4 can be implemented independently after their prerequisites. M6 is
repository design work, not a prerequisite that delays delivering modes 1–7.
Their acceptance tests are evidence of chosen mechanisms, not new mandatory user
workflows or performance budgets.

M1's export guidance and M5's setup guide must lead with ordinary CLI use. M2/M5
must demonstrate local read/write from the standalone download with no MCP client
configuration, account credentials, relay or browser; optional stdio MCP is checked
separately against the same operations.

## Decisions and next action

- **Settled by user:** design/plan only in this pass; shared local/hosted interface;
  permission-seeking export setup guidance.
- **Settled by user:** standard CLI through the coding agent's shell is the default;
  local MCP is optional, and local editing requires no MCP registration or account.
- **User correction:** source write-back is not a requirement; present optional
  additions as one-sentence descriptions for review before designing machinery for them.
- **User correction:** do not add source reading or source-derived display; keep
  repository linking separate from accessing source contents, while retaining
  file-format links and lookup in both directions as required behavior.
- **User correction:** fit CLI distribution into the established build/deployment
  mechanisms; the npm registry proposal is withdrawn.
- **User correction:** source linking is entirely for agents/repositories; the
  browser only lets a person set the metadata and has no source to navigate,
  resolve, validate or view. Agents use their own tools for source access.
- **User correction:** bidirectional means a real link in a source-file comment
  back to the relevant diagram item. Derived reverse lookup is not a substitute;
  the earlier no-source-annotations boundary is withdrawn.
- **Implementation assumption:** new-room imports use existing session memory;
  no new durability guarantee was requested, and the returned link explains its lifetime.
- **Implementation evidence before M2/M5:** verify the self-contained Node bundle,
  supported Node version and packaged icon/runtime assets through the existing site
  build. Do not print speculative download commands as though they exist.
- **Link design before M6:** review file/folder references and optional anchors
  against the user's examples without introducing source access or parsers.

Current execution: M1–M5 are implemented and verified. M6 initially delivered a
design proposal only; L1–L3 now implement the corrected source-link scope below.
The former M7 source-editing phase
remains withdrawn. Earlier implementation evidence is recorded below; commits
`f854157` and `579e961` subsequently published agent interfaces and spatial file
ordering respectively. Hosted deployment is not verified here.

### Source-link scope correction and remaining implementation

Follow-up Sulion plan: `1e571dad-22fa-473f-9e64-e4651237ea1d`.
Its M0–M3 phases correspond to L0–L3 below.

The user correction after the Git-open-link discussion restores the original
bidirectional-linking requirement. This work is independent of fetching a whole
diagram from GitHub: repository file opening is not a substitute for item-level
source links. Preserve the completed runtime and spatial-ordering work.

The next user correction narrows UI scope explicitly: a reference can be set in
the inspector, but there is no browser-side source target to open or view. The
earlier assistant description of human source navigation is withdrawn. The two
lookup directions serve repository agents, not a connected browser source UI.

The latest correction defines the reverse direction concretely: a comment in
the actual source file links back to the diagram item and explains its relation.
The earlier derived-reverse-query design was an assistant substitution and is
withdrawn. Implement forward metadata and a source backlink convention/workflow;
do not build a reverse index in place of the source comments.

| Phase                            | Required outcome                                                                                                                                                                                                                              | Evidence                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0 Scope correction              | Keep source-reference metadata and both lookup directions in scope; exclude only diagram-side source-content reading/writing and its associated machinery.                                                                                    | Compare original request 9, the source read/write corrections and the latest clarification with this document and ADR-0020.                                          |
| L1 Shared format support         | Canonical item fields and canvas-language syntax retain arbitrary item-to-source references through import/export, browser persistence and CLI/MCP operations.                                                                                | Round trips, several targets per item, shared targets across items, ID remapping/copying and localized reference diffs.                                              |
| L2 Source-file backlink comments | Define an agent-readable source comment containing diagram path, stable item ID and a short relationship explanation. Agents put it beside the relevant source using their normal editing tools, paired with the diagram's forward reference. | A representative repository example has both a diagram-to-source reference and a real comment linking from source to that item. A derived query alone does not pass. |
| L3 Metadata UI and integration   | The inspector can set/edit/remove references as metadata only. Shared runtimes retain them; document agent/repository lookup and the browser boundary.                                                                                        | Browser metadata-edit/export round trips, shared file/runtime tests, required CI/build checks; no browser source navigation/viewing or checkout dependency.          |

The representation recommendation remains a per-item list of repository-relative
file/folder paths with optional opaque anchors. Exact field names and source-comment
syntax are implementation design choices, not new user requirements. The UI is
limited to setting reference metadata; human source navigation is not part of
this feature. Source backlink comments are required for the linked relationships;
blanket annotations across unrelated files are not. Do not add source-content
parsers, automatic synchronization, an editor plugin or diagram-driven source
editing to deliver linking.
L1–L3 are complete locally. Shared format support, real source backlink comments
and the metadata-only inspector are implemented and verified below.

## Execution

### L1 — Canonical source references

Execution authorized by the user's request to execute this part of the plan.
Sulion expansion `e8ae7038-95f6-4927-ba65-ae5c37f055c7`, step 1.
Add `Item.sources`, a list of repository-relative path/opaque-anchor pairs, with
an empty anchor for whole-file/folder targets. Reuse the shared field parser,
writer, printer and existing document persistence. `source "path" anchor "name"`
adds a reference, `source "path" anchor "name" off` removes that exact reference,
and `source none` clears the list. Omitted attributes preserve references. Print
unique references sorted by path/anchor for bounded diffs. Validate only metadata
syntax, not source existence. Verify every item type, copying/remapping, no-change
round trips, undo, invalid-write atomicity, CLI and optional MCP preservation.

L1 result: canonical metadata and shared syntax are implemented. Focused file,
language and document tests passed (35 cases), alongside actual standalone CLI
and stdio MCP subprocess checks, lint and TypeScript checking. Hosted browser
export parity is checked in L3.

### L2 — Real source backlink comments

Sulion expansion `e1c48092-1611-4b44-a5c3-c22bd60e7168`, step 1.

Use the source language's ordinary comment syntax with
`Arconis: <repository-relative diagram path>#item=<stable id> — <relationship>`.
Document the paired-edit agent workflow and follow it in this repository:
`docs/diagrams/repository-links.arconis` names the canonical item, shared field
writer and reference reader; comments beside their actual source declarations
point back to those items. No generated source rewriter or reverse index is
added. Check the diagram with the real CLI and follow each comment to its item.

L2 result: the built standalone CLI read all three named items from the example;
each returned the expected source path/anchor, and the actual declarations carry
matching source comments. Agent instructions, language help, file guidance and
consumer docs explain paired edits rather than reverse lookup.

### L3 — Metadata-only UI and integration

Sulion expansion `767a0791-b913-4ec1-bf09-693d1622e17b`, step 1.

Add a collapsed Source references inspector section for a single selected item,
including lines and ink. A list of path/anchor forms explicitly adds, saves or
removes metadata through existing undoable changeFields. Syntax feedback does
not access a checkout. Verify real pointer/keyboard edits, peer propagation,
undo, reload and export/import, plus hosted portable export preservation. Run
make ci, production build and affected browser journeys. No source navigation,
filesystem bridge, code viewer, source rewriter or automatic synchronizer.

The new UI journey passed peer propagation, add/save/remove, undo, persistence
after reload and export/import, with no requests for the source paths. All 25
affected journeys across nine browser suites passed, including hosted MCP source
reference export and production CLI download. The inspector screenshot was
reviewed locally. An initial full unit run failed one existing relay-awareness
assertion (expected Alice, received nobody); that unchanged file passed all 13
tests on immediate rerun. A subsequent CI attempt was terminated during lint
without a diagnostic and was not counted as passing. The final full make ci
passed all 744 unit tests across 107 files, lint, TypeScript, Prettier and Terraform
formatting. The production build passed for browser, standalone CLI, relay,
control and accounts. All 25 affected browser journeys across nine suites passed.
Consumer/architecture documentation formatting and git diff whitespace checks
passed. No source parser, reverse index, source viewer or automatic source
rewriter was added. No branch, commit, push, deployment or external data
publication was performed in this execution.

### M1 — Portable files

Sulion expansion `1b2da969-d22e-4bd9-af24-b3235c2667b1`, step
`7456a70e-a792-4fc2-80ad-82fc14564631`.
Change `files/canvasFile.ts` to add constant permission-seeking CLI guidance only
to portable exports; canonicalize unordered picture data without sorting canvas
stacking. Verify `canvasFiles.test.ts` round trips, identical repeated exports and
a one-item edit leaving unrelated lines intact. Preserve stamps and picture hashes.

Result: 12 portable-file tests passed.

### M2 — Shared actions and local runtime

Sulion expansion `fc8be53a-1000-4593-8e33-5a65bc30cb69`.
Steps: `1b1e4e12-ca17-45ad-abcd-1cd21f223365`, `e2cbb755-09fc-4393-be5e-65baff2f6b1f`.

1. Extract shared operation schemas/handlers into `agents/operations.ts`; hosted
   MCP registers those definitions and the CLI invokes them directly. Preserve
   existing room lifecycle/authentication and check existing relay tests.
2. Add `cli/` file sessions and command/stdio entry points. Use shared CanvasFiles
   and LanguageSession, sibling lock files for cooperating processes, revision
   checks, temporary writes and atomic rename. Verify actual file persistence,
   failed edits, external conflicts and optional MCP with subprocess tests.

M2 result: standalone shell/stdio tests and file-session tests pass; existing hosted
session, quality and error tests pass. Import/export use session-local chunks to
fit the existing ALB/Lambda payload ceiling; CLI --output assembles the export.

### M4 — Relay activation

Sulion expansion `58e8335f-7ba7-468b-b745-32686817f24a`.
Step: `cf595569-1531-43c7-b734-8fccebb56e00`.
Use the existing authenticated proxy plus `RelayControl.start()` on an explicit
unavailable response. Share hosted discovery metadata with the live server; keep
initialize/tools/list usable during startup. Verify cold start, auth/budget refusal
and no replay after ambiguous forwarded mutations in `mcpProxy.test.ts`.

M4 result: 14 proxy/portable tests pass, including authenticated cold-start
discovery, spending/auth failures, existing-room picture import/export and chunked
snapshot export during a concurrent edit.

### M5 — Distribution and integration

Sulion expansion `6746d4df-3b7b-46ab-84a2-d413e4b9f813`.
Steps: `7e6edc45-827a-4340-a6df-280a791362f3`, `bb42e54d-0b9a-459b-96ea-41fcb22c18f3`.

1. Add `build-cli.mjs` to the existing frontend build, emitting a single bundled
   Node script into `dist/downloads`. Add the stable #cli guide/download screen and
   CLI-first documentation; browser download links use the website revision.
2. Validate the actual built download outside the checkout and optional stdio MCP,
   run make ci/build plus local independent-context browser journeys, and review
   changes for parity, file durability and excluded source access. New-room
   coverage is recorded under M3, using existing session-memory lifetime.

M5 result: make ci passed 725 tests plus required lint, types, formatting and
Terraform formatting; the production build passed. The built download and four
hosted MCP browser journeys passed. A full browser run is still being reconciled.

### M3 — Hosted portable rooms

Sulion expansion `1cb6be91-a6d6-4e84-aaf1-3818ccb3aaad`.
Steps: `ac356376-24f2-4967-9d83-ea73dcd337c6`, `c3757db4-d745-4b9f-adc6-89df26ac29db`.
The optional lifetime question created an unnecessary gate: no new durability
guarantee was requested, so retain the existing session-memory model and state its
limits with the returned link. This changes an agent-derived gate, not a user requirement.

1. Seed a new ordinary room with the browser's key/envelope functions, retain its
   peer through the existing agent-session lifecycle and add new_room to the hosted
   import adapter. Reuse the common import handler; return session_id, room_url and
   instructions to show the link immediately, plus explicit memory-only lifetime.
2. Verify real browser joining, human edits and agent edits, portable pictures,
   export round trips and session cleanup. Keep existing-room browser requirements
   and budget controls; do not add durable canvas storage.

The shared schema declarations moved to `agents/contract.ts` after integration
review showed cold discovery importing execution and icon dependencies. The
control Lambda now consumes schema metadata only, preserving its existing runtime
boundary; CLI and both MCP modes still use the same definitions and handlers.

### M6 — Repository linking design

Sulion expansion `be14fc80-0c13-4669-ac21-b5c916b78895`, step
`a2341b9a-eb53-4974-a276-4ca2cf311bf6`.
Review item-level metadata against the supplied screenshot and actual Arconis
owners, then present the recommendation without implementing source access.

Recommendations for review, one sentence each:

- Store a list of repository-relative file/folder references on any canvas item, so shapes, holders and relationships can link at the granularity their author chooses.
- Allow an optional opaque anchor on a reference for a finer target, without resolving symbols, reading source or loading schemas.
- **Withdrawn by user correction:** derive reverse lookup only from `.arconis` bindings instead of putting backlink comments in source; the required reverse link belongs in the source file itself.
- Keep those references in the canonical item/language/file model so a changed path has a normal Git diff.

The supplied screenshot maps its four processing/UI boxes to their implementing
modules or folders, and its two data boxes to schema/type or DAL files, as in the
earlier table; each item can have several references, and several items can share
one reference. Actual implementing paths for that external system remain unverified.

Concrete Arconis examples use current owners:

| Diagram part          | Reference examples                                                          |
| --------------------- | --------------------------------------------------------------------------- |
| Browser UI            | `frontend/src/components/`, `frontend/src/editor/`                          |
| Canonical canvas data | `frontend/src/document/types.ts`, `frontend/src/document/canvasDocument.ts` |
| Shared agent contract | `frontend/src/agents/contract.ts`, `frontend/src/agents/operations.ts`      |
| Hosted session state  | `frontend/src/relay/agentSessions.ts`                                       |

These paths name real owners reviewed during this work; they do not imply source
contents would be loaded into a diagram. File moves would need explicit reference
updates. With source reading excluded, automatic semantic synchronization is not
claimed. Exact field syntax and editor navigation integration remain for user review;
no repository-link implementation, source display or source write-back was added.

### Original agent-interface completion

The original M1–M5 implementation and M6 design deliverable completed locally;
source-link implementation was subsequently delivered by L1–L3 above.
`make ci` passed 728 tests plus
lint, type checking, formatting and Terraform formatting. The final production
build passed and emitted `frontend/dist/downloads/arconis-local.mjs`. The 24 affected
browser journeys passed across seven files, including actual production-preview
download, CLI/browser round trips, newly imported hosted rooms, two-context human
and agent collaboration, picture transfer, language, PNG and password-room files.
Earlier broad browser runs overlapped source changes and were interrupted; they
are not counted as verification of the final state.

Final import feedback uses `LanguageSession` around the shared file operation's
synchronous commit, so an agent's own import is not mislabeled as someone else's
edit. Invalid new-room imports release their peer/session and report refusal.
No real AWS tests, hosted publication, deployment, commits or pushes were performed.
The website download becomes publicly available through the existing deployment
pipeline when these changes are published. The optional room-lifetime question
was resolved as an implementation assumption using existing session memory, not
as an added durability requirement.
