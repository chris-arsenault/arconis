# 0008 — Vendor architecture icons

- Status: Accepted
- Date: 2026-11-07

## Context

People drawing architecture diagrams expect AWS, Azure and Google Cloud icons. AWS allows customers to use its icons
to create architecture diagrams and does not address redistribution. Microsoft allows copying, distributing and displaying
its icons only for architectural diagrams, training materials or documentation, and asks that they not be cropped,
flipped, rotated or distorted. These terms sit outside the permissive licensing in ADR-0007, and whether they cover a
palette inside a product is unclear. The owner accepted that gray area.

## Decision

Arconis ships each vendor's official icons, self-hosted in lazily loaded chunks, as an exception to ADR-0007. They are not
under the MIT license, and `third-party-icons.txt` states their terms. Vendor icons keep their colors and proportions, cannot
rotate, and scale evenly.

## Alternatives considered

- **Loading the icons from a public CDN** — raised by the owner. It keeps the files out of the repository, but the vendors' terms
  still apply, and it conflicts with the brief's AWS-only hosting and breaks offline use.
- **Not bundling them, and relying on pasted pictures** — no redistribution by Arconis, but people would source each icon themselves.

## Consequences

Each set loads only when someone opens it, searches, or views a room that uses it. New vendor releases need
`scripts/import-vendor-icons.mjs`. A vendor changing its terms or objecting would mean removing that set; rooms using it would show
placeholders.
