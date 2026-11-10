# Arconis

A shared browser workspace for diagrams, sticky notes, editable drawings and presentations.
Rooms work for guests; optional accounts keep saved workspaces across devices.

Application: <https://arconis.ahara.io> · [Start using Arconis](docs/getting-started.md)

## Quickstart

Use the Node version in `frontend/.node-version` and the pnpm version in
`frontend/package.json`:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the same room in a second tab to collaborate locally. Before committing, run `make ci`.
[Development](docs/development.md) covers configuration, tests and tooling.

## Architecture

React and TypeScript render the interface, maxGraph edits and draws the canvas, and Yjs holds
the shared document. Browsers exchange updates through an on-demand relay; IndexedDB retains
each device's copy. The canvas language is shared by documents, files and MCP assistants.
[Architecture](docs/architecture.md) describes the ownership and data flow.

## Deployment

Pushing to `main` runs the shared Ahara CI workflow and deploys after its checks pass.
[Deployment](docs/deployment.md) covers configuration and relay operations.

## Documentation

| Topic                                             | Link                                       |
| ------------------------------------------------- | ------------------------------------------ |
| First room and diagram                            | [Getting started](docs/getting-started.md) |
| Canvas editing and shortcuts                      | [Using the canvas](docs/editing.md)        |
| Drawing tools and markup                          | [Drawing and markup](docs/drawing.md)      |
| Markdown, code and equations                      | [Text and formatting](docs/text.md)        |
| Decks, templates and presenting                   | [Slides](docs/slides.md)                   |
| Room links, passwords and offline work            | [Collaboration](docs/collaboration.md)     |
| Accounts, reusable layouts and saved history      | [Accounts](docs/accounts.md)               |
| Documents, PNGs and pictures                      | [Files](docs/files.md)                     |
| Assistant connections and MCP                     | [Agents](docs/agents.md)                   |
| Product, architecture, development and operations | [Documentation index](docs/README.md)      |
| Architecture decisions                            | [ADRs](docs/adr/README.md)                 |
| Future work                                       | [Backlog](docs/backlog.md)                 |
| Changes                                           | [Changelog](CHANGELOG.md)                  |
| Coding-agent rules                                | [Agent guide](AGENTS.md)                   |

## License

MIT; see [LICENSE](LICENSE). The deployed site lists dependency licenses at `/licenses.txt`.
AWS, Azure and Google Cloud icons have [their own terms](frontend/public/third-party-icons.txt).
