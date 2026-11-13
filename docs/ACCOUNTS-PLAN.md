# Accounts and saved work

## Shared Ahara identities — 2026-11-13

The user accepted one shared Ahara account connection with separate application permissions
and data, then authorized commit, push and watching CI. Live user creation and email-sending
tests remain excluded. The user explicitly rejected data migration, backwards-compatibility
mappers and facades; use the existing account store directly.

Reuse the existing `arconis` database and its user IDs, passwords and saved-work keys. Its
internal name remains `arconis`; its public display name becomes Ahara. Ahara-infra
owns the connection and verified-email rule, publishes its ID/name through `/ahara/auth0/`,
and products enable their own clients additively. API audiences and grants remain product-specific.
Do not merge or recreate accounts from the unrelated default database.

Arconis deletion removes only its own saved work, layouts and profile. Its existing deletion
marker continues to block concurrent and stale-token writes; it never deletes the shared login.
Global Ahara account deletion and a new account-management portal are outside this change.

Emails retain Ahara as sender and identify the requesting application when available. Reset
wording explains that the shared password applies across participating apps. Use the existing
SES provider and templates; do not add an email service or send tests.

Sources: the current conversation's shared-account recommendation and user acceptance;
`infrastructure/terraform/auth0.tf`, `frontend/src/accounts/api.ts`, `../ahara/INTEGRATION.md`,
and `../ahara-infra/infrastructure/terraform/services/auth0.tf`.

### Milestones and execution

Root Sulion plan: `c3a600bc-27f1-4a07-89c8-5b0d9d60da6f`.

- **M0 — Shared identity ownership and contract.** Adopt the existing connection and verification
  Action through native Terraform remove/import declarations. Keep its original internal name;
  expose shared connection metadata, use additive client associations, and update email context
  and platform integration guidance. Acceptance: existing identities need no migration; a future
  app can use the documented shared connection while retaining independent API permissions.
  Validate Terraform offline and review ownership/import addresses. Live plans are unverified
  while the prescribed credential broker reports `403: no secret is unlocked for this terminal`.
- **M1 — Product data boundary and validation** [depends on M0]. Remove Arconis's Auth0 identity
  deletion capability, retain retry/concurrency guards for product erasure, and align UI and docs.
  Acceptance: product deletion has no global identity operation; local behavior tests cover
  cleanup and failures; required lint/types/tests/build and Terraform checks pass.

M0 execution (`11b6f803-de03-4a0d-a2bd-0f9aa1cc869a`, step
`662911fd-8808-45ab-a210-86ba8e3644de`): one coherent step touching the two `auth0.tf` files, platform email/Action sources,
the Arconis auth consumer, and integration/architecture guidance. Verify native import schemas,
Terraform validation, the authorization-request regression, and local Action/template rendering.
M1 execution (`f05346e2-b856-44a7-8368-04ebeb225045`, step
`d2183c6e-c4b5-4a73-8578-014570b843aa`): remove the Management API adapter and deletion client/grant/secrets; preserve
product erasure and its deletion marker, revise retry tests to exercise storage failure, and
clarify the UI's product scope. Update current docs and run the shared final checks for both
milestones: local account cleanup/authorization/browser journeys, full CI/build, offline
Terraform validation, and local verification-Action and Liquid rendering checks.
Preserve the pending browser/comments layout edits and unrelated
`ahara-infra/services/db-migrate.tf` changes.

Current state: both milestones are implemented locally. Arconis CI (707 unit tests), all 12
affected browser journeys and the production build pass. Platform CI, including three verification
Action tests, also passes. Arconis and the platform root/services
Terraform validate offline. Both email templates render through Terraform and Liquid for five
requester cases; the verification Action passes local verified/unverified/unrelated-connection
checks. Live import plans and delivery remain unverified because credentials are locked; no
users were created, no emails were sent, and no live state changes were made.

Publication is tracked by Sulion plan `2b83d9cd-c30b-4527-869d-9c4d2505c126`.
Publish Arconis first and confirm CI succeeds before platform adoption. Keep the unrelated
database migration edit out of the platform commit. No data-conversion or compatibility layer
is part of either stack.

M1 prerequisite: a storage-failure regression showed account erasure removed workspace/layout
metadata before object cleanup. Keep the existing frozen metadata until object deletion succeeds,
so retries retain their references. This uses the existing deletion marker and storage ports;
it adds no recovery system. Sulion branch: `2065646e-c54c-49d0-a3df-ba9d120605b7`, completed
with 51 focused tests passing. M1 execution branch: `f05346e2-b856-44a7-8368-04ebeb225045`.

## Earlier account and team-removal work

Updated 2026-11-10 after the user approved removing all team-based functionality.
This supersedes the team administration and peer-key proposals. Their Sulion history remains
available, but team rooms, shared ownership, invitations, membership and key work are canceled,
not deferred. No commit, push, publication or deployment is requested.

## Outcome and sourced boundaries

Guests reopen local canvases. Signed-in people keep private saved copies, recent history and
reusable layouts. Collaboration continues through room links and explicit room passwords.

- **User requirement:** remove the entire team concept, including its implemented account
  administration, API/storage/contracts, invitation directory lookup, Auth0 read permission,
  tests, UI/documentation and future room/key work.
- **User correction:** remove replaced implementations directly, without stubs, fallbacks,
  facades or compatibility mappers. Cancel the old team phases rather than preserving a roadmap.
- **Preserved requirements:** Yjs stays canonical; files, layouts and agent tools share the
  canvas language. Guest, password and device-only rooms, private account copies and ordinary-room
  MCP continue to work.
