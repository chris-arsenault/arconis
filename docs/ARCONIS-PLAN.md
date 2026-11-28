# Arconis Plan delivery plan

**Status** · Planning. Delivery milestones are pending.

## Outcome

Arconis Plan is a standalone design and work-tracking tool for people working
with agents. A web agent can revise a design and hand off the next action. A
coding agent can open the same work, see its governing decisions, work offline,
and return a result. A human can follow that work and inspect the exact result
under review. The handoff continues through subsequent design and implementation
passes.

## Scope and boundaries

- Deliver the model, file formats, CLI, MCP, hosted storage, sync, and human
  work board in the Arconis repository. Deliver Arconis Plan before any changes
  to Sulion Plan. Use Sulion's plan semantics and the Vellum & Vector district
  design handoff as product references.
- Draw and Plan are co-equal, separate tools. Keep planning UI out of the
  default whiteboard experience. A project can distribute its linked plan,
  datasets, design documents, Draw files, and supporting files together as one
  set. The relay serves live collaboration.
- The first board supports human exploration and review with read-only access.
  Authoring takes place through CLI and MCP. Terminal agents can work with the
  local files offline. Web agents can work with the hosted project through MCP.
  Each workflow is usable independently of Sulion.
- Projects can exist on the server without a Git repository. A repo or ordinary
  local directory can hold a linked copy. Synchronization is explicit and
  bidirectional through `arconis sync`. Use latest version wins for competing
  versions of mutable content in the first release.

## Work and design model

### Plans and work items

Use an ordered hierarchy of work items with stable internal references and
arbitrary nesting depth. The plan is the root. Work can carry design context
and delivery detail at every level. Preserve the ability to expand a blocker
or a span of work into separately tracked child work with its own outcome and
acceptance. Track the parent work it covers, whether the blocker was resolved,
and whether open child work still prevents completion.
Preserve draft versus active expansion, the ability to return to parent work,
and the effect of completing a blocker branch on its parent. Canceling child
work leaves the parent blocker in place.

Record changes by appending authored records. A change to status, guidance,
implementation, or acceptance adds a record. Replacing a commitment records its
successor. Results and feedback also append, including what was accepted, what
needs another pass, and what governs the next action. The normal read returns
the effective state. History exposes prior records and their authorship.

Carry forward these Sulion planning semantics:

- A short synopsis and explicit goal or outcome. Keep the outcome distinct
  from the current next action and the evidence used to assess it.
- Sourced constraints and boundaries, principles with reasons, and assumptions
  that evidence could invalidate. Distinguish user requirements, user
  corrections, and agent proposals. Show effective ancestor guidance root first
  with attribution. Local guidance adds context under the governing constraints.
- Technical details and item-level implementation and acceptance fields.
  Keep status, progress notes, dependencies, follow-ups, and successor links.
  Preserve active, paused, completed, and canceled plan states and pending,
  in-progress, blocked, completed, and skipped delivery states.
- Typed requirements, decisions, open and answered questions, hypotheses, and
  examples. Preserve rationale and sources. A hypothesis names the observation
  that would support or overturn it. An example preserves the case, explains
  what varies, and links the behavior that should hold.
- Link work to its design basis. Flag dependent work for review when that basis
  changes. Evidence records the work and ancestor guidance it evaluated and,
  where applicable, the referenced document versions and result artifacts.
  A hypothesis result and acceptance of the work are distinct records.

Guided review works for a whole plan or a selected item with surrounding context.
Trace intended behavior through existing entry points, owners, contracts, and
consumers. Identify a fitting design pattern or existing idiom and record its
participants, rationale, and trade-offs in Technical details. Group
implementation, wiring, and verification around deliverable boundaries.
Reread the synopsis, decisions, delivery order, and remaining uncertainties
together after changes.

### Documents, datasets, and links

Design documents are mutable records with a Markdown body and defined metadata
for stable identity, title, kind, tags, and links. Agents can discover them by
metadata, read the relevant section, and change that section. Datasets use the
same document model with typed fields, row keys, schema validation, and
field-level or batch row edits. Ordinary reads show current content. Changes
retain an audit history with author, time, and prior content or the change.
Support CSV and JSONL exchange while retaining the portable typed dataset
representation.

