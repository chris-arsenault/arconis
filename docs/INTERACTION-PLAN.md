# Canvas interaction: context menu, on-canvas comments and quick pickers

## State and authorization

Research and planning only, prepared 2026-11-08 against `8483e42` plus the uncommitted working
tree. The owner asked for a survey of professional drawing, diagramming and mind-mapping tools
and a plan to refine three ideas: a right-click context menu, comments over objects instead of
in the side rail, and right-click-drag to a command circle or colour and shape picker. The
drawing engine overhaul in [DRAWING-PLAN.md](DRAWING-PLAN.md) comes first; nothing here is
authorized for implementation, and no Sulion plan exists for this work yet. When the owner
settles the decisions in the last section, open a Sulion plan from the phases below.

The full surveys, with per-claim sources, are outside the repository in this session's
scratchpad: `research-context-menus.md`, `research-comments.md`, `research-radial.md` and
`research-mindmap-affordances.md` under
`/tmp/claude-7321/-home-sulion-repos-arconis/5c04a88e-220a-4f3a-b3a3-cd317e903446/scratchpad/`.
Key sources are linked inline below so this document stands on its own.

## What Arconis does today

Facts read from the working tree; re-read them on resume because the drawing and architecture
plans change these files.

- **Right button.** `editor/controller.ts` disables the browser menu, and `editor/input.ts` sets
  maxGraph's `PanningHandler.usePopupTrigger`, so right-button drag pans the canvas and a static
  right-click does nothing visible. Pan is also Space, the H tool and trackpad scroll.
- **Commands live in three places with no shared registry.** Hotkeys in `editor/input.ts`
  (V H N R D P, Delete, Enter, Tab, Alt Enter, Z, ] [, Ctrl Z Y A D G); the property panel header's
  seven icon actions in `components/Inspector.tsx` (Connect, Group, Ungroup, To front, To back,
  Duplicate, Delete); and sections deeper in the panel (Add Reference, Tidy Branches, Align,
  Route around items, Present, Fit to text). There is no clipboard copy and paste, only Duplicate.
  [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) P2 already intends to give selection-wide
  operations one owner; a context menu is the first new consumer of that owner.
- **Comments.** `document/comments.ts` keys every comment to an item id (`on`); the language has
  `comment on <id>`, `reply`, `resolve` and `reopen`, so agents read and write the same threads.
  Threads show only in the property panel for the selected item (`components/CommentControls.tsx`).
  `editor/marks.ts` appends `💬N` (open threads) to the item's label, which is also what PNG export
  renders. Comments stay out of Undo and return with an undone deletion because records are kept
  while the item is gone. A slide's comments are its speaker notes
  ([ADR-0016](adr/0016-slides-are-canvas-items.md)) and show in the presenter's Notes panel.
- **Overlays.** The selection frame, peer cursors and the inline editor are HTML positioned over
  the graph from `graph.view` scale and translate (`components/SelectionFrame.tsx`,
  `components/Canvas.tsx`). Pins, menus and a floating toolbar can use the same technique.
- **No touch or pen handling** beyond what maxGraph does by default. The property panel is hidden
  at widths of 1200px and below (`styles.css`), so narrow screens currently have no path to
  comments, styles or the header actions at all.
