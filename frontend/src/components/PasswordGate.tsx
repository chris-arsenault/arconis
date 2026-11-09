import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KeyRound } from "lucide-react";
import type { RoomSession } from "../collaboration/room";

const MIN_PASSWORD_LENGTH = 8;

function PasswordForm({
  label,
  action,
  note,
  onSubmit,
}: Readonly<{
  label: string;
  action: string;
  note: string;
  onSubmit: (password: string) => Promise<void>;
}>) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onSubmit(password).finally(() => setBusy(false));
      }}
    >
      <label>
        {label}
        <input
          type="password"
          aria-label={label}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <p className="password-note">{note}</p>
      <button className="primary" disabled={busy || password.length < MIN_PASSWORD_LENGTH}>
        {busy ? "Working…" : action}
      </button>
    </form>
  );
}

/** Stands between a password room and its contents, which do not exist here until it opens. */
export function PasswordGate({
  session,
  onCancel,
}: Readonly<{ session: RoomSession; onCancel: () => void }>) {
  useSyncExternalStore(session.subscribe, session.snapshot);
  const { lock } = session;
  const dialog = useRef<HTMLDialogElement>(null);
  const blocked = Boolean(lock && lock.state !== "unlocked");
  useEffect(() => {
    if (!blocked) return;
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, [blocked]);
  if (!lock || !blocked) return null;
  return (
    <dialog
      ref={dialog}
      className="password-gate"
      aria-label="Password required"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <section>
        <h2>
          <KeyRound size={18} /> This room has a password
        </h2>
        {lock.state === "choose" && (
          <PasswordForm
            label="Choose a password"
            action="Create room"
            note="Everything in this room is encrypted with it, in this browser. Nothing can recover a forgotten password, and the room would be lost."
            onSubmit={(password) => lock.choose(password)}
          />
        )}
        {lock.state === "enter" && (
          <PasswordForm
            label="Room password"
            action="Open room"
            note="At least 8 characters."
            onSubmit={(password) => lock.enter(password)}
          />
        )}
        {lock.state === "waiting" && (
          <p data-testid="lock-waiting">
            Waiting for someone in this room to come online, because they hold what your password
            opens.
          </p>
        )}
        {lock.error && (
          <p role="alert" className="error">
            {lock.error}
          </p>
        )}
        <button type="button" onClick={onCancel}>
          Cancel joining
        </button>
      </section>
    </dialog>
  );
}

/** Changes the password for this room. Everything already here keeps working. */
export function ChangePassword({ session }: Readonly<{ session: RoomSession }>) {
  const [open, setOpen] = useState(false);
  const { lock } = session;
  if (!lock || lock.state !== "unlocked") return null;
  return (
    <>
      <button
        className="icon-button"
        aria-label="Change room password"
        data-hint="Change room password"
        onClick={() => setOpen(true)}
      >
        <KeyRound size={18} />
      </button>
      {open && (
        <div className="password-gate" role="dialog" aria-label="Change room password">
          <section>
            <PasswordForm
              label="New password"
              action="Change password"
              note="People already in the room stay in. Anyone joining later needs the new one."
              onSubmit={async (password) => {
                await lock.changePassword(password);
                setOpen(false);
              }}
            />
            <button onClick={() => setOpen(false)}>Cancel</button>
          </section>
        </div>
      )}
    </>
  );
}
