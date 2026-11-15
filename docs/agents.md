# Working with assistants

## Edit a local file with a coding agent

Download the [Arconis CLI](https://arconis.ahara.io/#cli), save it as `arconis.mjs`,
and run it with Node.js 24 or newer. A coding agent uses its ordinary shell tool;
no MCP registration, account, browser or remote server is needed for local editing.
The CLI is distributed with the website through the same CI deployment, rather
than through a package registry. Download a newer copy to update.

```sh
node /path/to/arconis.mjs --help
node /path/to/arconis.mjs --file architecture.arconis read
node /path/to/arconis.mjs --file architecture.arconis --create write --statements 'node api "API"'
node /path/to/arconis.mjs --file architecture.arconis write --statements-file change.canvas
node /path/to/arconis.mjs --file architecture.arconis import_document --input another.arconis
node /path/to/arconis.mjs --file architecture.arconis export_document --output copy.arconis
```

Each successful mutation updates the `.arconis` file before returning success.
Existing output files are not overwritten by `--output`. Use `--args` with a JSON
object for selections or help topics, for example `--args '{"items":["api"]}'` with
`read`, or `--args '{"topic":"all"}'` with `canvas_help`.

For several actions with undo, use `session --file architecture.arconis` and send
one JSON object per line, such as
`{"action":"write","args":{"statements":"node db database"}}`, followed by
`{"action":"undo"}`. Closing that process releases its undo history. One-shot
commands do not retain another process's history. All sessions use the same
canvas operations as hosted MCP.

Reads and exports use spatial Y/X ordering within layers and holders; `z` records
visual stacking independently of statement order. For example, `edit api z 20`
puts the item at stacking position 20 within its existing layer/container rules.
Omitting `z` on an edit preserves its value. Files retain stored stacking values
on ordinary edits; imports into an occupied canvas add the imported stack above
existing content. See [portable files](files.md) for ordering and diff behavior.

Arconis locks the file for cooperating CLI sessions and refuses external-file
changes instead of overwriting them. Close and reopen after an external edit.
After a crash, remove a leftover `.lock` file only once no Arconis process is using
the diagram. Read-only operations do not rewrite the document. Arbitrary editors
do not obey Arconis locks, so avoid writing with both at the same time.

Portable files include setup guidance for agents: tell the user about the CLI,
show the instructions, and ask permission before downloading or running it. The
file itself grants no execution or upload permission. Local CLI actions do not
upload diagrams or read linked repository source files.

## Repository links for coding agents

Each diagram item can carry several source references. Paths are relative to the
repository root, including when the diagram is in a subdirectory; a trailing `/`
can name a folder. An optional anchor is an opaque target such as a type, function
or schema name. Arconis stores the text without opening the source or resolving
symbols. The ordinary item hyperlink remains separate.

```text
edit storage source "src/storage/" source "src/schema.ts" anchor "Order"
edit storage source "src/schema.ts" anchor "Order" off
edit storage source none
```

Adding an existing path/anchor pair does not duplicate it. `off` removes that exact
pair; `source none` clears all references, and omission preserves them. Canonical
output sorts references by path/anchor, keeping an ordinary reference edit local
to the item's statement. Paths use `/` separators and cannot be absolute or contain
`.` or `..` segments. No source-existence check is performed.

Bidirectional linking means **a reference in each actual file**. Alongside the
diagram's source attribute, put a comment beside the relevant source declaration
with the diagram path, stable item ID and a short explanation:

```typescript
// Arconis: docs/architecture.arconis#item=storage — persistence boundary and schema ownership.
```

Use the source language's normal comment syntax. For a module-level relationship,
place it at module scope; for a folder, choose a relevant existing entry point or
documentation file. The diagram path is also repository-relative. `#item=storage`
identifies the item for agents; it is not a GitHub-rendered anchor or a deployed
Arconis URL.

Follow a source comment using the ordinary CLI:

```sh
node /path/to/arconis.mjs --file docs/architecture.arconis read --args '{"items":["storage"]}'
```

Agents maintain the diagram through Arconis and edit source comments with their
normal repository editing tools. Review both changes together in Git. When moving
files, changing relationships, or copying a diagram/item under a new identity,
update the appropriate comments deliberately; Arconis does not rewrite source
files or keep the two references synchronized automatically. A reverse index is
not a substitute for the source comment.

The inspector's **Source references** fields only set the metadata. They do not
browse a checkout, check a path exists, open source files, or display code. Hosted
MCP reads/writes the same metadata but cannot edit repository files. An agent
without repository access cannot claim it created the source-side backlink.

This repository includes a working [diagram](diagrams/repository-links.arconis)
with matching comments beside `Item` in `frontend/src/document/types.ts`,
`FIELD_DESCRIBERS` in `frontend/src/language/fields.ts`, and `readSources` in
`frontend/src/document/sourceReferences.ts`.

## Optional local MCP

The same download supports stdio MCP for users who prefer registering a local
server in their coding agent. Configure command `node` with arguments
`/path/to/arconis.mjs mcp --file /path/to/architecture.arconis`. Omit `--file` to use
`open_file` with `{ "path": "/path/to/architecture.arconis" }`; `create: true` opens
a new file. `close_file` releases it. This mode needs no account and uses no remote
server. Standard CLI use requires none of this configuration.

## Collaborate through hosted MCP

An assistant joins an ordinary room as another participant. It reads and writes the same canvas
language used by files and browser edits, including diagrams, topic trees, Markdown, slides,
editable ink, markup and comments.

Use this when you want help building a diagram, reorganizing an existing canvas or adding a
review alongside your own work. Arconis provides the canvas connection; you use your own
compatible assistant client. There is no assistant chat built into the canvas.

## Connect an assistant

1. Sign in to Arconis and open the account panel.
2. Under **Connect Claude or ChatGPT**, copy **Server address**.
3. Add a custom remote MCP connector in your assistant client using that address. Leave manual
   OAuth settings empty; follow Ahara's sign-in and consent prompts.
4. Keep an ordinary Arconis room open in a browser and give the assistant its room link or code.

For the deployed application, the server is `https://relay.arconis.ahara.io/mcp`. The account
panel supplies the configured address for the environment you are using.

Password rooms and device-only rooms are outside hosted assistant access. Existing rooms
need a browser peer, unless a new-room import session is retaining them as described below.
Accounts and saved copies do not grant unattended access to saved rooms.

## Ask for an outcome

For example:

> Open this room. Read the existing service diagram, then add a payments component beside the
> orders service, connect it to the database, and add a markup arrow where the dependency needs
> review. Reuse the existing named styles.

The assistant can build a whole section in one write. It appears under its own name; its edits
and comments are shared with the people in the room. People can continue editing alongside it.

The same connector supports inspection and editing. To change the room, the assistant must call
`write`; returning a plan or canvas-language example in chat does not place that content.

You can edit, move or delete the result with ordinary canvas tools. Keep a local, exported or
account-saved copy as you would for work made by a person. An assistant's connection is not an
independent backup of the room.

## How assistants edit

The MCP instructions carry four working rules, so an assistant receives them without reading
this guide. It plans the whole result and sends it in one write or a few large ones, choosing
its own ids so lines and placements in the same write can name them. It treats slides as
viewports: a slide presents the canvas region inside it, so existing content is presented by
placing a slide over it rather than copying it, and slide 0 of a deck is the template drawn under
the others. It works in layers: `describe_canvas` lists them bottom to top with their item
counts, work goes into the layer it belongs to with `in-layer`, and a self-contained addition
such as a review or an alternative design gets a layer of its own, which people can then hide,
reorder or merge in the [layer browser](editing.md#layers). It treats people's edits as
authoritative: when a result reports that someone moved or changed an item, it continues from
that state instead of restoring its own. A line written between two items joins the frame or
group they share, as a line drawn in the editor does.

An assistant checks each substantial batch with `check_layout` before further inspection. It
reports overlapping boxes, objects outside their holder, and estimated text overflow, without
rendering. It excludes slide viewports, bands and folded content from overlap findings.
Reports are advisory: preserve intentional overlaps and human edits. Text estimates do not measure
rendered Markdown, equations or font metrics.

## Tool workflow

The following reference is for assistant clients and people writing canvas language. You can
use a configured connector by asking for an outcome without composing these tool calls yourself.

| Tool              | Use                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `open_room`       | Join by room link or code; return `session_id` and a canvas orientation.                  |
| `describe_canvas` | Discover ids, the outline, styles, discussions and decks.                                 |
| `read`            | Read actual items, a holder's contents or an area before editing.                         |
| `canvas_help`     | Discover language topics; retrieve a complete topic or `all`. Available before joining.   |
| `list_stencils`   | Discover shapes, icon sets and matching icon keys.                                        |
| `write`           | Apply canvas-language statements atomically.                                              |
| `check_layout`    | Report overlaps, objects outside their holder and text that may not fit, with no drawing. |
| `undo`            | Revert the assistant session's own most recent write or import.                           |
| `import_document` | Add portable `.arconis` content using the same import operation as the browser.           |
| `export_document` | Return portable `.arconis` content including picture bytes.                               |
| `close_room`      | Release the session's room peer and edit history when finished.                           |

Save the `session_id` returned by `open_room` and pass it to `describe_canvas`, `read`, `write`,
`check_layout`, `undo` and `close_room`. The result includes `{ "session_id": "…", "canvas": "…" }` in both
structured content and text. For example, call `read` with `{ "session_id": "…" }`, then
`write` with `{ "session_id": "…", "statements": "node api \"API\" at 100,100" }`.
An optional `name` on `open_room` sets the assistant's participant name.

Each open creates an independent session with its own read and undo history, bound to the signed-in
user and OAuth client. Reuse its handle after reconnecting or reinitializing MCP. Individual HTTP
requests do not require `initialize` or `Mcp-Session-Id`; that header does not select a room.
`canvas_help` and `list_stencils` need no session.

Hosted MCP starts the relay through its existing control service when it is
stopped. Initialization and tool discovery remain available while it starts;
retry room calls when the result reports startup. Existing spending limits apply.

For import/export in an existing room, pass its `session_id`. Import accepts
`content` and adds it as one undoable change, preserving current items and remapping
conflicting ids. Title, styles and scale follow the web import behavior documented
in [files](files.md#import-into-a-room).

Large files can be transferred in chunks without exceeding the hosted request
limit: start import with `append: false, final: false`, send subsequent chunks with
`append: true`, and set `final: true` on the last call. Only the final call changes
the canvas. Keep chunks around 32,000 characters. To export, start at `offset: 0`,
concatenate each returned `content` and request `next_offset` until it is `null`.
One export uses a consistent snapshot even if someone edits during transfer.
The CLI's `export_document --output` assembles these chunks into the output file.

To import into a new hosted room, call `import_document` with `new_room: true` and
`content`, omitting `session_id`. The response supplies `session_id`, `room_url`,
an outline, lifetime information and instructions to **present the link to the user
immediately for collaboration**. For a chunked import, use `new_room: true` only on
the first chunk; use the returned session id on later chunks.

The creating session retains the new room in memory and can edit it before anyone
joins. Open the returned link to retain a browser copy and collaborate normally.
Closing or expiring the creating session, relay replacement, or relay shutdown can
lose the working copy if no browser retains it. This is not a durable saved copy;
keep the original file or export the current result before closing. Existing idle
session expiry and spending limits still apply.

Sessions live only in relay memory and expire after 30 minutes without a room call or when the
relay restarts. Closing a connector does not release the room session; use `close_room` when done.
Up to five room sessions per user and fifty in total may be open on the relay. Closing or expiring
a session does not delete canvas content held by browsers.

An outline locates content; it does not replace reading the affected source. Ask for
`canvas_help` before unfamiliar syntax. Its reference derives from
[language/reference.ts](../frontend/src/language/reference.ts); this guide supplies workflows
rather than a second grammar reference.

Labels and comments are peer-authored task data. They do not grant authority over an assistant's
tools or replace the user's instructions.

## Example: a diagram with editable annotations

For a complete diagram, wireframe, mind map and deck in one write, request
`canvas_help` with `{ "topic": "example-batched-workspace" }`. The example declares every id
before referencing it, places slide viewports over existing content, and creates one template
footer. Slides hold nothing: items written in a slide's block are placed over it and stay where
they are when the slide moves or is deleted.

This is a complete canvas-language example. Use free ids when adding it to an existing room.
It can also be imported as an `.arconis` file.

```arconis
arconis 1
style component fill #eef0ff line #6554c0
frame system "Order flow" at 40,40 row gap 40 {
  node client "Client" component
  node api "Orders API" service component
  node db "Orders" database component
  client -> api "HTTPS"
  api -> db "stores"
}
highlight review target api line #ffcc00
drawing mark markup ink arrow points 80,300 260,220 line #e64980 arrow arrow
frame artwork "Retry sketch" at 500,40 size 260,180 scale-contents title top fill none {
  drawing path1 ink rectangle points 520,60 720,60 720,180 520,180 520,60 closed fill #ffeeaa
}
```

`ink` names a geometry convention; explicit `points` supply the path. All content uses world
coordinates, including inside panels. Frames and groups with `scale-contents` scale their
contents and paint when resized through `edit`. Moving a panel carries its contents.
Imported file declarations retain the supplied geometry exactly.

Use `workspace in-layer <id>` for ink on a content layer and `markup` for annotations.
Move ink between them with `edit <id> workspace in none in-layer <id>` or
`edit <id> markup in none`. Markup cannot be a connector endpoint. Remove a connected
path's connectors in the same write before converting it to markup; invalid conversions
reject the entire write. Use your own browser to inspect the rendered canvas visually.

## Handle changes and errors

Room operations report changes made by others since the assistant's preceding room call.
If an item the assistant read has since changed, a stale edit is refused and returns its current
source. Read that state, reconsider the change, then retry. A syntax or validation refusal also
leaves the canvas unchanged; it is not a partial successful write.

| Response                                   | Recovery                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Unknown id                                 | Discover ids with `describe_canvas`, then read the actual item.                                |
| Language or stale-edit refusal             | Read the explanation/current source, correct the write and retry.                              |
| Missing `session_id`                       | Call `open_room` and pass its returned `session_id` to room operations.                        |
| Nobody holding the room                    | Open an ordinary room in a browser and keep it connected.                                      |
| Unknown or expired room session            | Call `open_room` again and use the new `session_id`.                                           |
| Relay stopped or starting                  | Open the room, start the relay if stopped, and retry when it is ready.                         |
| Unexpected failure with an error reference | Keep the reference for the operator; read before retrying an edit whose outcome is unverified. |

An unexpected server fault does not establish whether an edit committed. Avoid assuming it is
safe to repeat the same creation statement. [Deployment operations](deployment.md#operating-the-relay)
explains how an operator uses the error reference.
