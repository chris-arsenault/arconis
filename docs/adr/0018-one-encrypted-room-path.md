# 0018 — One encrypted path for rooms

- Status: Accepted
- Date: 2026-11-10
- Supersedes: ADR-0015's distinction between plaintext ordinary saves and sealed password saves.

## Context

The owner requested one encrypted implementation for rooms, with an internal `nopass` default
for rooms created without a password prompt. Their UI must remain unchanged. Replaced legacy
implementations must be removed without fallbacks, facades or compatibility mappers.

## Decision

All rooms use RoomLock and LockedTransport for AES-GCM frame contents, encrypted local
Yjs updates, encrypted pictures and sealed account copies. Password rooms retain random data keys
wrapped under their entered password using the existing PBKDF2 envelope. Ordinary and device-only
rooms open automatically with `nopass` and show no additional password controls or warnings.

An automatic room's initial data key is SHA-256 over a domain-separated room identifier and the
public default. Fresh browsers can independently obtain the same key without a bootstrap service
or stored server key. The existing random room identifier provides the sharing address; anyone
with that address can derive its key. This retains ordinary link-based access. A relay agent peer
can open the ordinary envelope with `nopass`; explicit password rooms remain browser-owned.

One IndexedDB database per room holds ciphertext updates and its envelope. One account-copy
format contains room identity, ciphertext and envelope. Portable files and private reusable
layouts remain readable exports through the existing canonical canvas language.

Personal saves upload immutable revision objects and publish only after checksum/size verification.
A conditional DynamoDB transaction updates the current pointer, recent history and storage counts.
Five successful saves remain. Recovery opens a new room, resealing automatic-room content and
pictures under its new identity so new peers can join without a live bootstrap holder.

## Consequences

- Guest creation, joining and device-only behavior stay the same. No account password encrypts
  a saved copy, so resetting it does not lose work or recover an explicit room password.
- The relay forwards opaque encrypted frame contents; routing metadata stays visible. An MCP
  session deliberately holds the ordinary canvas in memory while its tools work.
- The y-indexeddb dependency, plaintext channel/picture codecs and alternate saved-copy readers
  are removed directly. Old persisted formats are not read by this implementation. Existing work
  needing preservation must be exported with the previous version before deployment and imported
  with this version; no deployment or data conversion is part of this local change.
- Room access uses links and explicit room passwords. There is no account-based room membership
  or individual revocation; changing a password does not revoke an existing holder's room key.
