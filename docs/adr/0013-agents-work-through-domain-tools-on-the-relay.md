# 0013 — Agents work through domain tools on the relay

- Status: Accepted
- Date: 2026-11-07
- Amends: ADR-0009

## Context

The owner asked for an MCP server that works on the document with domain-native tools, following Ahara's
domain-native work surfaces practice, and for an agent-friendly file format that would follow from the same
domain model. The owner set the shape in a design session: the server is only for signed-in users and runs
on the deployed relay instance or a Lambda, never as a process users run themselves; someone must have the
room open, which also means the relay is on, but the agent has no tab; tools offer exact, relative and
relational placement, because an agent may be a room's only author; domain objects follow an item's job
rather than its stencil; and freehand drawing waits for its own design. ADR-0009 kept the relay to
forwarding frames and storing nothing.

## Decision

A domain layer (`domain/`) projects the Yjs document into items people and agents reason about: nodes,
regions, text, pictures, connections, branches, references and drawings, with discussions and views. Its
operations change the document through the document's own rules, and Yjs stays canonical. The editor's
file is that read model written out, as version 3.

The MCP endpoint is part of the relay process. A signed-in agent opens an ordinary room by its link, and
the relay adds a peer to that room in its own memory, which receives the canvas from the people there and
sends the agent's changes back as any peer's. Each agent session records the state of every item it has
been shown. An edit to an item someone else changed since then changes nothing and returns the item's
current state, and every result lists what others changed since the session's previous call. Sessions,
their peers and what they have seen live only in that instance's memory: replacing it ends them, as it
ends sockets, and agents reconnect. Cognito's own sign-in pages authorize agents through a dedicated
public client.

## Alternatives considered

- **A peer that each user runs locally.** The agent's own process joins the room. The owner rejected it,
  because it asks users to run and maintain software themselves.
- **Forwarding tool calls to the user's open tab.** The browser applies each action, which keeps password
  rooms readable only by members. The owner noted that agents work without a tab of their own, so this
  does not fit how they are used.
- **A Lambda working on stored workspaces.** Server-readable saved copies would let agents work with
  nobody present. The owner requires someone to have the room open, so nothing needs to work without
  people there, and a Lambda cannot hold the room's socket.

## Consequences

- The relay holds an ordinary room's canvas in memory while an agent works there, and drops it when the
  agent leaves or after a period unused. It still writes nothing durable.
- Password rooms and device-only rooms stay out of reach, because the relay has no key and no connection
  to them.
- Agent peers neither keep the relay running nor count as people. An agent's edits count as content,
  and edits are refused once nobody is left in the room, because nothing would keep them.
- During a rollout's brief overlap, an agent can reach the instance where nobody is, and is told so.
- Cognito publishes no OAuth server metadata and supports neither dynamic client registration nor client
  metadata documents, so the relay describes the pool's endpoints itself and clients are given the client
  id, which the account panel shows.
