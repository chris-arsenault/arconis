# Spatial file ordering and explicit stacking

Status: all phases complete, 2026-11-15. Commit and push subsequently authorized;
deployment remains unverified.

## Outcome and authority

Make checked-in `.arconis` documents easier to read and diff by ordering object
statements spatially, while recording visual stacking explicitly. Moving a
statement in a file must not move its object in front of another object.

The user subsequently requested execution of all phases. Implementation and local
checks are authorized; commits, pushes and deployment remain separate.
The completed [agent-interface plan](AGENT-INTERFACE-PLAN.md)
is the preceding work, not an unfinished implementation phase to reopen.

User requirements and direction:

- Checked-in `.arconis` files should have meaningful diffs (original request 8).
- File ordering should not depend on insertion order or randomly generated IDs.
- Use XY coordinates as the basis for ordering, following the user's correction
  to the initial label-based proposal.
- Plan an explicit z-index within layers, separating drawing order from statement
  order, as requested in the latest discussion.
- Include the discussion and its changes of direction in this plan.

Existing boundaries still apply: one canonical document/language/file model,
Yjs collaboration, shared browser/CLI/MCP behavior, no source reading or source
write-back, and no repository-link implementation in this feature. No new CLI
distribution or MCP registration workflow is needed.

## Discussion record

This records every turn of the file-ordering discussion, including superseded
assistant proposals. Quoted user text retains the original wording.

1. **Original requirement:** “a .arconis file that is checked in has a meaningful
   diff.” This was part of the wider agent-interface request, ahead of future
   repository-linked diagrams. Later corrections excluded automatic source
   reading and write-back; meaningful file diffs remain required independently.
2. **User:** “how did we addres the sane diff for acronis file requirement?”
   **Assistant:** explained that files were already canonical canvas-language
   text with stable identities, generally one statement per object, preserved
   timestamps, sorted styles/properties and newly sorted picture data. The new
   two-node regression checked repeat exports, a round trip and one changed line
   for a label edit. It did not establish spatial ordering or representative
   large-diagram diff/merge behavior. Whole-file canonical regeneration does not
   preserve arbitrary handwritten comments/formatting; embedded image changes
   still produce base64 data diffs. Those limitations were stated explicitly.
3. **User:** “can we do something with stable ordering? something not based on
   insertion or randomly genrated id?” **Assistant's initial proposal:** group
   layers/containers, sort objects by type and normalized label, and connections
   by endpoint names and their own label. Serialize stacking separately first.
   Renames could move statements; position and drawing order were suggested as
   tie-breakers. This type/label-first proposal is superseded below.
4. **User:** “why wouldn't we use like xy coords or something to order instead
   of id” **Assistant:** agreed and recommended Y, then X: top-to-bottom,
   left-to-right. Moving objects can then move their statements. Type/label were
   suggested for coincident positions. The assistant repeated that explicit
   stacking is needed to preserve appearance independently of statement order.
5. **User:** “is stacking order really controlled only by ordering in a
   .arconis file? wouldn't it make more sense to have na explicit z indiex within
   layers?” **Assistant, after source inspection:** the live document already
   has numeric `Item.order`, but files omit its value and import allocates order
   as declarations are read. Recommended exposing it as `z`, without adding a
   second canonical field. Layer/container behavior must remain intact.
6. **User:** “create a plan to implement this feature including all the turns
   of dicusion we've had on it.” **Result:** this plan, with the design below
   distinguished from additional user requirements. Implementation stays pending.

Retrieved source turns: session `01a1dc40-ac47-7ec0-8baa-2a44e541beb2`, turns
`5736193` (diff explanation) and `5794650` (initial ordering proposal); later
turns are present in the current conversation. The original requirements and
source-access corrections are also recorded in the preceding agent-interface plan.

## Baseline source and reuse

Source inspected during planning on 2026-11-15; implementation outcomes are
recorded below. Re-read affected code before subsequent changes.

