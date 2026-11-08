# Markdown canvas text

Completed 2026-11-08 after review. The owner authorized updating this plan and executing all phases.
Execution is local; commit, push and deployment are outside this request. Preserve concurrent
slide/template and drawing changes in this checkout.

## Outcome and agreed scope

People and agents author the same multiline Markdown plus LaTeX. Each text-bearing canvas item
has box-level typography and positioning. Code fences render with syntax highlighting, and Copy
Markdown returns portable source. Files, collaboration, presentation and PNG preserve the content.

The owner's corrections supersede the original rich-text proposal:

- "box level styling + markdown is sufficient": no per-character font, size or color model.
- Include syntax-highlighted fenced code for major programming languages and configuration formats.
- Text should be roughly Markdown plus LaTeX, like GitHub's math support. Agents write natural
  multiline text, and integrations can copy Markdown without reconstructing formatting.
- "update the plan and then execute all phases": mathematics is included, not an optional handoff.

Original requirements retained: several fonts; bullets and nested numbered lists; all nine text
positions; colors; bold, italic, underline, strike, super/sub; enough fidelity without a word processor.
Markdown supplies inline emphasis, lists, headings, quotes, links and code. A small allowlist of
`<u>`, `<sub>`, `<sup>` and `<mark>` supplies the remaining inline semantics. Visual controls act on
the whole primary label. Subtitles remain their existing plain secondary metadata.

Existing boundaries from AGENTS.md and ADR-0014 remain: Yjs is authoritative, maxGraph projects
the canvas, the canvas language/files/agents use the same model, peer input is untrusted,
dependencies are permissively licensed, and automated tests use only local services. No new
backend, storage, rendering service, branches or hosted artifact publication.

Exclude per-letter visual styling, arbitrary HTML, uploaded fonts, embedded media in text, page
layout, pagination, tracked changes and document import/export formats. Existing pictures and
slide-export work remain separate. Tables may use ordinary Markdown support if provided by the
selected parser; they do not become project-management objects.

## Research and design decisions

Official documentation and public feedback were read on 2026-11-08. This was a focused review,
not a representative survey or hands-on comparison of paid products. Votes are page snapshots.

