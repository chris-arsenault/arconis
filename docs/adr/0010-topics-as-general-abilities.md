# 0010 — Layout and mind maps are abilities of any object

- Status: Accepted
- Date: 2026-11-07

## Context

The owner defined layout by composability and a mind map by topics that extend outward, refer to each other and can be zoomed into. Both are general-purpose concepts in one seamless
product: a topic can be a screen, a group of stickies or an architecture diagram, and a line in a diagram can be a topic.

## Decision

There are no modes and no topic object. Any object can hold children, branch outward, refer to another object and carry detail at a smaller scale. Branches and references are connectors marked
in their style, so each link is its own record. A line takes part through a small anchor object kept at its midpoint. Objects below a size threshold on screen are not drawn, which turns literal zoom into
depth.

## Alternatives considered

From the working plan:

- **A Diagram and Layout switch selecting stencils and defaults** — proposed, then dropped, because the concepts must combine freely.
- **Automatic-only mind map layout, derived rather than stored** — proposed and rejected by the owner, who wants people to be able to decide positions.

## Consequences

Dropping any object onto a larger one nests it, including in diagrams. Every object in a tree or holding detail is ordinary, so existing styling, export, undo and sync apply to it. Anchor positions are
written by whoever moves a line, so concurrent moves resolve by last write and the next move corrects them. Culled objects cannot be clicked, and an object's label marks when it holds hidden detail.
