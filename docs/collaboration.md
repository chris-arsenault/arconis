# Rooms and collaboration

A room has one shared document. Each participant has a personal view, selection and local copy.
You can work as a guest, and local editing continues while collaboration is unavailable.

## Choose a room

| Choice on the welcome screen | Sharing                                              | Copy on this device           |
| ---------------------------- | ---------------------------------------------------- | ----------------------------- |
| Create a room                | Anyone with the room link or code can join and edit. | Retained in this browser.     |
| Create a password room       | Joining also requires the room password.             | Encrypted under the room key. |
| Work on this device only     | No relay connection or Share room control.           | Retained in this browser.     |

Account saving and file export are separate, explicit ways to copy a room. Choosing a device-only
room disables live relay collaboration; exporting it or saving it to an account creates a copy
outside that local room. See [accounts](accounts.md) and [files](files.md).

## Invite someone or join

Choose **Share room** in the header, then **Copy room link**. Share a password room's password
with the people joining it as well. A recipient can follow the link or paste it into **Room link
or code** on the welcome screen and choose **Join room**.

Keep a participant with the document online while a new device joins. The relay forwards the
document from peers rather than storing a recoverable room copy. A room link identifies the room;
it does not by itself contain its contents.

Use **Join another room** or **Create another room** in the header to switch. Each room's local
copy remains associated with its room identifier. The participant badge changes a guest's display
name; a signed-in participant uses their account name.

The home screen lists recently opened rooms from this browser. Ordinary and device-only rooms
show their titles; protected rooms use **Password room** without storing their titles or keys in
the recent list. This list helps you find a room; it does not create another document backup.
Cancel or Escape leaves password entry and returns to the previous room, or home.

## See where others are

The participant badge in the header opens the list of who is here. **Follow** beside a name
makes their view yours: as they pan and zoom, so do you, until you move the view, scroll or
press a key of your own, or choose **Stop following** in the pill at the bottom. **Bring
everyone to me** shows the others a banner with your name; each decides whether to follow or
let it pass. Nothing moves anyone's view without their choice.

Hold **K** to point with a laser: a trail in your colour follows your pointer on everyone's
screen and fades when you let go. Press **/** to say something beside your cursor; the words
show under your name until you press Escape or send an empty line. Lasers and cursor chat are
presence, not document edits: nothing is saved and Undo never sees them.

**Copy a link to this object**, in the command palette with an object selected, copies a room
link that opens at that object, selected and ringed. Each object's **Last edited by** in the
property panel names who changed it most recently.

## Understand what is shared

Object edits, relationships, comments, slides, named styles, saved views and markup are shared.
Names, cursors and dashed drag previews show who is present and what they are moving.

Your viewport, selection, grid visibility, drawing preferences, markup visibility and active
presentation stay local. A shared saved view lets each person navigate to the same place without
moving everyone else there.

Text appears locally as you type and is shared when you finish the edit. Leave its source/tools,
press Escape, or press Ctrl/Command Enter. Escape retains the edit. Collective scale and rotation
are shared on handle release; a drawing stroke is shared when its gesture finishes.

Peers' completed edits still merge while you work. Undo/Redo applies to your own document edits.
Comments are shared conversations and stay outside document Undo.

Unedited property fields follow peer changes. If a named property changes elsewhere while you
have a draft, the field keeps your draft and shows the newer value. Enter explicitly applies your
draft; Escape uses the latest value. Leaving the conflicting field does not overwrite the peer.

## Read the status bar

| Status                                          | Meaning and next action                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Looking for participants / Receiving the canvas | Joining is still obtaining shared state. Keep an existing participant online.     |
| Connected / In sync                             | Connected to collaboration; the participant count shows who is currently present. |
| Nobody else is online                           | Your browser retains edits; new participants need a holder of the document.       |
| Starting collaboration                          | The relay is being started. Editing remains available.                            |
| Offline / Connection error                      | Work continues locally; reconnecting merges the two sides.                        |
| Collaboration off                               | Use **Start collaboration** when available to request a restart.                  |
| Collaboration off until next month              | The relay's monthly spending limit is active; continue locally or exchange files. |
| On this device only                             | This room uses no relay connection.                                               |

Room creation and eligible local activity can also request a relay start. An open idle tab
retries its connection without continuously waking the service. If a new joiner is waiting and
the only person holding the canvas is still editing text, finishing that edit allows its shared
state to be sent.

## Password rooms

Choose a password when creating the room. A joining browser enters it at **Room password**.
If the browser has no local copy or saved copy, it may wait for someone holding the room to
come online before it can open.

The document, presence, pictures and local persisted content are encrypted in the browser.
The relay still sees connection and message metadata. Use the header's **Change room password**
button to change the password. People already holding the room key remain members; changing
the password does not revoke their access. Use a new room to establish new membership.

A forgotten room password cannot be recovered. It is distinct from an account password:
resetting the latter preserves saved workspaces, but opening a saved password room still needs
the room's password. [Accounts and saved workspaces](accounts.md) covers those copies.

## Recovery and portability

Return to the same room in the same browser to restore its local copy. Clearing browser storage
removes that browser's local recovery data. Keep a portable export or an account-saved copy
when you need another way to reopen the workspace.

Local edits and remote edits merge when a connection returns. The relay's replacement ends
sockets and agent sessions; browsers reconnect, and assistants reconnect and open the room again.

## Limitations

Ordinary room links provide shared editing access rather than account-based membership or
read-only access. Rooms suit non-sensitive collaboration. A fresh device needs an active peer,
a portable file or an account-saved copy. Device-only rooms provide local work rather than
live cross-device collaboration.
