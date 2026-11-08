# Working with assistants through MCP

An assistant joins an ordinary room as another participant. It reads and writes the same canvas
language used by files and browser edits, including diagrams, topic trees, Markdown, slides,
editable Drawings, markup and comments.

## Connect an assistant

1. Sign in to Arconis and open the account panel.
2. Under **Connect Claude or ChatGPT**, copy **Server address**.
3. Add a custom remote MCP connector in your assistant client using that address. Leave manual
   OAuth settings empty; follow Ahara's sign-in and consent prompts.
4. Keep an ordinary Arconis room open in a browser and give the assistant its room link or code.

For the deployed application, the server is `https://relay.arconis.ahara.io/mcp`. The account
panel supplies the configured address for the environment you are using.

Password rooms and device-only rooms are outside assistant access. Someone must keep an ordinary
room open for edits to be retained. Accounts and saved copies do not give an assistant unattended
access to rooms with nobody online.

## Ask for an outcome

For example:

> Open this room. Read the existing service diagram, then add a payments component beside the
> orders service, connect it to the database, and add a markup arrow where the dependency needs
> review. Reuse the existing named styles.

The assistant can build a whole section in one write. It appears under its own name; its edits
and comments are shared with the people in the room. People can continue editing alongside it.

The same connector supports inspection and editing. To change the room, the assistant must call
`write`; returning a plan or canvas-language example in chat does not place that content.

## Tool workflow

| Tool              | Use                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- |
| `open_room`       | Join by room link or code; return `session_id` and a canvas orientation.                 |
| `describe_canvas` | Discover ids, the outline, styles, discussions and decks.                               |
| `read`            | Read actual items, a holder's contents or an area before editing.                       |
| `canvas_help`     | Discover language topics; retrieve a complete topic or `all`. Available before joining. |
| `list_stencils`   | Discover shapes, icon sets and matching icon keys.                                      |
| `write`           | Apply canvas-language statements atomically.                                            |
| `undo`            | Revert the assistant session's own most recent write.                                   |
| `close_room`      | Release the session's room peer and edit history when finished.                         |

Save the `session_id` returned by `open_room` and pass it to `describe_canvas`, `read`, `write`,
`undo` and `close_room`. The result includes `{ "session_id": "…", "canvas": "…" }` in both
structured content and text. For example, call `read` with `{ "session_id": "…" }`, then
`write` with `{ "session_id": "…", "statements": "node api \"API\" at 100,100" }`.
An optional `name` on `open_room` sets the assistant's participant name.

Each open creates an independent session with its own read and undo history, bound to the signed-in
user and OAuth client. Reuse its handle after reconnecting or reinitializing MCP. Individual HTTP
requests do not require `initialize` or `Mcp-Session-Id`; that header does not select a room.
`canvas_help` and `list_stencils` need no session.

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
sketch sketch1 "Retry sketch" at 500,40 size 260,180 {
  drawing path1 ink rectangle points 520,60 720,60 720,180 520,180 520,60 closed fill #ffeeaa
}
```

`ink` names a geometry convention; explicit `points` supply the path. Drawing contents use
world coordinates, including inside a `sketch`. Moving, resizing or rotating an existing sketch
through `edit` carries its contents and gradient direction with it. Imported file declarations
retain the supplied points exactly.

Markup and Drawing contents cannot be connector endpoints. To convert a connected workspace
path, remove its connectors in the same write before changing it to markup or placing it inside
a Drawing. An invalid conversion rejects the entire write.

## Handle changes and errors

Room operations report changes made by others since the assistant's preceding room call.
If an item the assistant read has since changed, a stale edit is refused and returns its current
source. Read that state, reconsider the change, then retry. A syntax or validation refusal also
leaves the canvas unchanged; it is not a partial successful write.

| Response                                   | Recovery                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Unknown id                                 | Discover ids with `describe_canvas`, then read the actual item.                                |
| Language or stale-edit refusal             | Read the explanation/current source, correct the write and retry.                              |
| Missing `session_id`                        | Call `open_room` and pass its returned `session_id` to room operations.                         |
| Nobody holding the room                    | Open an ordinary room in a browser and keep it connected.                                      |
| Unknown or expired room session             | Call `open_room` again and use the new `session_id`.                                            |
| Unexpected failure with an error reference | Keep the reference for the operator; read before retrying an edit whose outcome is unverified. |

An unexpected server fault does not establish whether an edit committed. Avoid assuming it is
safe to repeat the same creation statement. [Deployment operations](deployment.md#operating-the-relay)
explains how an operator uses the error reference.