| Owner                                                                                                                   | Current behavior / implementation consequence                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/document/types.ts`, `itemDefaults.ts`, `canvasDocument.ts`                                                | Items already carry numeric `order`; newly created items get `nextOrder()`. Expose this existing state rather than store another z field.                                                            |
| `frontend/src/document/geometry.ts`                                                                                     | `compareStacking` sorts by `order`, then ID for equal values. This is rendering determinism, distinct from the proposed spatial text comparator.                                                     |
| `frontend/src/document/layers.ts`, `layerCommands.ts`                                                                   | Layers have their own order. Held content inherits its outer holder's layer; layer moves/merges put moved roots on top. Slides are below layers and markup above them. Preserve these rules.         |
| `frontend/src/editor/projection.ts`                                                                                     | Projects layered stacking and inserts each parent's children in order. Verify actual overlapping objects, not just text snapshots.                                                                   |
| `frontend/src/language/printer.ts`                                                                                      | `printCanvas` starts with `document.list()`; `printTree` nests holders and writes connections afterwards. `fieldWords` does not emit `order`. Layer declarations already encode their drawing order. |
| `frontend/src/language/draft.ts`                                                                                        | Declarations and generated connections receive sequential order values. Explicit z must override the default without disturbing ordinary declarations.                                               |
| `frontend/src/language/syntax.ts`, `attributes.ts`, `attributeRouting.ts`, `describe.ts`, `connections.ts`, `writer.ts` | Shared parsing, validation, item/link attributes and transactional writes; add z here for both declarations and edits.                                                                               |
| `frontend/src/files/canvasFile.ts`, `canvasFiles.ts`                                                                    | Shared serialization/import used by browser and agent runtimes, including embedded portable copies. Keep this the single file path.                                                                  |
| `frontend/src/files/canvasFiles.test.ts`                                                                                | Existing small diff/round-trip test is a baseline, insufficient evidence for this feature's stacking and ordering behavior.                                                                          |
| `frontend/src/language/reference.ts`, `docs/files.md`, ADR-0014                                                         | Update the language reference exactly. ADR-0014 establishes one representation and records an earlier no-backward-compatibility decision; do not invent a migration framework.                       |

The live model's order values are global numbers, although layers and parents
constrain which items actually stack against one another. “Within layers” does
not require replacing those values with independently numbered per-layer arrays.

## Proposed implementation contract

These are implementation recommendations for review, not additional user requirements.

### Explicit stacking

- Add `z <number>` to the shared canvas language for items and connections,
  including `edit <id> z <number>`, mapping directly to `Item.order`.
- Larger z draws in front within the existing stacking context; layer order,
  containment, slides and markup retain their existing precedence.
- Print z on every serialized item/connection, including zero, using existing
  numeric formatting. Preserve stored values rather than densely renumbering the
  canvas on every export; renumbering would create unrelated diff churn.
- An ordinary declaration without z retains current top-of-stack defaults; an
  edit without z leaves its stacking unchanged. Validate numeric input through
  existing language conventions and refuse invalid writes transactionally.
- A fresh-document import preserves explicit z. An additive import into an
  occupied document must retain the incoming items' relative stack while
  preserving existing import placement semantics. Recommend translating the
  incoming stack above the destination where needed, rather than interleaving
  raw source values with unrelated destination values. Resolve this in M1 using
  existing import/copy behavior; no separate order map is introduced.
- Existing equal-z rendering uses IDs to resolve ties. Do not silently change
  collaborative rendering while implementing text sorting. Cover equal-z imports
  and ID remapping explicitly; if preserving visible order needs additional
  handling, keep it in the shared import path and document the chosen rule.

Example proposed syntax, deliberately showing file order opposite to z order:

```text
node upper "Upper object" at 100,20 z 8
node lower "Lower object" at 100,80 z 2
```

`upper` prints first because its Y is smaller; its greater z still draws it above
`lower` wherever their shapes overlap. Neither object's ID selects its position
in this example.

### Spatial statement order

- Keep layer declarations in their meaningful bottom-to-top order, and group
  top-level content by layer. Preserve holder blocks and sort siblings within
  each block by world Y, then world X; do not flatten containment.
- Preserve the established slide/markup distinction without assigning them to
  content layers merely to simplify printing.
- Keep connections after the objects they reference, as the existing printer
  does. Sort connections spatially within that dependency-safe section. Reuse
  domain geometry to derive a position from their path/endpoints; do not sort by
  placeholder x/y fields or make the printer depend on maxGraph/browser geometry.
- For coincident coordinates, recommend type, label, then explicit z as
  tie-breakers. These are secondary to XY. The implemented rule then compares
  remaining canonical statement content without the item's own ID, retaining
  drawing order only for completely identical ties. No separate final ID
  comparator is added. Existing drawing order can itself use IDs for equal-z
  rendering ties; this narrow inherited behavior is not ordinary file ordering.
- Apply the rule in shared language printing so file exports and agent reads
  agree. Do not add CLI-only sorting, a second file representation, semantic IDs,
  required naming conventions, position buckets or automatic canvas layout.
- Sort statements only: do not sort freehand/path points, discussion chronology,
  deck numbering or other sequences whose order carries domain meaning.

Coordinates make statement order independent of insertion/UUIDs for distinct
positions. They do not make differently identified diagrams byte-identical.
A movement crossing another object can relocate a statement; this is an accepted
trade-off of the proposed spatial ordering, not a promise of one changed line for
every possible edit. A rename at a distinct position should remain local.

### Format and compatibility

Recommend an additive language attribute using existing defaults when omitted,
with no bulk conversion of checked-in files or persisted Yjs rooms. Before
choosing the emitted language version in M1, inspect current versioning policy
and how an older reader handles `z`; report compatibility honestly. No new
backward-compatibility guarantee, custom loader or migration subsystem is required.
The first export under the new canonical order can produce a one-time broad diff.

## Milestones and evidence

Root Sulion plan: `21af2bb7-80f7-4e87-843f-090b1f1e7a79`.
Expand each implementation milestone just before execution in this document using
plan-phase; future phases remain pending until implementation is authorized.

| Milestone                                   | Scope and observable acceptance                                                                                                                                                                                                             | Evidence                                                                                                                                                                                                                                                 | Sulion phase                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| M0 Discussion and design                    | Record every discussion turn, superseded proposals, current sources, requirements and remaining technical choices.                                                                                                                          | Read the conversation/retrieved turns and relevant source; review this plan against them.                                                                                                                                                                | `5e69ef2a-23b6-4b54-b712-e5836cff13b4` |
| M1 Explicit stacking                        | Expose existing order as z for items/links and edits; export/import preserves appearance despite changed statement order; ordinary creation/edit defaults remain usable. Settle additive import, equal-z/remapped IDs and version behavior. | Focused parser/writer/round-trip cases, including overlapping objects, nested holders, links, multiple layers, markup/slides, import into an occupied document, failed writes and undo.                                                                  | `ccf80408-ebdc-4bcd-a389-2d60f01e6c3d` |
| M2 Spatial canonical order [depends on M1]  | XY drives sibling text order within layer/holder groups; dependent references still import; connector geometry and exact ties have documented deterministic rules consistent with the user's ID-independent goal.                           | Reverse/randomize insertion and IDs for distinct-position fixtures; compare identity-independent statement sequences. Check repeated exports, fresh import/export, coincident positions, nested holders, connectors and spatial boundary-crossing moves. | `8a5acbc1-c444-48f1-a4d8-40f3c46bf23c` |
| M3 Integration and docs [depends on M1, M2] | Browser, standalone CLI, optional local MCP and hosted MCP use the same representation; Git diffs and visual stacking match the documented behavior.                                                                                        | Required `make ci`, production build and affected local browser journeys; representative text-diff review and existing shared-runtime integration checks. Update language reference, files/agent guidance and changelog as needed.                       | `d82ff0f3-d495-4593-96c1-2434bcec0888` |

M3 checks should establish:

- A representative diagram containing multiple layers, nested holders,
  overlapping objects, unnamed objects, connections and embedded pictures
  exports identically without edits and round-trips without visual stack loss.
- A label/style change at a unique position changes that object's statement and
  any genuine attribution only; unchanged picture data and unrelated z values
  remain intact. A move may relocate its statement, with no export renumbering.
- Reordering already-declared independent statements does not change explicit
  stacking. Bring-to-front/send-to-back changes stacking without making file
  order track z again. Use actual browser pointer/keyboard interactions in two
  independent contexts to verify collaboration and visible overlaps after import.
- A browser export can be edited by the standalone CLI and reimported, and shared
  agent operations retain the same semantics. Reuse existing local relay/runtime
  fixtures rather than build a new test system or contact AWS.
- Review ordinary Git diffs and one disjoint-edit merge on a temporary fixture
  outside a new repository/branch; do not claim every merge is conflict-free.
  Git line merging cannot guarantee semantic correctness for overlapping edits.

The test matrix is implementation evidence, not additional mandatory user
workflows or a performance budget. Preserve existing picture ordering, stable
identities, stamps and static setup guidance. Image externalization and arbitrary
handwritten formatting/comment preservation are outside this feature.

## Decisions, unknowns and next action

- **User direction:** coordinate-based file order and explicit z within layers.
- **Superseded assistant choice:** type/label-first ordering and endpoint-name
  ordering as primary file order.
- **Recommended mechanism:** Y then X within structural groups; expose existing
  `order` as language `z`; preserve raw values on export.
- **M1 result:** shared z syntax preserves values on fresh import and rebases
  imported stacks above occupied content, preserving source equal-z ties through
  remapping. Missing z retains ordinary defaults. Language version stays 1;
  older readers do not support the new attribute.
- **M2 result:** domain facing/ports and ink bounds supply coordinates; complete
  ties retain existing drawing order after semantic comparisons. No new direct
  ID-based file comparator was added.
- **Current state:** M0–M3 complete locally. Commits, pushes and deployment are
  outside this execution request.

## Execution

### M1 — Explicit stacking

Sulion expansion `72b30a97-3ac9-46f5-9ce3-d9cbbb4e1d5f`, step 1.

Add z to shared syntax, parsing, field application and printing. Reuse Item.order
without a second stored field. Preserve default creation/edit behavior. Import
into an empty document retains raw z; import into an occupied document assigns
the incoming stack consecutive values above the destination, resolving source
equal-z ties by source identity before remapping. This preserves existing additive
import behavior without changing unrelated destination values. Keep language
version 1, consistent with existing additive attributes; older readers reject z
as an unknown attribute/style, and are not claimed to support the new output.
Verify explicit item/link edits, defaults, transactional errors, nested/layered
round trips, equal-z remapping, additive imports and undo through shared tests.

M1 result: 49 focused language/file/layer tests and TypeScript checking passed.

### M2 — Spatial canonical printing

Sulion expansion `246095b1-619b-4173-a00a-e53e12693318`, step 1.

Sort shared printer siblings by layer context, world Y/X, type, name and z,
then remaining printed content. Keep holder blocks and links after objects.
Use inkBounds for drawn paths, target geometry for highlights and endpoint/bend
bounds for connectors, using existing domain facing/port rules. Feed layer
records into partial agent reads too. Preserve source stacking when library
insertion changes identities. Verify distinct-position insertion/ID independence,
geometry, repeated round trips and localized diffs.

Tie resolution uses type, label, z and remaining canonical statement content
(excluding the item's own ID), then explicitly retains the input's drawing order
only when all those values are identical. This preserves the existing rendering
tie behavior; it adds no new ID comparison to the file comparator. The optional
question about adding a separate final ID comparator is not a blocking gate and
that addition is not implemented. Coordinate-distinct items do not use this tie rule.

M2 result: focused language/file/relay tests passed (123 cases), followed by 19
spatial/portable cases including final tie handling and a real disjoint Git merge;
TypeScript checking passed. The broader unit run found two old text expectations
missing z; both expectations were updated to the new shared output.

### M3 — Integration and documentation

Sulion expansion `d613fc6a-5ce3-4455-8962-eb44d18ae3a3`, step 1.

Verify two independent browser contexts receiving explicit stacking, pointer
selection at overlaps, send-to-back/bring-to-front and export/reimport. Extend
standalone CLI/stdio and hosted-agent journeys to carry z and spatial order.
Update language reference, consumer file/agent guidance and changelog. Run
required make ci, production build and affected browser suites, review the final
diff, then close this plan. Tests use only temporary local servers and fixtures.

Initial integration: make ci passed 739 tests plus lint, types and formatting;
20 browser journeys across eight affected files passed, including overlap clicks
in two contexts, stack changes, reimport, standalone download and hosted MCP.
Final source review found partial reads needed unselected holders/endpoints for
geometry and layer lookup. The shared printer now accepts that document context
without including unselected items in output; a regression covers both cases.
Final verification after this change: make ci passed all 740 tests, lint, type
checking, Prettier and Terraform formatting. The production build passed for
browser, standalone CLI, relay, control and accounts. All 20 browser journeys
across the eight affected suites passed again, including file ordering, agent
interface, language, clipboard, PNG export, slides, geometry and editor behavior.
Git diff whitespace checking and plan/consumer-document formatting passed.

The initial new browser test used a path-only selector for rectangle shapes, then
tried a label covered by the other shape. Those test selectors were corrected to
use the painted shape and its exposed corner; final checks use real pointer
input without forced clicks. No runtime workaround was needed.

Remaining limitations are deliberate: moving across a coordinate boundary can
move a statement, the first spatial export can have a broad diff, completely
identical ties retain existing drawing order (including existing equal-z ID ties),
and older readers do not understand z. Images remain embedded and arbitrary
handwritten comments/formatting are not preserved. Implementation added no
code-source access or Git branch. The user subsequently authorized commit and
push; hosted deployment remains unverified.
