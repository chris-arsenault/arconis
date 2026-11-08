# Backlog

Planned-but-not-built work. Each item is a positive assertion of future-state behavior.

## Accounts

- Let groups share saved workspaces, when group activities are designed. A saved workspace is
  private to its account until then.
- Let an account save a section of a canvas and import it into any room, so people keep their
  own reusable layouts. Arconis ships no templates of its own.
- Send Ahara's sign-in emails from an Ahara address through SES rather than Auth0's built-in sender.

## Agents

- Let a person ask an assistant from the canvas, with one key on a selected topic sending
  "expand this" with the branch as context, the result shown as pending branches to accept or
  discard, once an assistant can be reached from the browser rather than only through MCP.
- Let agents see the rendered canvas, to judge layout as people do.
- Keep lines routed around items from crossing or overlapping one another where they can run apart.
- Let agents add pictures.
- Let connectors register through client metadata documents as well as dynamic client registration,
  once a released Auth0 Terraform provider sets dynamic registration by metadata document.

## Canvas

- Crop pictures in place, as the one geometry edit pictures need beyond resizing.
- Draw jumps where connectors cross, and let a connector carry a label at each end.
- Show equal-gap indicators among three or more objects while dragging, beside the distance
  labels the smart guides already give.
- Add a hold-Z peek that zooms out while held and lands where the key is released, and a minimap
  after it, hidden until asked for.
- Insert space by dragging empty canvas, pushing everything beyond the drag apart.
- Let a tool stay in hand with Q, so several objects of one kind place in a row.
- Add a focus mode that hides the chrome with a persistent way back.
- Let a person disable single-key shortcuts for assistive technology, and give pictures and icons
  alternative text that agents also read.
- Add a brace over several sibling topics and a boundary that grows with its subtree, and level
  styles that map depth to colour and size and survive reparenting.
- Keep the last few account-saved copies with timestamps, as the only history beyond undo.

## Slides

- Export a deck as PDF or PPTX, one page per slide.
- Let participants follow the presenter's slide, and show notes on a second screen.
- Reveal a tree level by level while presenting from it.
- Wrap the selection in a slide that adopts it.

## Facilitation

- Add voting and timers, when group activities are designed. The canvas comes first.

## Platform

- Remove Arconis's remaining AppSync permissions from its Ahara registration.