| Source                                                                                                                           | Relevant finding                                                                                           | Resulting decision                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Miro Text](https://help.miro.com/hc/en-us/articles/360017572094-Text)                                                           | Fonts, color, inline emphasis, links and multilevel lists establish the everyday canvas baseline.          | Include that baseline with Markdown content and simple box controls.                                         |
| [FigJam text](https://help.figma.com/hc/en-us/articles/1500004291281-Create-text-and-links-in-FigJam)                            | A small font selection, list shortcuts and fixed-width growing text provide useful fidelity.               | Bundle three font roles and offer explicit text sizing controls.                                             |
| [tldraw rich text](https://tldraw.dev/sdk-features/rich-text)                                                                    | Text, notes, shapes and arrow labels support consistent formatting; measurement and export account for it. | Apply Markdown to all primary canvas labels, including connector labels.                                     |
| [draw.io styles](https://www.drawio.com/docs/manual/styles/text-styles/)                                                         | Diagramming includes horizontal/vertical positioning, fonts, super/sub and inline emphasis.                | Retain the nine positions and semantic inline formatting.                                                    |
| [Excalidraw feedback](https://github.com/excalidraw/excalidraw/discussions/5050)                                                 | Users report separate-object workarounds for emphasis and want visible numeric font sizes.                 | Include inline Markdown and numeric box typography.                                                          |
| [Mixed sizes/fonts](https://community.miro.com/ideas/multiple-font-sizes-fonts-in-a-single-text-box-7817), 90 votes              | Users need headings, body and citations without managing many objects.                                     | Markdown headings provide hierarchy; arbitrary mixed font sizes are superseded by the owner's simpler scope. |
| [Alignment within a shape](https://community.miro.com/ideas/support-different-text-alignment-styles-within-a-single-shape-10979) | Users want headings and body to align independently.                                                       | Recorded use case; per-paragraph visual alignment is superseded by the owner's box-level choice.             |
| [Line spacing](https://community.miro.com/ideas/line-spacing-adjustments-2739), 161 votes                                        | Tight paragraph and list spacing produces manual workarounds.                                              | Keep box-level line-height and paragraph spacing.                                                            |
| [List padding](https://community.miro.com/ideas/remove-indent-from-list-when-it-is-the-only-content-in-a-text-box-9624)          | List indentation wastes limited box area.                                                                  | Use compact hanging markers and nested list layout.                                                          |
| [TeX request](https://community.miro.com/ideas/tex-syntax-2224)                                                                  | Engineering and mathematics users need editable formulas.                                                  | Preserve LaTeX source and render math locally.                                                               |

[GitHub documents](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions)
inline `$...$`, display `$$...$$` and fenced `math`. Its renderer is MathJax; this implementation
uses KaTeX's supported LaTeX subset with the same common delimiters.
[Language-labelled code fences](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks)
carry code and the highlighter's language hint. Unknown languages remain readable code.

## Architecture and behavior

### Canonical source

Keep `Item.name: string` and its existing `Y.Text` exactly as the authority. Markdown is that
string, not a second body or an editor-private tree. Keep the existing selection-aware textarea
binding, local Undo and IME handling. Replace the Quill proposal: no rich-editor model or migration
is needed. Source editing plus a rendered preview uses the same content as the passive label.
Toolbar actions insert ordinary Markdown or the small supported inline tags.

Ordinary single-line labels remain ordinary text. The language adds raw multiline quoted strings
so agents can include actual Markdown, code fences, quotes and LaTeX backslashes without escaped
paragraph commands. Canonical printing chooses a safe delimiter. Existing escaped strings remain
valid. An unchanged name prints identically, and existing agent conflict detection sees Markdown
source edits. Styles retain their existing separate item fields and named-style inheritance.

### Box styling

Add `font` (sans/serif/mono), `valign` (top/middle/bottom), underline, strike, text highlight,
line-height, paragraph spacing, padding and text-fit mode to the existing `Look`. Existing
text-size, text-color, bold, italic and horizontal align continue. Model, parser, printer,
reference and controls change together; only editor/styles.ts translates maxGraph style keys.

Bundle Inter, Source Serif 4 and Source Code Pro with their OFL notices and actual regular, italic,
bold and bold-italic coverage. System fallbacks handle other scripts. Code uses monospace and its
syntax colors; formulas use mathematical fonts. Nine positions combine three horizontal and three
vertical choices within the item's label region, including title/caption regions and line anchors.
Mixed multi-selection controls show mixed values rather than the first object's state.

Free text can grow vertically at fixed width. Fixed boxes preserve authored geometry and offer
Fit to text; no automatic font shrinking or content deletion. Only the browser authoring a text
or sizing edit commits measured geometry. Remote clients project the stored result. Relay-side
layout uses conservative deterministic estimates; it does not gain a browser rendering service.

### Markdown, code and math

Use markdown-it with HTML disabled and a token rule that accepts only the exact paired inline
tags above, without attributes. Disable image embeds in text. Escape everything else, validate
links, and preserve existing escaped subtitles, badges and canvas marks. Use highlight.js's common
language set, with plaintext fallback for absent/unknown language hints; never execute code.
Use @mdit/plugin-katex with dollar delimiters, math fences, `trust: false`, isolated macro state
and normal expansion safeguards. Invalid math retains editable source and visible errors.

The source editor offers Markdown actions, fenced code/language insertion and equations, a preview,
Copy Markdown and Copy plain text. Copy code copies just the original fenced contents. Enter
continues lists; Tab/Shift-Tab indent/outdent in lists and code. Topic shortcuts continue outside
those contexts. Formatting shortcuts operate on source ranges, and one Undo reverses an action.
Toolbar focus must preserve selection and must not close inline editing prematurely.

Copy Markdown preserves exact source. Copy plain text removes presentation syntax, retaining list
content, whitespace, code and math source. Native canvas files preserve source and all box styles;
portable Markdown does not claim to reproduce fonts, colors or canvas positioning in every app.

### Rendering and export

Use the same renderer and typography rules for preview and passive canvas labels. Cache by source
and validate only changed content; retain screen-pixel rendering and culling at deep zoom. Export
must embed the applicable CSS and bundled font bytes inside its SVG before rasterization, including
KaTeX and syntax colors. A PNG's pixels and its embedded editable canvas are separate checks.

## Milestones

### M0 — Rendering foundation

Acceptance: nested Markdown, code highlighting, safe inline tags, links and math render without
accepting arbitrary HTML or external text images; no shared-type migration is required. Source,
blank lines and whitespace remain untouched. Standard-library integration replaces Quill entirely.

#### Execution expansion

Sulion branch `e660898b-0af7-486a-b72c-11ac4fe519da`.

1. Add the renderer and dependencies; exercise actual parsing, safe output, languages and math in
   focused tests. Files: `frontend/src/text/`, package manifest/lock. Complete: 21 focused tests pass.
   The first type check found a v14/v15 token-type import mismatch, corrected to the library's
   native v15 types. Final checks will recheck the full integration.

### M1 — Model and language [depends on M0]

Acceptance: box styles and raw multiline Markdown are readable/writable in the language, files,
named styles and agents. Existing plain/escaped strings still work. Code fences and LaTeX survive
exact source round trips, duplication and import. Invalid writes remain atomic and stale agent
writes still detect content changes. No separate formatted-content model.

#### Execution expansion

Sulion branch `8646e8e6-dc0c-468e-ac2d-cd410b98e974`.

1. Add box style fields to `document/types.ts`, language look words/parser/printer, and raw
   multiline strings to the lexer/printer. Keep references exact. Exercise files and agent
   round trips with Markdown, code and LaTeX, including delimiter collisions. Complete: 48 focused
   renderer/language/session tests and TypeScript pass.

### M2 — Editing and formatting [depends on M1]

Acceptance: source and preview, toolbar, code/math insertion, copy actions, list indentation,
three font families, all nine positions, box spacing and sizing work with actual pointer and
keyboard input. Ordinary topics retain their shortcuts. Peer changes preserve active selection,
composition and editor geometry. Inline and inspector controls share command behavior.

#### Execution expansion

Sulion branch `b97f0a43-8297-4194-94c5-5058a0a87e40`.

1. Add source-editing commands and key routing, preview/copy controls and box-level text controls;
   extend the safe canvas renderer and bundled typography. Files: `text/`, `components/`,
   `editor/rendering.ts`, `editor/styles.ts`, `main.tsx`. Validated through the existing
   local browser harness after wiring, retaining the current collaborative textarea binding.
   Three new browser journeys pass for rendering/code/math/copy, all nine positions and fonts,
   and source keys/list indentation/toolbar focus. Existing peer selection/IME/Undo journeys pass.
   Native position selection and expandable tools keep the sidebar narrow. At 768px height the
   expanded properties scroll vertically; the old no-scroll assertion now checks no horizontal
   overflow and that geometry controls remain reachable. No user requirement forbids vertical scroll.
   Complete: eight Markdown/interface browser journeys and TypeScript pass; the existing peer
   selection, geometry, composition and local Undo journeys also pass.

### M3 — Fidelity and collaboration [depends on M2]

Acceptance: collaboration/reconnect/reload and local Undo preserve source and styles; code,
lists and math show consistently on the canvas and in presentations; fonts and CSS survive PNG
rasterization, and embedded source imports unchanged. Deep zoom remains usable without new caps.
Run independent-context local browser journeys and representative timing checks, not just model tests.

#### Execution expansion

Sulion branch `ac247fc5-fdce-40b3-888f-11b104ef28d1`.

1. Embed matching Markdown/math CSS and the required local font faces in PNG's SVG; extend label
   footprint estimates and authored text sizing. Files: `editor/pngExport.ts`, export text assets,
   `language/layout.ts`, text layout and local browser journeys. Verify actual pixels separately
   from the PNG's editable source, peer edit/Undo, reload, fonts, growing/fixed boxes and deep zoom.
   Complete: three fidelity journeys pass for peer edits/Undo/reload, growing and fixed text,
   and PNG pixels plus exact source reimport. The five existing picture journeys and existing
   3000-object scale journey pass. Visual inspection found global heading typography leaking
   into the canvas and reversed export CSS ordering; both were corrected. Fit to text excludes
   vendor icons, pictures, slides and container titles so their geometry rules are preserved.

### M4 — Mathematics completion and documentation [depends on M3]

Acceptance: inline/display/fenced math, invalid source recovery, copying, files, agent writes,
peer edits and exported pixels are covered end to end. Update normal usage, architecture and
changelog documentation. Run `make ci`, `make build`, `make test-browser`, inspect the final diff,
and report exact failures and coverage limits. Close the plan only when all phases meet acceptance.

#### Execution expansion

Sulion branch `fee37eb1-e664-4c95-92e4-6613466c0a3d`.

1. Complete math invalid-source/source-copy/agent/presentation acceptance and normal docs. Run
   required CI, build and independent-context local browser suites. Inspect actual failures,
   fix this feature's regressions, review owned changes and close the plan with honest coverage.
   Complete: inline/display/fenced math, invalid-source recovery, source copying, agent writes,
   peer editing and presentation pass. CI passes 323 tests and the production build passes.
   The full Chromium suite passes all 89 journeys. After a Firefox-specific font descriptor
   export failure, serialization replaced descriptor mutation: all five focused Firefox
   fidelity/math journeys and seven affected Chromium export/fidelity journeys pass. The final
   serialization passes the actual PNG journey again in both engines. An intermediate regex
   failed lint and was replaced with direct descriptor serialization; final lint has no errors.
   WebKit cannot launch because this host lacks its required system libraries; its behavior is
   unverified. Native OS IME integration is unverified; existing composition tests still pass.

## Sulion mapping and progress

Root `8f636268-0e1e-4d33-9c2c-94e0becb7cab`.

| Milestone       | Phase ID                               | State                                          |
| --------------- | -------------------------------------- | ---------------------------------------------- |
| Research/design | `14396115-0b0b-4a60-b25e-1ed219f6edcd` | Completed; revised following owner corrections |
| M0              | `c4c180d5-0084-4f70-b236-32e3600136f2` | Completed                                      |
| M1              | `501c0a34-90f3-4465-9fcc-84548b85799a` | Completed                                      |
| M2              | `2e8f6ca4-68a7-49ad-8cad-f9b7cc825798` | Completed                                      |
| M3              | `a9d26c10-6db0-4239-874d-7942454e1c92` | Completed                                      |
| M4              | `99d6c5c8-5893-490f-9fcd-8d1267872226` | Completed                                      |

Implementation assumptions: ordinary Markdown source editing is sufficient for the approved
scope; no rendered rich-editor tree is needed. Measurements and browser tests will determine
actual font/export behavior. Exact Latin font coverage does not establish universal glyph coverage.
CI passes 323 tests, types, formatting and Terraform formatting, with 103 lint warnings and no
lint errors; the production build passes. Earlier browser failures in group-label whitespace,
empty drawing labels, list caret placement and equation-menu clipping were corrected without
weakening those product assertions. The clean full Chromium run passes 89 tests in 363 seconds;
the export-only correction afterward passes affected checks in Chromium and Firefox. The existing
3000-object scale journey passes; a 450-object run imported in 637ms and synchronized in 1285ms
on this host, not a guaranteed latency. Fontsource's CSS-only licenses ship with their assets
because the build's JavaScript license inventory does not include those packages.
All milestones are complete locally. No commit, push or deployment was performed.
