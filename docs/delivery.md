# Arconis Delivery

Open [Arconis Delivery](https://arconis.ahara.io/#delivery) and sign in to
explore your projects. Draw opens from the ordinary Arconis home page.
The Delivery board shows the work tree, the current handoff, inherited
guidance, results, and review history. Follow links to inspect a design section,
dataset row, Draw object, or screenshot. Agents author through the CLI and
hosted MCP.

## Start at a terminal

Download the [Arconis CLI](https://arconis.ahara.io/#cli) and use Node.js 24 or
later. The examples call the download `arconis`.

```sh
arconis delivery init "City design"
arconis delivery work add "District morphology" --outcome "Legible neighborhoods"
arconis delivery entry add boundary "Preserve the settled outline" --attribution user_requirement
arconis delivery focus "District morphology"
arconis delivery current
arconis delivery work status "District morphology" in_progress --note "Reviewing the catalog"
arconis delivery review
```

Use `--project DIR` to select a local copy. Use `--context NAME` or
`ARCONIS_DELIVERY_CONTEXT` when multiple agents need independent focus in the same
directory. A focus change selects work for that context. It has no effect on
progress. Use `work list` to discover titles or displayed numbers. A status
change or progress note is recorded in history. Completion is explicit.

Add existing design, dataset, and Draw files with `delivery file add PATH --kind KIND`.
Kinds are `design`, `dataset`, `diagram`, and `artifact`. Design documents are
Markdown and their project metadata carries title, kind, and tags. Use
`file read PATH --section "Heading"` for a targeted read. Put `{#anchor}` after
a heading to keep section links valid across heading-title edits. Datasets can
be defined and changed by typed fields and keys. `delivery --help` has commands
for those operations.

Register the existing `README.md` and design sources at their checkout paths.
Add optional `--tag` values where they help find a document. Search current
Markdown by title, tags, heading, and text. Results have a path, section, and
short excerpt. Use the returned path and section in `file read`.

```sh
arconis delivery file add README.md
arconis delivery file add docs/lore/magic.md --tag lore
arconis delivery file search "district coverage"
arconis delivery file search "hallowed routes" --tag lore
```

Link governing sources when you hand work off. A dataset row fragment identifies
the key values in declared order. A Draw fragment names the object in the
portable diagram file. A design fragment identifies a section. The same link
is discoverable at either end.

```sh
arconis delivery link add "work:District morphology" 'docs/districts.dataset.json#["Grand Bazaar"]' --purpose basis
arconis delivery link list docs/districts.dataset.json
arconis delivery result "District morphology" "District comparison" --attach ./comparison.png
arconis delivery feedback "District morphology" --accepted "Road layout" --remaining "Interior parks"
```

The result retains the exact attachment version. A later screenshot with the
same name can accompany another review. Use `work history` or `file history` to
inspect earlier records. Related edits can go in one `delivery batch -` call,
one ordinary command per input line.

## Share a project with a web agent

Run `arconis sync` to publish the local project or exchange changes with its
saved server link. The CLI offers a sign-in link and a short code if it needs a token. You can
complete sign-in in a browser on another device while the terminal waits.
Automation can supply an Arconis accounts API access token through
`ARCONIS_DELIVERY_TOKEN` using its usual credential manager.

To download an existing project, run
`arconis sync --project DIR SERVER_PROJECT_URL` in a new project directory.
A sync exchanges append-only work records and chooses the latest version of a
mutable document changed on both sides. A dataset is one mutable document.
Edits to separate documents can both arrive. Prior versions remain available in
the audit history. Git tracks the files you choose to check in. Keep
`.delivery-focus-*` out of commits if you use local selection.

Connect the web agent to
`https://relay.arconis.ahara.io/delivery/mcp` and sign in. Use `list_projects`
to choose a project, or `create_project` to start without a local repository.
Ask the agent to read the relevant work and guided review before editing.
Use `file_search` with a short query to find Markdown sources. Pass the result's
path as `target` and its `section` to `file_read`. Use `design_edit` to replace
the section body. A result without a section opens the whole document.
The agent can submit feedback through MCP, and the next terminal sync reads it.
Delivery's saved-file workflow is independent of a live Draw room.

Hosted section reads and edits load the selected document from S3. The project
head selects a manifest of document versions. The first search of a changed
Markdown collection builds a SQLite full-text index. Searches reuse that index
when work status or attachments change. Sync still exchanges a portable project
bundle with its document history.
