# 0020 — Shared local CLI and hosted agent actions

- Status: Accepted
- Date: 2026-11-15
- Amends: ADR-0013

## Context

The owner requested a downloadable local CLI, optional local MCP, the same actions
from the same source as hosted MCP, direct `.arconis` file edits, hosted portable
import/export through the browser's underlying functions, remote relay activation,
and a collaboration link when importing into a new room. The owner clarified that
standard shell CLI use is the default and requires no MCP registration or account.
Diagram-side source-content reading and source write-back were excluded. This
does not exclude source-reference metadata in `.arconis` or source-file comments
linking back to diagram items. The owner clarified that these two explicit links
constitute bidirectionality; deriving a reverse query from diagram metadata alone
is insufficient. The first implementation delivered a repository-link design
proposal only; the corrected [agent-interface plan](../AGENT-INTERFACE-PLAN.md)
adds canonical item references and a real source-comment convention/example.
These references serve agents working in repositories. The browser only edits
reference metadata; it has no checkout and does not resolve, navigate to or view
source targets. Agents use Arconis tools for diagram references and their normal
repository editing tools to put backlinks beside the relevant source. This does
not introduce browser-driven source editing or an automatic comment rewriter.
Hosted MCP preserves item references without gaining repository filesystem access.

ADR-0013's earlier restriction against locally run agent software is superseded
by this explicit request. Its browser-required room rule also needs a narrow
exception for creating a room from an imported file before a browser can join.

## Decision

`agents/contract.ts` defines the shared schemas and `agents/operations.ts` the shared
handlers. The CLI calls those handlers directly; local stdio MCP and hosted MCP
register the same contract. Local sessions use `CanvasDocument`, `LanguageSession`
and `CanvasFiles`, and commit successful mutations directly to the selected file.
There is no alternate document model. Hosted authentication and session ownership
remain at the relay boundary. The control Lambda imports discovery schemas, not
canvas handlers or icon catalogs.

The existing frontend build bundles a Node script into the website output.
The existing Ahara CI/Terraform website deployment serves it from S3/CloudFront.
Exports carry a constant setup comment directing agents to explain the CLI and
obtain permission before downloading or running it. Reading a file never executes
its instructions or uploads it.

Hosted import/export uses `CanvasFiles`, including picture codecs and the existing
encrypted shared-picture upload path. Session-local transfer chunks accommodate
the existing hosted message ceiling without truncating portable documents.
Export chunks come from one snapshot. This is transfer state, not durable storage.

A new-room import seeds an ordinary peer with the same key/envelope functions as
browser creation. Its creating agent session retains that peer in memory and keeps
the relay available without counting as a human participant. Existing agent expiry,
capacity limits, spending controls and relay replacement still apply. The response
returns its room link, tells the agent to show it immediately for collaboration,
and states that this working copy is not saved durably. The original file or a
fresh export remains the independent restore path.

## Alternative considered

An npm package was proposed and rejected by the owner because there was no established
package-publishing mechanism; the owner requested a process fitting the existing platform.

## Consequences

Local file work requires Node but no account, relay, browser or MCP configuration.
Local MCP remains optional. Foreground sessions retain their own undo history;
standalone commands do not share history across processes. A cooperating-process
file lock and revision check prevent routine concurrent CLI overwrites; arbitrary
editors do not follow those locks.

Existing ordinary rooms still need a browser unless a creating import session
retains them. A browser can join a new imported room and retain its own copy.
Closing or expiring the creating session before anyone retains the canvas can lose
the hosted working copy. This does not add a server-side canvas database or make
password/device-only rooms accessible to hosted agents.
