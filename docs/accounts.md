# Accounts and saved work

An account adds private saved copies, reusable layouts and assistant
connections. Rooms remain usable by guests; signing in does not change who can join an
ordinary room by its link.

## Create an account or sign in

1. Choose **Sign in** on the welcome screen or workspace header.
2. Choose **Sign in or create an account** to open Ahara's sign-in page at `auth.ahara.io`.
3. For a new account, follow the sign-up prompts and enter the verification code sent to your email.
4. Return to Arconis. Open the account panel, enter **Your name**, and choose **Save name**.

Your account begins with your email as its name. The saved display name is used in rooms.
The sign-in service handles password-reset prompts; the Arconis panel holds no password form.

## Save a room

1. Open the room and sign in.
2. Choose the cloud button labelled **Save to my account** in the header.
3. After the initial save, the same button becomes **Save now**. Edits continue to be saved
   after activity settles; choose Save now when you want to save immediately.

The saved workspace includes the shared document, markup and picture data needed to restore it.
The **Include markup** export checkbox has no effect on account saving.
Before storing an existing saved workspace, Arconis merges a newer saved copy, preserving edits
made from another device rather than replacing that device's work.

Saving belongs to your account. Other people in the live room do not automatically receive
their own saved copy. They can choose to save the room to their accounts separately.

## Find and open your work

**Your canvases** appears on the welcome screen and in the account panel. Search by title.
It groups local and private account copies of the same room, with separate controls for each.
**Open local** uses this browser's retained document; **Join remembered** identifies a room
address with no retained content. A remembered address alone cannot restore a canvas.

When signed in, choose an account copy's name to open it, even when no other participant is online.
If that room is already open, its saved contents merge into the current document.
An account-list failure leaves the local entries available. Signing out removes the account results.

Opening a saved workspace retains the room's identity. Joining participants still use that room's
link, and a separate **Import document** operation adds portable file contents into a destination
room. [Files and pictures](files.md) compares these paths.

## Password rooms and password resets

All room copies are sealed in the browser under their room key. Rooms created without a
password prompt open automatically. Explicit password rooms are listed as **Password room**
to keep their titles out of the account index.

Opening a saved password room asks for its room password. An account password reset preserves
all saved workspaces because the copies are not encrypted under that account password. It does
not recover a forgotten room password.

## Recover a recent saved copy

Choose **History** beside an account copy to see its last five successful saves with timestamps.
**Recover copy** opens the selected version in a separate room, including its retained pictures
and objects deleted since that save. The current room and its saved copy stay intact. A recovered
password room still asks for its room password. Save the recovered room to retain another account copy.

## Keep reusable layouts

1. Select the objects to keep, then choose **My layouts** in the header.
2. Enter a **Layout name** and choose **Save selected layout**.
3. In any room, sign in to the same account, open **My layouts** and choose **Insert** beside it.

Nested contents, internal links, discussions and pictures travel with the selection. Each insertion
creates independent objects and one Undo removes it, leaving the destination's title, named styles
and saved views intact. The library also provides rename and delete controls. Layouts are private
to the account. Arconis supplies no built-in templates.
As with portable exports, saving a layout from a password room creates a readable copy outside
that room's password protection.

## Delete a saved copy or account

The delete button beside an account copy removes that copy and its recent history. **Remove local**
removes only this browser's retained copy and remembered address; close the room in other tabs first.
Neither operation deletes objects from an open peer's canvas or the other kind of copy.

**Sign out** ends account access in this browser. **Delete account** asks for confirmation and
removes the account, its saved workspaces and histories, and reusable layouts.
Export any portable copies you want before deleting saved data.

## When saving or signing in fails

The account panel displays sign-in failures; complete the sign-in or email verification it
requests, then retry. Save failures are shown in the workspace's message area. Check the account
connection and use **Save now** again; a local room copy and a portable export are independent
ways to retain work.

For assistant setup, see [assistants and MCP](agents.md).
