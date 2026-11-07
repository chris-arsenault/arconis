# Arconis

A shared visual workspace for diagrams, sticky notes and freehand ideas, in the browser with
no accounts.

Application: <https://arconis.ahara.io>

## Quickstart

Use the Node version in `frontend/.node-version` and the pnpm version in
`frontend/package.json`:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the same room in a second tab to collaborate locally. Before committing, run `make ci`.
[docs/development.md](docs/development.md) covers tests and tooling.

## Architecture

React and TypeScript render the interface, maxGraph edits and draws the canvas, and Yjs holds
the shared document. Browsers exchange Yjs updates directly through AWS AppSync Events, and
IndexedDB keeps a copy on each device. Static hosting and the Events API are the only
infrastructure. [docs/architecture.md](docs/architecture.md) has the details.

## Deployment

Pushing to `main` runs the shared Ahara CI workflow, which deploys after its checks pass.
[docs/deployment.md](docs/deployment.md) covers infrastructure and local deployment.

## Documentation

| Topic | Link |
| --- | --- |
| Using the canvas | [docs/editing.md](docs/editing.md) |
| Product scope | [docs/product.md](docs/product.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Development | [docs/development.md](docs/development.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Architecture decisions | [docs/adr/README.md](docs/adr/README.md) |
| Backlog | [docs/backlog.md](docs/backlog.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Agent guide | [AGENTS.md](AGENTS.md) |

## License

MIT; see [LICENSE](LICENSE). The deployed site lists dependency licenses at `/licenses.txt`.
