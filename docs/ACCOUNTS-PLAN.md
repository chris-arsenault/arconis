# Accounts and saved work

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
- **Verification boundary:** use local fixtures only. Put parameter combinations in unit tests
  and use browser journeys for distinct product workflows.
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

Auth0 sign-in/profile/account deletion remain. Deletion removes private saved work/history,
layouts and the Auth0 user. The Management API needs `delete:users`; invitation-related
`read:users` and directory lookup are removed.

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

Ahara source already configures SES and verification/reset templates. Deployment and actual
email delivery remain unverified; that existing backlog item is outside this removal.

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