- **Preserved correction:** all room frames, persistence, pictures and account copies use the
  existing encrypted implementation. Ordinary rooms automatically use `nopass` with unchanged
  UI; explicit password rooms retain their prompts. No encryption rollback is part of removal.
- **Preserved constraint:** keep the server footprint small. This is not a numeric concurrency
  test target, new runtime cap or benchmark gate.
- **Verification boundary:** use local fixtures only. Use unit tests wherever they can validate
  the behavior. Browser journeys cover several related outcomes using the same setup and exist
  only for behavior that requires a browser.
- **Authorization boundary:** local changes and validation only; no live data deletion or
  external writes are part of this task.

Sources: the user's removal instruction and preceding impact assessment;
[agent rules](../AGENTS.md), [account guide](accounts.md),
[collaboration](collaboration.md), [architecture](architecture.md) and
[ADR-0018](adr/0018-one-encrypted-room-path.md).

## Behavior retained

### Saved-work browser

One `WorkBrowser` serves home and the account panel. It groups local and private account copies
by room identity, with search and separate open/removal actions. Stored updates distinguish a
local document from a remembered address. Account-list failures leave local work available;
sign-out removes account results. Password-room titles stay hidden in indexes.

### Private reusable layouts

Named private selections use canonical canvas text and picture bytes in the existing private
object store. Verified publication prevents incomplete uploads appearing in the library.
Insertion gives objects fresh identities, preserves nested contents/internal references and
pictures, materializes appearance, and leaves destination metadata intact. One Undo removes one
insertion. Rename/delete and account isolation remain supported; no built-in templates.

### Personal saved-copy history

Immutable revision uploads publish only after size/checksum verification. Conditional metadata
and quota updates retain five successful copies and protect concurrent saves. A competing save
merges the latest Yjs copy and retries. Failed uploads preserve the previous usable copy.
History recovery opens a separate room, preserving the source. Automatic-room recovery reseals
its content and pictures for the new room identity; password history still needs its password.

### Account lifecycle and room access

Ahara sign-in and Arconis profile/account deletion remain. The shared-identity decision above
supersedes the earlier global deletion behavior: deletion removes private saved work/history,
layouts and the Arconis profile, preserving the shared Ahara login. Arconis no longer needs the
Management API or its `delete:users` grant; invitation-related `read:users` and directory lookup
remain removed.

Room links and passwords govern live access. There is no account-based room membership or
individual revocation. Already delivered copies remain available to their holders. A password
change rewraps the existing room key; a new room is needed to exclude an existing keyholder.
The `nopass` default preserves link-based access and is not a secret.

## Implementation and reuse

Keep the current account API, DynamoDB, private S3, browser encrypted storage, relay and canonical
document model. Remove team-specific producers and consumers from account wiring and local
fixtures. No saved-copy, canvas or room-encryption format changes are needed for this removal.

The former peer-key proposal, independent device-key split, authenticated team download path,
membership leases and browser re-encryption jobs were never implemented. They are dropped
without replacing them with another access system.

The user has confirmed deployed email delivery. No email-delivery verification work remains.

## Sulion mapping

Root `f1b0b7f5-8ee5-4aec-9f8d-fdab7bac4542` — Accounts and saved work.

| Scope                      | Phase                                  | State                                                 |
| -------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Saved-work browser         | `099d47f1-740c-47f4-aeeb-9b7632550a13` | Completed                                             |
| Unified encrypted rooms    | `8d01c093-1f0b-451f-906b-fab3c31a5fb4` | Completed                                             |
| Personal reusable sections | `83eddc32-0732-4ddf-af52-95737ae21132` | Completed                                             |
| Personal history           | `cb3aa868-0932-4dca-8f06-4436ea004c7e` | Completed                                             |
| Account integration        | `2cc3d208-90e8-44ec-b2e9-53168a3884dc` | Completed before removal; relevant checks rerun below |
| Former team administration | `48aa87ab-2acf-4366-ab1e-0720d5813f30` | Removed from scope                                    |
| Former team rooms          | `00d608e5-ce34-4e48-a217-1d5899ccda48` | Canceled                                              |
| Remove teams               | `7e1b31d3-6195-414c-b549-f58b51a06d3d` | Completed                                             |

The peer-key branch `0d208b7b-3fbf-4335-b334-cc449cad2d85` is canceled, including T1–T3.
Removal branch: `4d8bc012-1b57-4329-a8b4-643450151aa6`.

1. **Remove implementation and reconcile docs**
   (`2108726d-3e22-4d07-95cd-d28aa82fe91d`): delete team-specific source/tests, simplify account
   types/lifecycle/fixtures, remove directory lookup and its Auth0 scope, and reconcile guides,
   architecture, ADR/changelog/backlog and this plan. Preserve the other account work.
2. **Validate remaining workflows**
   (`6cc2a4f8-c29a-4f5c-99ff-ea905b05ac6d`): run `make ci`, `make build` and existing local
   account/room browser journeys for sign-in, private restore, sign-out, local copies, layouts,
   history recovery and explicit password saves. Check removal of all runtime team references.

Removal is complete. No team API, UI, storage, invitation lookup, read grant or future team work
remains. The remaining account/room encryption and saved-copy formats were preserved directly.

Final local checks: `make ci` passes with 615 unit tests, zero lint errors and 191 warnings;
`make build` passes; all 10 existing account/room-usability browser journeys pass. Those browser
journeys cover the affected sign-in, private save/restore, layout, history, local-copy and password
flows. The full editor/relay browser suite was run before removal and was not repeated for this
account-only cleanup. Generated logs stay in ignored test output; no separate report was created.
No commit, push, deployment or live data deletion occurred.