Work, design documents, dataset rows, and Draw objects can link to one another.
Keep project references portable so moving the file set preserves its internal
links. A work item can cite a render or other review artifact and the subject it
evaluates. When a referenced target has been deleted or superseded, preserve
the historical reference and show its disposition.

## Storage and sync

Use the same project file model and authoring rules for CLI and hosted MCP.
The local manifest can carry a server project link. File formats should produce
reviewable Git diffs and preserve usable documents for tools that read them
from a repository. Document the minimum setup for terminal and web agents to
find a project, read its governing context, and author a handoff. Routine
commands use titles, paths, and displayed numbers. Revision identifiers and
raw operations are internal to normal field edits and batches.

Use S3 as the proposed hosted file store. Reuse Arconis account authentication
and authorize reads and writes against the project. Stage changed content and
publish a single current manifest that references a complete version of the
project. A conditional manifest write protects the publishing step from
concurrent writers. The board and MCP read from that published project. Route
saved project operations through the project service. Live collaboration
continues through Draw's relay.

On sync, exchange and deduplicate append-only work records from both sides.
Keep both records when they change the same aspect of a work item. Use a
deterministic order to derive the current view. For mutable files, keep
independent changes to different documents. Apply latest version wins to the
whole document or dataset when both sides changed it. The proposed ordering is
recorded edit time with a stable tie-break. An older edit arriving later does
not become newer by being uploaded later. A deletion is a versioned change.
This policy can replace independent edits within the same dataset, even if the
edits touched different rows. Preserve prior versions in audit history and
report which files sync changed. Repeating a completed sync leaves the project
unchanged.

## Delivery milestones

### 1. Portable project model and offline authoring

- [ ] Implement project files, nested work, append-only authoring and current
  views, review records, mutable documents and datasets, and portable links.
- [ ] Expose targeted reads, ordinary edits, atomic batches, history, and
  guided review in the CLI. Share operation definitions with MCP.
- [ ] Accept when an agent in a local checkout can read a child with live
  ancestor guidance, change its next action and design basis in a batch,
  record a result, and review the resulting history. A second agent can open
  the moved file set and resolve the same row, Draw object, and review links.

### 2. Hosted projects, MCP, and explicit sync

- [ ] Implement authenticated project storage, publication, and hosted MCP with
  the same current-state, authoring, history, and guided-review behavior.
- [ ] Implement download, offline authoring, and explicit two-way sync. Cover
  interrupted publication, repeat sync, concurrent appends, a winning mutable
  version, and deletion through the normal project entry points.
- [ ] Accept when a web agent can publish a design change and next instruction.
  A terminal agent syncs, reads the change, works offline, and returns a result
  with an artifact. The web agent can review that result and issue the next
  instruction. A server-only project can use the hosted workflow without Git.

### 3. Read-only work board and first release

- [ ] Add a separate Plan surface patterned on Sulion's compact plan tree and
  selected-item detail. Show titles, status, blockers, and progress. Support
  expand and collapse, search, and a direct link to a selected item. Keep
  closed work and older records available through exploration.
- [ ] Show the selected item's current handoff, governing guidance, and latest
  result and review. Make Technical details, implementation, acceptance,
  earlier reviews, and superseded decisions easy to inspect. Follow links to
  design documents, dataset rows, Draw objects, and review artifacts.
- [ ] Accept when a human can find a district-redesign item, see why full
  coverage governs the work, open the specific render under review, and see
  which parts were accepted and which still need work. Browser and agent views
  agree on the current state. Deliver through Arconis CI/CD.

## Basis

The district redesign established a recurring handoff. A web agent changed
direction and the process catalog. A coding agent implemented the current
direction and produced Nishi renders. Human feedback accepted parts of a result
and drove the next pass. An observed district count was mistaken for a
requirement. Keep observations with their results and make current requirements,
decisions, and next actions directly readable.

Use Sulion's `docs/plans.md`, `backend/src/plans/review.rs`, and
`frontend/src/components/PlanTree.tsx` as behavioral references. For Arconis
ownership and reuse, see [shared local and hosted agent actions](adr/0020-shared-local-and-hosted-agent-actions.md)
and [architecture](architecture.md).
