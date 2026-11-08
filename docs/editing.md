# Using the canvas

Create a room, then click a stencil in the left rail and click the canvas, or drag a stencil onto the
canvas. New notes and text open ready for typing; double-click edits any object directly.

## Selecting and transforming

- Shift-click, Ctrl-click or Command-click toggles an object in the selection.
- Dragging across empty canvas selects an area.
- Handles resize a shape, and the top handle rotates it.
- Several objects or a drawing get a frame: its corners scale and its top handle rotates the whole
  selection. Hold Shift to keep proportions or snap the angle.

Selecting something opens the property panel on the right, showing only what applies to it. With
several objects selected, it applies styles to all of them.

## Markdown and text styles

Primary canvas labels are Markdown: headings, nested bullets and numbered lists, quotes, links,
**bold**, _italic_, strike with `~~text~~`, and inline code. Exact `<u>`, `<sub>`, `<sup>` and
`<mark>` tags support underline, subscript, superscript and highlighting without allowing other
HTML or attributes. Subtitles stay plain text. Images use canvas picture items.

Edit the source directly by double-clicking or pressing Enter, or use Object text in the property
panel. Markdown tools expands formatting actions, a live Preview, code insertion and copy actions.
Ctrl/Command B, I, U and K add bold, italic, underline and a link. Ctrl/Command Shift X adds strike.
The tools preserve your text selection; Undo reverses your own edits.

Use fenced code blocks with a language such as `python`, `typescript`, `javascript`, `java`, `c`,
`cpp`, `csharp`, `go`, `rust`, `ruby`, `sql`, `bash`, `json`, `yaml`, `html` or `css`. Unknown or
unlabelled fences remain readable monospace code. Preview offers Copy code for each code block.
Nothing executes code.

Math uses LaTeX inside `$...$`, display math inside `$$...$$`, or a fenced `math` block. More in
Markdown tools inserts inline or display equations. Rendering happens locally with KaTeX; an
unsupported expression shows an error while its original source stays editable. Escape literal
dollar signs with a backslash when needed; dollars inside code remain literal.

Enter continues a list, and Enter on an empty item exits or outdents it. Tab/Shift Tab indent and
outdent lists and code. Shift Enter inserts a continuation line in a list. Ordinary topic text
retains Tab to add a branch and Alt Enter to add a sibling.

The Text properties style the whole box: Inter, Source Serif 4 or Source Code Pro; numeric font size;
color; bold, italic, underline and strike; and nine positions combining left/center/right with
top/middle/bottom. Spacing and sizing adds line height, paragraph spacing, padding, highlight and
Fit to text. Free text can grow vertically at fixed width; explicitly resizing its height fixes
the height again. Fit to text does not resize pictures, icons, slides or container titles.

Copy Markdown copies exact portable source. Copy plain text removes markup while retaining content,
code and equation source. Native canvas files and PNG's embedded copy also preserve box styles;
other Markdown applications choose their own typography. Fonts and text rendering assets ship with
the site, including those embedded in exported PNGs.

## Composing

Any object can hold others. Dragging an object onto a larger one, or placing one inside it, adds it,
and dragging it out releases it. Moving an object moves what it holds, and resizing leaves them alone.

A frame is a titled container from the stencil rail, and the Screens stencils are frames at common
device sizes, which the property panel can change. Select several objects to align or distribute
them, and guides appear while dragging.

## Topics and depth

Any object can be a topic, including a screen, a frame of notes or a line.

- Tab grows a branch from the selection, and Alt Enter adds a sibling. Both also work while typing, so
  a tree can be written from the keyboard.
- Moving a topic moves its branches. Hold Alt to move it alone. Tidy Branches lays out its tree.
- Select two objects and choose Add Reference to link them without a line. A topic shows `↗` and a
  count, and the property panel lists references to follow. The Reference Lines button beside the zoom
  controls draws them.
- Z zooms into the selection and Shift Z zooms back out. Anything placed while zoomed in lands inside
  what it is placed on, at that scale. Objects too small to see are not drawn, and a label shows `⊕`
  when it holds hidden detail.

A group ties a selection together with a frame that fits its members. Select several objects and
choose Group in the property panel, or press Ctrl/Command G. Ungroup dissolves a group.

## Accounts and saved workspaces

Rooms need no account. "Sign in or create an account" in the account panel opens Ahara's sign-in page,
which also creates accounts; a new one is activated from the email it is sent. The account
starts named after your email, and the name you choose in the panel replaces the one you would otherwise
type into rooms. The cloud button in the header saves the room to your account and keeps it saved,
merging with anything saved from another device. Saved workspaces open from the account menu on any
device, with nobody else online.

A saved password room is listed as "Password room" and asks for the room's password when opened.
Resetting your account password keeps every saved workspace.

## Agents

The account panel's Connect Claude or ChatGPT section gives the server address. In claude.ai or
ChatGPT, add a custom connector with that address and leave its OAuth settings empty, sign in with your
Ahara account and allow access when asked, then give the assistant a room's link. Someone must have the
room open. The agent appears in the room under its own name, its changes merge like
anyone's, and its comments are signed with that name. Password rooms and rooms on this device stay
closed to agents.

Agents can use named styles, subtitles, cards, bands and slides, so an agent can write a whole deck in
one call. Named styles show in the property panel's Style list, where anyone can apply one, and a
subtitle field appears for nodes, cards and bands.

