/**
 * The canvas language as agents learn it through canvas_help. Keep it exact with the parser and
 * writer; the topic index below derives from this same reference.
 */
export const LANGUAGE_REFERENCE = `# The Arconis canvas language

A canvas is a list of statements, one per line (or separated by ;). Braces hold what an item contains. // starts a comment. Text goes in "double quotes". Colors are #rrggbb. Coordinates are canvas units, x to the right and y downward; a box's x,y is its top-left corner.

## Markdown text

An item's name is Markdown source: headings, nested bullets and numbering, quotes, emphasis, strike, links, inline code and language-labelled code fences. Math uses $...$, $$...$$ or a fenced math block. The exact inline tags <u>, <sub>, <sup> and <mark> are supported, without attributes; other HTML is displayed as text. Images belong to canvas picture items, not embedded text images.

For multiline names, use three or more double quotes followed by a newline, literal content, then a newline and the same quotes. The two framing newlines are not content. Backslashes, code fences, braces and comment markers inside are literal. Use more quotes if the content contains a closing delimiter. Ordinary quoted strings still accept escaped newlines, tabs, quotes and backslashes. Read/file output uses raw strings for multiline content, so agents can work with Markdown directly.

Text styling applies to the whole box and stays separate from Markdown. Copy Markdown returns the source; native files retain source and box styles.

## Items

  <type> [id] ["name"] [/ "subtitle"] [attributes...] [{ items inside }]

Types:
- node: a shape in a diagram or a topic in a mind map. Bare word for its stencil: rectangle (default), ellipse, decision, service, database, cloud, person. With icon <key> it is an icon, its name and subtitle drawn under it.
- card: a wide box with an icon on the left and its name and subtitle beside it.
- frame: a container with a title. group: a light dashed container.
- band: a highlight behind items, spanning across frames: band <id> "name" / "subtitle" over a, b, c. It is sized to cover them once everything is placed.
- text: free text. note: a sticky note. picture: an image people added (agents do not add pictures).
Ids are short words (letters, digits, _ and -) you choose, unique on the canvas; they are how you and lines refer to items. Leave one out and the canvas makes one up. For an id that is also an attribute word (ink, target, markup, workspace, locked, hidden, collapsed, numbered, tags, marker, task, link, property or edited), follow the id with a quoted name, which may be empty; canonical files do this automatically.
The name and subtitle are both optional: node r2 / "Amazon Aurora" has only a subtitle. Write \\n in text for a line break.

Example:
  node api "Orders API" / "Amazon API Gateway" icon aws:Amazon-API-Gateway
  node db "Orders" database below api gap 60

## Placement

Every relation names an item already placed (earlier in your text, or on the canvas):
- below X, above X, left of X, right of X, each with optional gap N (default 40). The gap is measured between items including the labels drawn under icons; the other axis is centered on X. A frame or group with a block lines up with X's left or top edge instead of centering.
- top with X, middle with X, bottom with X, left with X, center with X, right with X: align one edge or center with X. Alignment uses the boxes themselves, so icons line up whatever their labels.
- width of X, height of X: take X's size.
- at x,y: exact position. size w,h, width N, height N: exact size.
- nudge dx,dy: shift after placing. by dx,dy: move an existing item relative to where it is.
- in X: put the item inside X.
Later rules win on the same axis: "below a, left with b" takes y from a and x from b. An axis no rule sets takes the default spot.
The default spot: after the previous item in the same block (to its right, tops aligned); for the first item in a holder, inside it below what it already holds; at top level, to the right of everything on the canvas.

A frame or group is placed by its own line first, then its block's contents are placed inside it, and it fits itself around them. A new frame wraps its contents snugly on any side you did not size; size, width or width of keep that side at least as large. Give a frame both axes (for example below r1, left with r1) when it should not sit at the default spot.
Placement is worked out once, in order. Changing an item later does not move items placed beside it, so write items in the order they depend on each other.

## Arrangements

  row [id] [top|middle|bottom] [gap N] { items }      column [id] [left|center|right] [gap N] { ... }      grid N [gap N] { ... }

An arrangement lays out the items in its block side by side, one above another, or in N columns. Without a frame it draws nothing and is applied once; its id names the block's span for later placement (right of myrow).
A frame or group can keep its contents arranged: frame f "Layer" row gap 30 { ... }. It stays arranged as anyone edits: a new member joins at the end, a removed one leaves no gap, a member moved elsewhere takes the slot there, and the frame sizes itself to its members. To reorder, move a member (edit a at x,y); to stop arranging, edit f free.

## Lines

  a -> b              line with an arrow
  a -- b              line without one
  a => b              branch: b is a topic under a in a mind map
  a ..> b             reference: a dashed pointer that implies no structure
  a <-> b             line with an arrow at each end
  a.right -> b.left   attach at a side: top, bottom, left, right, top-left, top-right, bottom-left, bottom-right, or .(fx,fy) as fractions of the box
  a -> b "label"      a label on the line
  a -> b -> c         a chain
  a -> b "x", c "y"   a fan-out from a
  a -> b as w1        the line's id, to change it later
Attributes after the ends apply to every line in the statement: a style, look properties, path cornered|diagonal|curved (the line's type; cornered by default), arrow arrow|open|none, start-arrow arrow|open|none, via x,y x,y (points the line passes through), label-at x,y, and vertical to run the label from bottom to top.
around places a line's points so it goes around the items and labels between its ends: a -> b around. It is placement, worked out once like below or right of; afterwards the line is an ordinary line whose points anyone can move. Use it for lines through busy areas, and write it again after moving things to route afresh.
shared after a fan-out runs one trunk from the start to a junction, a small dot, and splits there: api -> bus "Async", logic "Sync" shared. A junction is a node with stencil junction, and you can declare and join one yourself.
Any item can be a line's end, including a frame or a band.

An end can be declared in place, which builds chains in one statement:
  users -> node cdn "CDN" icon aws:Amazon-CloudFront -> node edge "Edge" service
A new item at a line's far end with no placement goes to the right of the start, or for =>, under its parent as a branch.

## Look

fill <color|none>, line <color|none>, line-width N, dashed, opacity N (0-100), text-color <color>, text-size N, font sans|serif|mono, bold, italic, underline, strike, align left|center|right, valign top|middle|bottom, text-highlight <color|none>, line-height N (positive multiplier), paragraph-gap N (non-negative em), padding N (non-negative canvas units), text-fit fixed|height (free text may grow vertically), vertical, rotate N, icon-color <color>, badge <icon key> (frames: an icon in the corner), title header|top|side (frames: a header bar, plain text at the top left, or vertical down the side). Text size must be positive. Flags take off to turn off (bold off); value properties take default to return to the type's default (fill default).

Named styles are declared once and used by name. A style's name must not be a stencil's name (rectangle, ellipse, decision, service, database, cloud, person):
  style region line #00a1c9 dashed title top badge lucide:Flag text-color #00a1c9
  frame r1 "us-east-1" region { ... }
An item's own look applies over its style. Restating a style replaces it everywhere it is used.

## Flags, tags, tasks and links

Any item or line takes these among its attributes, whatever its type; canonical output prints them after what the item is and before its look:
- locked: pointer edits in the browser leave it alone until someone unlocks it; agents may still change it. locked off unlocks.
- hidden: not drawn, not routed around, not in exported pictures and not counted by layout; its holder, what it holds and its lines stay in the canvas. hidden off shows it again.
- collapsed: an item that holds or heads others shows without them; a frame shrinks to its title bar, a topic keeps its node, and a count badge says how many are folded away. Shared with everyone. collapsed off expands.
- numbered: a topic's branches show tiered numbers, 1, 1.1, 1.2, in the order they sit, so a person or an agent can say "change 2.3". numbered off removes them.
- tags a, b, c: free categorical words of letters, digits, _ and -. Restating tags replaces the list; tags none clears it.
- marker p1|p2|p3|p4|p5|q0|q1|q2|q3|q4: a small badge, priority 1 (highest) to 5 or progress in quarters 0 to 4; marker none removes it.
- task open|done: a checkbox in the label; a holder or topic over tasks shows how many are done. task none removes it.
- link "https://…" or link <id>: a web address, or an item, slide or saved view to fly to; link none removes it.
- property <name> "value": a named value the item carries, such as property owner "Ada" or property ticket "ARC-12"; write several. People see them on hover, and {name} in a label shows the value there. property <name> none removes one.
- edited "name" at <milliseconds>: who last changed the item and when. The canvas sets it on every edit by a person or an agent; files carry it.

## Changing what exists

- Restate an item by its id to change it: node api "Orders API v2" fill #fff7d6. Only what you write changes.
- edit <id> <attributes> does the same without naming the type.
- An existing id named alone inside a block moves that item into the block: frame r2 { api }
- Restate a line by its id: a -> c as w1 "new label"
- delete a, b removes items with everything they hold and their lines.
- tidy <id> lays out a mind map's topics under the given topic, each branch on the side it already lies. tidy <id> right, left or down puts every branch on that side or beneath; compact tightens the gaps; sorted orders branches by name: tidy root down sorted.
- title "Canvas name" renames the canvas.

## Drawings and markup

Use drawing for an editable world-coordinate path, sketch for a boxed Drawing object, and highlight for an outline attached to a workspace object:

  drawing mark markup ink arrow points 10,20 180,90 line #e64980 line-width 4 arrow arrow
  highlight attention target api line #ffcc00 line-width 4
  sketch diagram "Sketch" at 200,100 size 400,300 {
    drawing box ink rectangle points 220,120 360,120 360,220 220,220 220,120 closed fill #ffeeaa
  }

markup places a drawing above the workspace; workspace makes it ordinary content. Existing drawings without markup remain ordinary content. A sketch holds editable drawing paths; its contents use the same world coordinates as every other item, and in <id> changes their holder (in none returns to the canvas). To promote marks, declare a sketch and move the marks into its block with workspace; to return them, use edit <id> markup in none. Highlights always belong to markup, follow target movement/size/rotation, and disappear with their target. They change no target style.

ink freehand|line|arrow|double-arrow|rectangle|ellipse|polygon|bracket|brace|cloud names a drawing's geometry convention. points explicitly supplies its path, including shape paths; ink alone does not generate points. closed closes a path for filling; closed off opens it. arrow and start-arrow control arrowheads. stroke-opacity N (0-100) controls ink transparency independently of fill opacity; highlighter strokes use a broad line-width and stroke-opacity around 30. gradient <color|none> sets the second fill color, gradient-angle N sets its clockwise direction in degrees. Gradient and solid fills require a closed drawing path. All new look terms also work in named styles and support default clearing.

Markup is shared, saved and undoable, with no expiration. Visibility and the currently edited Drawing are personal editor state, not shared language fields. Drawing edits use the existing atomic write and agent-local undo. A saved file and MCP read return these exact records.

Editing an existing sketch's size or rotation transforms its contents with it; file declarations keep their points exactly as written. Markup and paths held by a sketch cannot be connector endpoints. Remove their connectors in the same write before converting connected paths; an invalid conversion rejects the whole write without changing the canvas.

## Slides

  slide [id] ["name"] deck <deck> [N] [placement] [{ items }]

A slide is a fixed-size viewport over the canvas, 1280 by 720 unless sized, that presents what lies within it. Its block places items inside it, and it keeps its size. A deck is the name its slides share, written bare or in quotes, and N is the slide's number in that deck; without a number a slide takes the next, and without a deck it joins the deck named deck. People present a deck in number order, so renumber with edit s3 deck pitch 2. Comments on a slide are its speaker notes. A slide numbered 0 is the deck's template: what it holds is drawn under every other slide of the deck, at the same place within each, and a presentation skips it. slide t deck pitch 0 { text "Acme" at 1100,680 size 160,30 } puts the company name at the bottom right of every slide in pitch.

## Discussions and views

  comment on <id> "text"          start a discussion on an item
  reply <discussion id> "text"    reply to one
  resolve <discussion id>         resolve one; reopen <discussion id> reopens it
  view <id> "name" center x,y zoom N     save a view (zoom 1 is 100%)

## Reading

What you read is written in this same language: a file is the whole canvas in it. Read output may add // notes such as which items overlap.

## Example: a section of an architecture

  style region line #00a1c9 dashed title top text-color #00a1c9
  style layer line #d5dbdb fill none title side
  frame r1 "Region" region {
    node s3 "Ingestion" / "Amazon S3" icon aws:Amazon-Simple-Storage-Service
    node kinesis "CDC Event Stream" / "Amazon Kinesis" icon aws:Amazon-Kinesis below s3 gap 60
    frame logic "Logic Layer" layer row gap 50 right of s3 gap 200 {
      node fn "Serverless" / "AWS Lambda" icon aws:AWS-Lambda
      node ecs "Containers" / "AWS Fargate" icon aws:AWS-Fargate
    }
  }
  kinesis.right -> s3.bottom
  s3 -> logic "Async Write"
`;

const [basics, ...sections] = LANGUAGE_REFERENCE.split(/^## /m);
const topics = [
  { topic: "basics", title: "Basics", content: basics.trimEnd() },
  ...sections.map((section) => {
    const title = section.slice(0, section.indexOf("\n"));
    const topic = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { topic, title, content: `## ${section.trimEnd()}` };
  }),
];

/** Focused source content, or its discovery index; nothing is silently truncated. */
export function languageHelp(topic?: string) {
  if (!topic)
    return [
      "The Arconis canvas language. Call canvas_help with a topic below, or all for the complete reference.",
      ...topics.map((entry) => `${entry.topic}: ${entry.title}`),
      "Start with basics, items, placement and changing-what-exists for ordinary diagram edits.",
    ].join("\n");
  if (topic === "all") return LANGUAGE_REFERENCE;
  return topics.find((entry) => entry.topic === topic)?.content ?? null;
}
