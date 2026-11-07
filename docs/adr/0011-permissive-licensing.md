# 0011 — Permissive licensing and original interactions

- Status: Accepted
- Date: 2026-11-06

## Context

The product must carry no licensing encumbrances. InfiniPaint inspires its freehand drawing, cursor-centered zoom,
space-to-pan, selection transforms and named viewports, but InfiniPaint's source is GPL.

## Decision

Arconis is MIT licensed and adopts permissively licensed dependencies such as MIT and Apache 2.0. InfiniPaint-inspired
interactions are implemented independently, with none of its source or assets.

## Alternatives considered

- **Reusing InfiniPaint's GPL code** — saves implementation work, but would bring copyleft obligations to the whole product.
- **A commercial diagram editor** — offers more out of the box, but requires a license or subscription, which the product
  rejects. maxGraph (Apache 2.0) covers the need.

## Consequences

The product stays freely usable and modifiable, and every interaction inspired by InfiniPaint must be written here. New
dependencies need a license check, and the build publishes dependency licenses at `/licenses.txt`.
