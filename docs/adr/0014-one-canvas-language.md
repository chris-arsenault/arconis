# 0014 — One canvas language for the document, files and agents

- Status: Accepted
- Date: 2026-11-07
- Amends: ADR-0013

## Context

ADR-0013 gave agents a domain layer that projected the document's renderer records into domain items,
wrote those items to a JSON file, and took batches of JSON operations. The owner then set three
requirements. The domain language, the document model and the save format are one representation, with
the screen representation the same concept, deviating only where maxGraph needs it. One tool call builds
many items and relations in domain terms, chained, and a whole section can be written and placed at once.
The language has to express complex architectures; the reference is a multi-region AWS diagram with
nested frames, items aligned across frames, bands crossing regions and labelled lines on chosen sides.
The owner also asked for braces rather than indentation, and for no backward compatibility, because
the product has no users yet. maxGraph stays the renderer and interaction engine.

## Decision

The document stores items under domain names: type, name, subtitle, holder, box, look in plain terms,
stencil, icon, line ends and ports, and points. `editor/styles.ts` is the one place where an item becomes
maxGraph styles, and named styles live in the document beside the items that use them.

The canvas language (`language/`) writes those items as text. Braces hold contents, rows, columns and
grids arrange items, placement is relational or exact and may name items in other frames, and lines take
ports, labels, chains and fan-outs, with items declared at their ends. A file is the whole canvas in the
language, reading returns it, and agents change the canvas with one `write` tool that takes statements and
applies all of them or none. Relations and arrangements are applied once and stored as positions.

## Alternatives considered

- **A domain layer over renderer records, with a JSON file and JSON operation batches.** ADR-0013's
  design. The owner rejected three representations of one model, and tools that take arbitrary JSON.
- **A small arrow syntax like Mermaid's.** The owner rejected it because such diagrams cannot express
  complex architectures and stop being readable after a handful of nodes.
- **A nested JSON tree of items.** The owner said it was not what was meant and did not meet the goals
  of domain-specific tooling.
- **Indentation for nesting.** The owner preferred braces. Published studies give no clear answer either
  way; text sent through a tool call arrives inside a JSON string, where braces survive changed
  whitespace and indentation does not.

## Consequences

- People's edits and agents' edits are the same records, so a read after someone drags an item shows
  where it now is, in the language.
- Placement relations are not kept, so moving one item does not move items placed beside it. Keeping
  rows and relations arranged as people edit is in the backlog.
- Files from earlier versions no longer open, and rooms created before this change appear empty.
- Every style setting the editor offers needs a term in the language; there is no store for settings
  without one.
