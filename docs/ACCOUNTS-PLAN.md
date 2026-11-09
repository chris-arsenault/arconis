# Accounts, saved work and teams

Planning contract, 2026-11-09. Implementation is pending. The current request authorizes
planning; it does not authorize product changes, publication, messages, commits or deployment.

## Outcome and scope

People can find their work in one browser: local canvases without signing in, private saved
work when signed in, and rooms belonging to their teams. Account holders can form and manage
teams, invite other account holders, and keep personal sections to reuse in any room.

The source is [Accounts and teams in the backlog](backlog.md#accounts-and-teams). Its five
bullets map to M0–M3 and M5 below. This plan also includes the related Canvas backlog item
for the last few timestamped account saves, in M4. That grouping is an agent proposal.

Preserve these existing requirements:

- Rooms work without accounts; personal saved workspaces remain private to their account.
- Yjs stays canonical. Files, reusable sections and tools use the same canvas language.
- The relay forwards frames and holds no durable canvas or team data.
- Password-room saves remain sealed under their room key, including historical copies.
  Membership does not distribute keys or recover a forgotten room password.
- Ahara owns the Auth0 tenant and email provider; Arconis owns its connection and applications.
- Automated checks use local fixtures, independent browser contexts and real pointer/keyboard
  input. Infrastructure changes reach AWS through CI only.

Sources: [AGENTS.md](../AGENTS.md), [product](product.md), [architecture](architecture.md),
[ADR-0015](adr/0015-auth0-accounts-and-connector-sign-in.md), and
[Ahara integration](../../ahara/INTEGRATION.md#step-6b-auth0-open-sign-up-and-mcp-connectors).
ADR-0012's account encryption and Cognito design are superseded; do not restore them.

## Current foundation

These are local source observations, not claims about the deployed service.

| Existing behavior                                           | Source and reuse                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Auth0 sign-in, profile, personal save/load/delete           | `frontend/src/account/`, `frontend/src/accounts/`, `frontend/src/protocol/account.ts`                                                |
| Separate local recent list and account workspace list       | `components/Welcome.tsx`, `components/AccountControls.tsx`                                                                           |
| Browser room-address index                                  | `collaboration/recentRooms.ts`; records addresses/titles, not proof that a local document still exists                               |
| Saved copies with pictures and password-room sealing        | `account/workspaceFile.ts`, `account/savedRoom.ts`                                                                                   |
| Autosave that checks and merges newer stored revisions      | `account/workspaceSaver.ts`; retain this behavior without assuming it resolves every simultaneous write                              |
| Selected canvas serialization and import                    | `files/canvasFiles.ts`, `files/canvasFile.ts`, `document/exportItems.ts`; includes picture handling and import Undo                  |
| API metadata and private DynamoDB/S3 storage                | `protocol/account.ts`, `accounts/api.ts`, `accounts/lambda.ts`, `infrastructure/terraform/accounts.tf`                               |
| Local accounts/sign-in/storage fixture and browser journeys | `collaboration/accountFixture.ts`, `editor/accounts.browser.test.ts`                                                                 |
| Ahara sender through SES                                    | `../ahara-infra/infrastructure/terraform/services/auth0.tf` already declares the SES provider and Ahara verification/reset templates |

All frontend paths in the table are relative to `frontend/src/` unless already prefixed.
The existing Auth0 Management API wrapper only deletes users; inviting an existing account
by email needs an explicit identity-resolution addition, not a presumed existing directory.
The original saved-browser/team request was recovered with `sulion-retrieve`, session
`01a1beb9-db83-77d1-8cc2-4425bc1092c9`, turn `20576505`.

## Proposed design and decisions

These choices are recommendations, not additional user requirements.

1. **One work browser.** Use Local, Personal and team views in the welcome experience, also
   reachable from an open room. Show source and availability; a remembered room link must not
   masquerade as a recoverable local copy. Keep the account panel focused on identity/settings.
   Combine matching local/account room identities for discovery without conflating their copies
   or deletion operations. Signing out removes personal/team results, not local canvases.
2. **Product-owned teams.** Store teams, memberships, invitations and ownership in the existing
   account service and DynamoDB. Use Auth0 subjects for people. Recommend owner/member roles,
   with one transferable owner, rather than a configurable permissions system or a second
   identity platform. Owner manages settings, invitations, membership and room ownership;
   members can browse, edit and save team work. Check authorization in every server operation.
3. **Invitations to existing accounts.** Recommend an in-app inbox with accept/decline, owner
   cancellation and duplicate protection. Resolve an exact email on the server through the
   existing Management API integration, restricted to verified Arconis-connection users; review
   the minimum required Auth0 grant during M1. Do not expose a browsable user directory.
   Invitation email delivery is not required by the backlog and is not proposed here.
4. **Team-owned recovery.** Recommend a team-owned saved copy attached to each team room so a
   member can reopen it with nobody else online. Extend current workspace storage with explicit
   personal/team ownership, rather than copying a personal record to every member. Team room
   ownership and a person's separate saved copy are distinct. Assigning ownership never moves
   or exposes personal data implicitly; a team save is an explicit operation.
5. **Reusable sections are portable canvas content.** Keep a private named account library,
   using selected canvas source and pictures, not a new template format or built-in catalog.
   Inserting uses the existing paste/import path with new object identities, internal references
   remapped, and placement as one undoable action. It must not overwrite the destination title,
   unrelated styles, views or objects. Saving from a password room creates a readable personal
   library copy, like an explicit portable export; explain that at the save action. Inserting
   into a password room uses its normal encrypted storage and collaboration path.
6. **Recent copies, not an event log.** Recommend retaining five successful saves per workspace,
   with timestamps; five is a provisional interpretation of “last few.” Use revision-addressed
   objects and publish a revision only after upload succeeds. Failed uploads must leave the last
   usable save intact. Count retained bytes under the existing storage controls. Recommend
   recovery into a separate room so deleted items can be recovered without CRDT-merging them
   straight back into the active room or silently rolling back peers.
7. **Lifecycle preserves ownership.** Leaving/removal ends team API access and new signed-link
   issuance; it cannot erase downloaded copies or revoke an already issued link before expiry.
   A sole owner transfers ownership before leaving or deleting their account. Team deletion
   explicitly removes team-owned saved data, leaving personal copies and live/browser canvases
   separate. Keep current account deletion's treatment of personal data and extend it to the
   new personal library/history. Show resulting effects in existing destructive-action flows.

The persistence additions serve concrete requirements: memberships/invitations must survive
relay replacement, team saved work must reopen across devices, sections must be reusable later,
and older copies must survive newer saves. Reuse DynamoDB and the private S3 bucket; do not add
a separate database, relay persistence, generic workflow engine or recovery service.

### Deferred choice and assumptions

- **[DECISION, user, blocks M2] Team-room entry.** Recommend retaining guest access by room
  link, with membership controlling team metadata, management and shared saved copies. Asked
  during planning; unanswered as of this draft. Member-only entry would also require admission
  enforcement in browser relay connections and MCP room opening; hiding a room in a list would
  not implement it. Resolve before expanding M2. M0 and M1 can proceed independently.
- **Assumption, check in M0:** local persistence can distinguish a retained document from a
  remembered address. Inspect room/session and IndexedDB lifecycle before choosing its index.
- **Assumption, check in M1:** owner/member roles and in-app invitations satisfy team management.
  Account existence/verification lookup must stay within Arconis's connection and least privilege.
- **Assumption, check in M2:** team ownership includes a durable shared saved copy. Support
  password rooms without changing their key model; device-only rooms remain local unless the
  person explicitly saves a copy, and membership never enables their relay connection.
- **Assumption, check in M4:** five copies and recovery into a new room satisfy recent-history
  needs. History includes team-owned saved copies under their team's access rules.
- **Existing implementation, check in M5:** SES configuration is present in Ahara source.
  Deployment and actual delivery have not been checked. Do not infer a mail failure or make
  infrastructure changes without evidence. Platform changes, if needed, belong in Ahara.

## Milestones

### M0 — Saved-work browser

Scope: unify local and personal saved-work discovery using the existing open/save paths. Add
loading, empty, unavailable-copy and failed-fetch states; remote failure leaves local work usable.

Acceptance: a guest finds and reopens retained local work. A signed-in person also finds and
opens their private saved copies from another browser with no live peer. Matching rooms identify
their local/remote copies clearly. Password-room titles stay hidden until opened. Signing out
removes account results; local removal cannot delete an account copy or vice versa.

Evidence: focused room-index tests and local browser journeys covering guest/sign-in/sign-out,
missing local contents, offline remote access, and protected rooms. Reuse existing account tests.

### M1 — Teams and membership

Scope: team creation/settings, invitation inbox and lifecycle, members, owner transfer, leave,
removal and deletion/account-deletion rules. Extend shared HTTP contracts and existing server
storage/services. No dependency on M0; use it as the intended navigation home.

Acceptance: accounts A and B create a team, invite/accept and manage membership; account C
cannot read or mutate it. Pending invitations confer no team access, and cancellation/removal
is enforced by the API. The owner cannot strand a team through leave/account deletion.
Personal saves never become visible through membership.

Evidence: service authorization tests and independent authenticated browser contexts, including
wrong-account acceptance, duplicate acceptance and owner transfer. Use local Auth0 fixtures.

### M2 — Team-owned rooms [depends on M0, M1]

Scope: team room browser, creation and explicit assignment/transfer of room ownership; shared
save/open/delete and the chosen team-room entry policy. Keep personal copy actions distinct.

Acceptance: one member saves a team room; another opens it on a fresh device with no live peer.
Team room settings and ownership are manageable by the authorized owner. A removed member
cannot fetch or change team records or obtain new storage URLs. A separate personal copy stays
private. Password-room copies require the room password, and team membership supplies no key.
Guest admission behaves according to the decision above across browsers and agents.

Evidence: local multi-account/member/guest browser journeys; API denial checks; picture restore;
and concurrent saves from independent contexts. Preserve both editors' work without treating
the existing pre-save revision check as proof of simultaneous-save correctness. Amend storage
publication/concurrency only as needed for this shared-save behavior, within the existing API.

### M3 — Personal reusable sections [depends on M0]

Scope: save selection with a name, browse/rename/delete private library entries, insert into a
room. Reuse selection closure, canvas language, pictures and paste/import operations.

Acceptance: a section containing nested objects, internal links and a picture reappears intact
in another room; repeated insertion creates independent objects. Destination content/metadata
stay intact, and one Undo removes one insertion. It works across ordinary, password and
device-only rooms. Another account cannot read the library, including a teammate.

Evidence: existing codec/import tests extended for section metadata and repeated insertion;
local browser journeys for save on one device, insert on another, picture handling and Undo.

### M4 — Recent saved-copy history [depends on M0, M2]

Scope: timestamped recent saves for personal/team workspaces, retrieval and recovery to a new
room, retention/storage accounting and deletion. Inspect existing publication ordering before
introducing revision objects; retain readable access to existing current-copy records.

Acceptance: after successive successful saves a person can list recent copies and recover
the chosen contents, including pictures and previously deleted objects. Failed uploads do not
appear as successful revisions or discard the last usable copy. Recovery leaves the current
live room intact. Password history stays sealed; team history follows team membership.

Evidence: storage-service tests with failed upload, concurrent save and pruning cases; local
browser recovery across devices. Revision-key layout and five-copy retention are proposed
implementation checks, revisable while preserving the requested recent-copy behavior.

### M5 — Integration and backlog reconciliation [depends on M0–M4]

Scope: integrate navigation and lifecycle; update existing account/file/collaboration guides,
architecture and backlog as behavior lands. Record consequential team ownership decisions in
an ADR during implementation. Reconcile the SES item with Ahara's existing configuration.

Acceptance: the full guest → account → team → saved-room → reusable-section → recovery journey
works through local UI input, with personal/team boundaries intact. Existing guest rooms,
password rooms, device-only work, account sign-in and MCP behavior continue to work. Update
the backlog only for behavior actually built; distinguish configured SES from verified delivery.

Evidence: `make ci`, `make build`, `make test-browser`, using local fixtures only. These are
future implementation checks, not results of this planning task. Deployment/delivery evidence
requires a later authorized operational task; no live email send or AWS test is part of CI.

## Sulion mapping and next action

Root: `f1b0b7f5-8ee5-4aec-9f8d-fdab7bac4542` — Accounts, saved work and teams.

| Milestone | Phase ID                               | State                            |
| --------- | -------------------------------------- | -------------------------------- |
| M0        | `099d47f1-740c-47f4-aeeb-9b7632550a13` | Pending                          |
| M1        | `48aa87ab-2acf-4366-ab1e-0720d5813f30` | Pending                          |
| M2        | `00d608e5-ce34-4e48-a217-1d5899ccda48` | Pending; entry policy unresolved |
| M3        | `83eddc32-0732-4ddf-af52-95737ae21132` | Pending                          |
| M4        | `cb3aa868-0932-4dca-8f06-4436ea004c7e` | Pending                          |
| M5        | `2cc3d208-90e8-44ec-b2e9-53168a3884dc` | Pending                          |

Planning read the backlog, recovered the original account/team request, inspected current
account/file/index implementations, and found existing platform SES declarations. No product
implementation or runtime verification occurred. Concurrent frontend edits belong to other work.

Next: when implementation is requested, read `sulion plan current`, expand M0 with plan-phase
in this document, then execute that expansion. Keep later milestones pending and expand them
when imminent. The room-entry decision does not block M0. Close the root when implementation
lands, not when this plan is written.
