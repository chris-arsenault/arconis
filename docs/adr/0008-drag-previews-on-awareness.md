# 0008 — Drag previews on awareness

- Status: Accepted
- Date: 2026-11-07

## Context

maxGraph commits a move or resize only on drop, so peers saw objects jump. Collaborators should see a drag while it
happens, and frequent drag updates must not create excessive traffic or document history.

## Decision

While a native move or resize is in progress, the editor publishes throttled world-space boxes on Yjs awareness, and
peers draw them as dashed outlines in the dragging person's color. The document changes only on drop.

## Alternatives considered

- **Writing each drag step to Yjs** — peers see the real object move, but every step adds permanent document history
  and needs undo merging, and it fights maxGraph's own gesture state, which expects to commit once.
- **No live indication** — simplest, but leaves peers unable to tell that an object is being moved.

## Consequences

Drags add no history, and a lost preview message loses nothing. Peers see an outline rather than the object, so attached
connectors update only on drop. Selection-frame transforms are the exception: they write to the document during the
gesture, with undo merged into one step, so peers see those objects move directly.
