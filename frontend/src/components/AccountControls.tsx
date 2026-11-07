import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleUser, FolderOpen, Trash2, X } from "lucide-react";
import type { AccountStore, SavedWorkspace } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { ConnectAgent } from "./ConnectAgent";

function Field({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  return (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** A form whose action can fail with a message for the person. */
function ActionForm({
  action,
  label,
  children,
}: Readonly<{ action: () => Promise<void>; label: string; children: ReactNode }>) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  return (
    <form
      className="account-form"
      onSubmit={(event) => {
        event.preventDefault();
        setWorking(true);
        setError("");
        action()
          .catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : "That did not work.")
          )
          .finally(() => setWorking(false));
      }}
    >
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={working}>
        {working ? "Working…" : label}
      </button>
    </form>
  );
}

/** Signing in and creating an account both happen on Ahara's sign-in page. */
function SignedOut({ account }: Readonly<{ account: AccountStore }>) {
  return (
    <div className="account-form">
      <p className="password-note">
        Sign in with an Ahara account to keep workspaces and connect Claude or ChatGPT. Rooms work
        without one.
      </p>
      {account.error && (
        <p role="alert" className="error">
          {account.error}
        </p>
      )}
      <button className="primary" onClick={() => void account.signIn()}>
        Sign in or create an account
      </button>
      <p className="password-note">
        A new account is activated from the email it is sent, and one not activated within 7 days is
        removed.
      </p>
    </div>
  );
}

function WorkspaceList({
  account,
  onOpen,
}: Readonly<{ account: AccountStore; onOpen: (copy: SavedCopy) => void }>) {
  const [items, setItems] = useState<SavedWorkspace[] | null>(null);
  const refresh = () => void account.workspaces().then(setItems);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [account]);
  if (!items) return <p className="password-note">Loading your workspaces…</p>;
  if (!items.length) return <p className="password-note">No saved workspaces yet.</p>;
  return (
    <ul className="workspace-list" aria-label="Saved workspaces">
      {items.map((item) => (
        <li key={item.id}>
          <button
            className="workspace-open"
            onClick={() => {
              void account.load(item.id).then(({ copy }) => onOpen(copy));
            }}
          >
            <FolderOpen size={14} /> {item.name}
          </button>
          <button
            className="icon-action"
            aria-label={`Delete ${item.name}`}
            title="Delete"
            onClick={() => void account.removeWorkspace(item.id).then(refresh)}
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SignedIn({
  account,
  onOpen,
}: Readonly<{ account: AccountStore; onOpen: (copy: SavedCopy) => void }>) {
  const [name, setName] = useState(account.name);
  return (
    <>
      <p className="password-note">{account.email}</p>
      <ActionForm label="Save name" action={() => account.rename(name)}>
        <Field label="Your name" value={name} onChange={setName} />
      </ActionForm>
      <h3>Workspaces</h3>
      <WorkspaceList account={account} onOpen={onOpen} />
      <ConnectAgent />
      <div className="account-links">
        <button type="button" onClick={() => void account.signOut()}>
          Sign out
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Delete your account and every saved workspace?"))
              void account.deleteAccount();
          }}
        >
          Delete account
        </button>
      </div>
    </>
  );
}

/** Sign-in, and everything in the account once signed in. */
export function AccountButton({
  account,
  onOpen,
}: Readonly<{ account: AccountStore; onOpen: (copy: SavedCopy) => void }>) {
  useSyncExternalStore(account.subscribe, account.snapshot);
  const [chosen, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const signedIn = account.status === "in";
  // A sign-in that came back refused opens the panel to say why, until it is closed.
  const open = chosen || (account.error !== "" && account.error !== dismissed);
  return (
    <>
      <button className="icon-button account-button" onClick={() => setOpen(true)}>
        <CircleUser size={18} /> {signedIn ? account.name : "Sign in"}
      </button>
      {open && (
        <div className="password-gate" role="dialog" aria-label="Account">
          <section>
            <button
              className="icon-action account-close"
              aria-label="Close account"
              onClick={() => {
                setOpen(false);
                setDismissed(account.error);
              }}
            >
              <X size={15} />
            </button>
            {signedIn ? (
              <SignedIn
                account={account}
                onOpen={(copy) => {
                  setOpen(false);
                  onOpen(copy);
                }}
              />
            ) : (
              <SignedOut account={account} />
            )}
          </section>
        </div>
      )}
    </>
  );
}