## Password rooms

"Create a password room" on the welcome screen asks for a password, and everyone joining by link needs
it. Everything in the room is encrypted in the browser: the document, presence, pictures and the copy on
this device. Nothing can recover a forgotten password, so the room would be lost. The key button in the
header changes it; people already in the room stay in, and anyone joining later needs the new one.

Someone joining from a new device needs another person in the room to be online, because they hold what
the password opens.

## Pictures

Paste a picture to place it at the pointer, or drop an image file on the canvas. Pictures keep their
proportions when resized. While collaboration is off, a picture stays on this device and uploads when
it returns. In a device-only room, pictures never leave the browser. Exported files carry their pictures.

## Slides and presenting

A slide is a fixed-size viewport over the canvas. Click the Slide stencil, then the canvas, to place
one behind everything there; it joins the deck of the selected slide, or the deck you last added to,
with the next number, and takes that deck's size. Drag and resize it over whatever it should show;
resizing keeps its proportions, and the property panel's Slide section sets its deck, number and
size, Wide 16:9 or Standard 4:3. Its label shows the deck and number before its name. Objects placed
or dropped on a slide move with it, and deleting a slide deletes them, as with any object that holds
others.

A deck's template is its slide number 0, set with the Template box in the Slide section. Whatever
the template holds, a company name at the bottom right or a header bar, is drawn under every other
slide of the deck at the same place within it: dimmed while editing, plain while presenting. Those
copies cannot be selected or moved; clicking one selects the slide beneath, and editing the template
changes every slide. A template with slides of another size scales to fit them.

The Slides list in the left rail shows each deck's slides in number order; click one to fly to it.
Present, on a deck in the rail or in a slide's property panel, shows the canvas alone with the slide
filling the window and everything outside it dark. Left and right arrows, Page Up and Page Down, and
the bar's buttons move through the deck, skipping the template, the bar counts your place, Notes
shows the slide's comments beside it, Full screen fills the screen, and Escape returns to the editor.
Changes others make appear while you present.

## Comments

Select an object or line to comment on it in the property panel, reply, resolve or delete. A line's
comments sit on the line itself. Enter sends a comment and Shift Enter starts a new line, so a
slide's speaker notes can run to pages. Everyone in the room sees comments, signed with the display
name at the time. A label shows `💬` and a count of open threads. Comments stay out of undo, and
return with their object if its deletion is undone.

## Icons

Search the stencil rail for shapes and icons, or browse its sets, including AWS, Azure and Google Cloud.
Icons place, connect, resize and label like other objects. Vendor icons keep their colors and
proportions and cannot rotate, as their terms ask.

## Connecting

Connect objects in any of three ways:

- Choose the connector tool and click two objects.
- Hover an object to see its connection points, then drag from a point to a point on another object.
  Dropping on an object's body leaves that end free to follow its outline.
- Select two objects and choose Connect.

A line's property panel sets its type, cornered, diagonal or curved, and the arrows at its start and
end. Route around items places the line's points so it goes around everything between its ends;
afterwards drag its segments or points like any line's, and route it again after moving things.

A frame an agent arranged as a row, column or grid stays arranged: drag an item to a new place in it
to reorder, and adding or removing items closes up the arrangement.

## Shortcuts

| Keys                                  | Action                                   |
| ------------------------------------- | ---------------------------------------- |
| V                                     | Select                                   |
| H, or hold Space                      | Pan                                      |
| Scroll                                | Zoom around the pointer                  |
| N, R, D, P                            | Note, rectangle, decision, draw          |
| Delete                                | Remove the selection                     |
| Ctrl/Command Z, with Shift to redo    | Undo and redo your own work              |
| Ctrl/Command D                        | Duplicate                                |
| Ctrl/Command A                        | Select all                               |
| Ctrl/Command G, with Shift to ungroup | Group and ungroup                        |
| ] and [                               | Bring to front and send to back          |
| Enter                                 | Edit the selection's text                |
| Tab, Alt Enter                        | Add a branch, add a sibling              |
| Z, with Shift to go back              | Zoom into the selection                  |
| Left, Right, Page Up, Page Down       | Previous and next slide while presenting |
| Escape                                | Finish editing, or leave a presentation  |

## Rooms and sharing

Share Room provides the link. Visitors arriving by link are asked for a display name once, and the
participant badge changes it. Peers' cursors appear on the canvas, with a dashed outline around
anything they are dragging or resizing. The status bar shows whether the room is looking for
participants, receiving the canvas, in sync or alone on this device.

## Views and files

Saved views at the bottom of the left rail store a place and zoom. Save the current place with the
plus button, click a view to fly there, and hover it to rename or remove it. Views are shared with the
room and do not move other participants. Export downloads a
portable `.arconis` document, and Import adds its contents to the current room.

A document is the canvas written in the Arconis canvas language, so a person or an agent can read or
write one by hand. The language reference is in `frontend/src/language/reference.ts`.

Export PNG downloads a picture of the selection, or of the whole canvas when nothing is selected. The
file carries a copy of those objects, so Import loads it like a document, in any room.

## Grid

The grid button beside the zoom controls shows or hides the grid, and objects snap to it only while it
shows. The setting belongs to each person and stays with their browser.

## Rooms on this device

"Work on this device only" on the welcome screen creates a room that never connects to the relay.
Nothing in it leaves the browser, and it has no link to share.