- **Hotkeys keep one meaning everywhere** (owner's rule), and the single toolbar has no modes
  ([ADR-0005](adr/0005-one-toolbar.md)).

## Survey findings and what transfers

### 1. Right-click context menu

Evidence, from source for the open-source tools and help centres for the rest:

- Every open-source canvas (Excalidraw, tldraw, draw.io, Penpot) **replaces the selection when
  right-clicking an unselected object and keeps a multi-selection when clicking a member**.
  tldraw and draw.io clear the selection on empty-canvas right-click; Excalidraw and Penpot do not.
  Miro, by contrast, never selects on right-click
  ([Excalidraw App.selection](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/App.selection.ts),
  [tldraw Idle.ts](https://github.com/tldraw/tldraw/tree/main/packages/tldraw/src/lib),
  [mxPopupMenuHandler](https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/handler/mxPopupMenuHandler.js)).
- **Menu shape.** Clipboard, z-order, group/ungroup, lock and delete-last are universal.
  Excalidraw is flat and hides inapplicable items by predicate; tldraw and Penpot use one level
  of submenus (Edit, Arrange, Reorder); draw.io removes disabled items and collapses separators.
  Guidance converges on at most 12 to 15 items in groups of up to 7, frequency ordering between
  groups and stable positions within, destructive item last, every item also reachable elsewhere
  ([Windows UX guide](https://learn.microsoft.com/en-us/windows/win32/uxguide/cmd-menus),
  [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/context-menus),
  [NN/g](https://www.nngroup.com/articles/contextual-menus/)).
- **Shortcuts beside items** are shown by Excalidraw, tldraw and Penpot and hidden by draw.io;
  Apple and Microsoft say omit them, NN/g says show them so people learn. Web canvases show them.
- **Style and colour controls live outside the right-click menu everywhere**: docked panels
  (Excalidraw, tldraw, draw.io, Penpot) or a floating toolbar near the selection (Miro, FigJam,
  Whimsical, Lucidchart, Visio web). Microsoft formalises the pair as proactive (appears on
  selection, no focus, a few icons plus overflow) and reactive (right-click, full list, focused)
  ([CommandBarFlyout](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar-flyout)).
  Floating toolbars draw occlusion complaints; mitigations are Shift to hide (Miro), a draggable
  bar (Lucid) and not reappearing on drag release (Miro).
- **Right-drag is pan** in Excalidraw, tldraw, draw.io, Miro and Lucidchart. Because macOS and
  Linux fire `contextmenu` on mouse down and Windows after mouse up, a page cannot tell a click
  from a drag at event time. Excalidraw and tldraw both swallow the trusted `contextmenu`, capture
  the pointer, pan once the pointer moves past 4 to 6 px and open their own menu on release if it
  never moved
  ([Excalidraw App.pan.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/App.pan.ts),
  [tldraw useCanvasEvents](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/hooks/useCanvasEvents.ts),
  [Firefox contextMenuShowEvent](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserSettings/contextMenuShowEvent)).
- **Touch and keyboard.** iPadOS Safari never fires `contextmenu` for a long press
  ([WebKit 213953](https://bugs.webkit.org/show_bug.cgi?id=213953)), so Excalidraw and tldraw run
  their own 500 ms timer, cancelled by movement or a second finger and gated to the select tool.
  The keyboard context-menu key and Shift F10 fire `contextmenu` on the focused element, which
  gives a keyboard route for free; the menu then needs the
  [WAI-ARIA menu contract](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) (arrow keys,
  Escape returns focus to the invoker). Neither Excalidraw nor tldraw fully meets it.

What transfers to Arconis:

- One **command registry** that hotkeys, the panel header, the context menu and any later
  toolbar or ring all read: id, label, shortcut, availability predicate over the selection, and
  the operation. This is the P2 work in the architecture plan; the menu should not grow a fourth
  copy of the command list.
- **Selection rule:** right-click on an unselected object selects it alone; on a member of the
  selection keeps the selection; on empty canvas keeps the selection and shows the canvas menu
  (Excalidraw and Penpot's choice, which avoids losing a selection by a slip).
- **Proposed contents**, mapped to commands that exist unless marked new. Groups are separated;
  inapplicable items are removed rather than dimmed, except Delete which stays. Shortcuts shown.

  | Context           | Items in order                                                                                                                                                                       |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Empty canvas      | Add note here, Add text here (new: place at the pointer) · Paste here (new: needs clipboard) · Select all · Fit canvas, Grid, Reference lines · Save view here                       |
  | One object        | Edit text (Enter) · Add branch (Tab), Add sibling (Alt Enter) · Duplicate (Ctrl D), Comment… (new: opens the thread) · Bring to front (]), Send to back ([) · Zoom into (Z) · Delete |
  | Two objects       | adds Connect, Add reference before the arrange group                                                                                                                                 |
  | Several objects   | adds Group (Ctrl G), Align ▸, Distribute ▸, Tidy branches                                                                                                                            |
  | Group or frame    | adds Ungroup (Ctrl Shift G)                                                                                                                                                          |
  | Line              | Comment… · Route around items · Bring to front, Send to back · Delete                                                                                                                |
  | Slide             | adds Present deck                                                                                                                                                                    |
  | Text being edited | the browser's own menu; the textarea is not the canvas                                                                                                                               |

  Line type, colours, fonts and named styles stay in the property panel or the later selection
  toolbar, as in every surveyed tool.

- **Mechanics:** own the `contextmenu` event, decide click versus drag on pointer up, clamp the
  menu to the viewport, `role="menu"` with arrow keys and Escape returning focus to the canvas,
  long-press timer on touch in the select tool, and a Menu-key route. maxGraph's
  `PanningHandler` keeps right-drag pan if the owner keeps that meaning (see decisions).

### 2. Comments over objects

Evidence:

- **Anchoring.** Object pins that move with the object are the norm (Miro any object, FigJam,
  Lucidchart, Sketch artboards, Penpot boards, tldraw with a normalised offset); canvas-point pins
  exist in Figma, FigJam, Whimsical and Miro's empty board; region comments only in Figma, FigJam,
  Lucid and tldraw. Figma's object pins are the most complained-about: cut and paste detaches
  them, nested and auto-layout children lose them, region comments never follow a moved frame
  ([forum, 104 likes](https://forum.figma.com/t/keep-comments-pinned-to-design-elements-including-nested/4632)).
  Apple Freeform has no comments at all.
- **Deletion.** Only tldraw documents a policy: a deleted shape's thread becomes a point pin
  where it last sat and reattaches on undo ([tldraw commenting](https://tldraw.dev/sdk-features/commenting)).
  Miro deletes comments with the item (open request since 2021); Lucid leaves an undeletable
  "shape was deleted" ghost. Arconis already keeps records and restores on undo.
- **Pin form.** Avatar or initial pins (Figma since 2021, Whimsical, Canva, Miro, tldraw),
  numbered bubbles (Penpot), state-coloured dots (Sketch: unread, read, own, resolved). Unread
  counts on the pin in Whimsical and Miro. tldraw's imprecise anchor sits at the shape's top-right
  corner, outside the content, which is the documented answer to "markers cover board text"
  (Miro Comments 2.0 thread) and "bubbles are occluded by shapes" (Lucid).
- **Clustering** at zoom-out with hysteresis in Figma, Miro and tldraw (count badge, click zooms
  to the split point). Miro's counters hid per-pin colour codes, so Miro added a toggle.
- **Interaction** is uniform: `C` enters comment mode, click a pin opens a popover thread at the
  pin with a sidebar list alongside, drag a pin to re-anchor, Escape closes. Lucid is the only
  panel-first tool.
- **Visibility.** Pins visible by default with one-key hide, Shift C in Figma, FigJam, Miro and
  tldraw; resolved threads leave the canvas by default everywhere with a show-resolved switch;
  Figma's default-visible pins drew sustained complaints, and the hide state resetting per file
  was the sore point. Figma prototypes hide comments when the chrome is hidden.
- **Presenter notes.** No surveyed tool renders comments as speaker notes; Miro, Canva and Google
  Slides keep notes separate, and a Figma user who used comments as notes reported cluttering the
  file for a 30-person organisation.

What transfers:

- **Keep the object anchor as the model.** It is the field's best-behaved anchor, it is what the
  language already expresses, and Arconis's record retention already gives tldraw's orphan
  behaviour. Point-anchored comments would add a comment with a canvas point to the language and
  the file format; defer unless a concrete need appears (see decisions).
- **Pin:** an HTML overlay at the item's top-right corner outside its box, showing the first
  author's initial in their presence colour and the open-thread count; resolved threads hidden
  unless shown; a line's pin at its label point. Pins replace the `💬N` label mark on the live
  canvas. Keep pins small and off the content.
- **Thread popover** anchored to the pin with replies, resolve and a composer, so a reader never
  needs the panel; the panel's Comments section stays as the list for the selected item. Clicking
  the pin does not change the selection.
- **New threads:** Comment… in the context menu and a `C` comment tool that turns the next click on
  an object into a composer at that object; `C` is free today and is the field-wide key.
- **Visibility:** Shift C hides and shows pins for this person, remembered like the grid setting;
  pins hidden during presentation, where Notes already carries the slide's threads; PNG export
  omits pins (consistent with the field, and the label mark goes with them).
- **Clustering:** merge pins into a count badge when they overlap at the current zoom, with
  hysteresis; defer until a room with dense threads shows the need, but reserve the pin layout for
  it.
- **Agents** need nothing new: they already read and write threads by item id, and a pin is only a
  projection.

### 3. Right-click-drag to a command circle or picker

Evidence:

- **No web diagramming tool ships a radial menu**; Excalidraw, tldraw, draw.io, Miro, FigJam,
  Lucidchart and Whimsical all answer "colour, shape swap and common commands near the pointer"
  with a linear floating selection toolbar or docked style panel. Desktop creative tools do ship
  them: Maya marking menus, Blender pies, Fusion 360 (a ring plus a linear list on right-click),
  Krita's pop-up palette, Procreate QuickMenu, SketchBook. Each of those gives navigation to the
  middle button or a modifier so the right button is free.
- **Research limits.** Kurtenbach and Buxton: errors stay under 10% only at 8 or fewer items and
  at most 2 levels, even counts, frequent items on the N S E W axes; marks were 3.5× faster than
  menu selection in the field, and experts still reopen the visible menu to refresh their memory
  ([limits](https://www.billbuxton.com/MMExpert.html),
  [learning](https://billbuxton.com/MMUserLearn.html)). Henderson et al. 2020 found no benefit
  from delaying the menu's display, so show it at once and let fast strokes select anyway.
  Blender's centre dead zone exists to stop accidental selection on release.
- **Both modes from one press** is standard (Maya, Blender, Procreate): release without moving
  leaves the ring open for a click; move past the dead zone and release to select.
- **The right button cannot mean both pan and mark.** The same OS timing issue as the context
  menu applies, and a drag past the threshold must be either a pan or a stroke. Arconis's palette
  has six colours plus custom, which fits an eight-slot ring; a shape ring fits the stencils
  people swap between (rectangle, ellipse, diamond, note, text, card, frame).
- **Touch** has no mark-ahead equivalent beyond a long press that opens a sticky ring; pens
  report the barrel button only while the tip touches.

What transfers:

- Treat the ring as the **expert mirror of the context menu's first eight items**, generated
  from the same registry, with the linear list as the long tail. Fusion 360 is the shipped
  precedent for showing both from one right-click.
- Two sub-rings at most: **Colour** (six swatches, custom, clear) and **Shape** (swap stencil,
  keeping text, size and look, as Lucid's Change shape and Whimsical do). Direction picks the
  item; no deeper nesting.
- Dead zone of 4 to 6 px; labels shown immediately; Escape or release in the centre cancels; the
  ring stays centred on the press point near viewport edges.
- The trigger is the decision below. Whichever it is, it is a preference, because Opera's
  built-in gestures and Firefox and Chrome gesture extensions also claim right-drag.

### 4. Quick-create and mind-map affordances seen along the way

Not in the owner's three ideas, recorded because the surveyed tools pair them with the above and
Arconis's topic trees would use them.

- **Add-next handles** on a selected object (FigJam and Miro show them only on selection; draw.io
  on hover): click places a connected clone at a default offset in that direction, drag places it
  where released; every tool with handles also has keyboard clone-and-connect (draw.io Alt Shift
  Arrow, Whimsical Option Arrow, Excalidraw Ctrl Arrow). Miro's documented failure is accidental
  creation while starting a drag, with no off switch; a short dwell before the handle arms and
  showing handles only on the selection are the mitigations in use. Arconis already has Tab and
  Alt Enter; handles would be their pointer form, and arrow-key clone-connect would need keys that
  nothing else uses.
- **Collapse a branch** converges on a hover minus button plus a count badge that expands (Miro,
  XMind, Ayoa); collapse state is per viewer. Arconis has culling by zoom and `⊕` for hidden
  detail but no explicit fold.
- **Double-click empty canvas** creates a note or card in Scapple, Obsidian Canvas, Heptabase,
  Milanote and XMind, and opens a shape picker in draw.io. Arconis's double-click only edits.
- **Floating selection toolbar** contents across Whimsical, FigJam and Lucid: fill, line colour,
  text size, shape swap, link, and an overflow to the full menu. Whimsical's rationale: popups
  only above four or five options, object controls separated from global ones
  ([Whimsical deep dive](https://whimsical.com/blog/contextual-toolbars-deep-dive)).
- **Connector editing** everywhere offers drag-a-segment to add a waypoint, swap direction, and
  per-end arrowheads from a bar near the line; tldraw binds precisely on slow drags and to the
  centre on fast ones.

## Proposed phases

Order follows dependencies, not priority; the owner can reorder once the decisions are made.
Each phase expands into steps in a Sulion plan when it starts, after re-reading the sources
above.

### I1 — Command registry and context menu

[depends on ARCHITECTURE-PLAN P2, or absorbs its command-ownership step]

Scope: one registry of selection commands with labels, shortcuts and availability; the hotkey
table, panel header and new context menu read it. Right-click handling that owns `contextmenu`,
decides on pointer up, and keeps whichever pan meaning the owner chooses. Menu contents per the
table above, `role="menu"`, keyboard opener, viewport clamping, touch long press in the select
tool. New commands only where the menu needs them: Add note here, Add text here, Comment…;
Paste here only if clipboard copy and paste is added, which is its own small decision.

Acceptance: every menu item does what its panel or hotkey twin does, on the same selection, with
the same Undo grain; right-click selection rules hold across objects, members, lines and empty
canvas; the menu opens from the keyboard and closes back to the canvas; a right-drag still does
what it did before unless the decision changes it. Evidence: unit tests on the registry's
availability predicates, independent-context browser journeys with real pointer input on
Chromium and WebKit for the click-versus-drag timing.

### I2 — Comment pins and thread popovers

[depends on I1 for Comment… and the `C` tool entry]

Scope: pins as overlays at the item's corner, first author's initial and open count, resolved
hidden by default, thread popover with reply, resolve and composer, `C` comment tool, Shift C
local visibility remembered, pins hidden while presenting, PNG export without pins, label mark
removed. Agents unchanged.

Acceptance: a thread written by an agent or a peer appears as a pin within the usual update
latency; the pin follows its item through move, resize, rotation, holder changes and collective
transforms; deleting and undoing the item removes and restores the pin; hide is local; a slide's
notes still show in Notes while presenting and not as pins. Evidence: comment model tests as
today, browser journeys across two contexts, export checks.

### I3 — Command ring

[depends on I1 and the trigger decision]

Scope: the ring over the context menu's first eight items, Colour and Shape sub-rings, both
sticky and stroke modes, dead zone, immediate labels, cancel paths, preference for the trigger,
long-press sticky ring on touch.

Acceptance: stroke selection matches click selection for every wedge; no selection on release
inside the dead zone; the ring never displaces the pan gesture the owner kept; keyboard users
reach the same commands through the linear menu. Evidence: pointer-sequence browser tests at the
dead-zone boundary and at viewport edges.

### I4 — Selection toolbar and add-next handles

[depends on I1; independent of I2 and I3]

Scope: a proactive bar near the selection with fill, line colour, text size, shape swap, comment
and an overflow to the menu; Shift hides it; it does not reappear on drag release; add-next
handles on the selection with a dwell; keyboard clone-and-connect; double-click on empty canvas
creates a note. Collapse and connector-bar work stay in the backlog until the drawing plan's
line work lands.

Acceptance: the bar never covers the selected object, applies to multi-selections as the panel
does, and keeps the panel's values in sync; handles never create an object from a plain drag.

## Decisions for the owner

1. **What does the right button mean?** (a) Keep right-drag pan and static right-click menu, the
   web-canvas convention; the ring then needs another trigger such as a held key, as Blender's
   pie-on-drag does. (b) Give the right button to commands as the owner sketched: static
   right-click opens ring plus list, drag past the dead zone strokes a wedge; pan stays on Space,
   H, scroll and a new middle-button drag. Desktop professional tools do (b) and web tools do (a).
   Recommendation: (b) behind a preference whose other value is (a), because Arconis already has
   three pan paths and the ring is the owner's stated intent; the cost is one habit for people
   arriving from Miro or draw.io.
2. **Pins replace the label mark, and exports lose the comment count.** Recommendation: yes;
   every surveyed tool keeps comments off exports.
3. **Point-anchored comments** on empty canvas, which need a language and file change.
   Recommendation: defer; object pins cover notes, slides and lines, and agents never need a
   point.
4. **Speaker notes as pins.** A slide's threads would show a pin on the slide's corner for
   everyone, which is the clutter Figma users report. Recommendation: keep the merged model and
   place a slide's pin in its label bar, hidden while presenting; revisit if notes-heavy decks
   make editing noisy.
5. **Clipboard copy and paste**, which the empty-canvas menu's Paste here presumes. It is absent
   today and is a small feature of its own; decide whether I1 includes it.
