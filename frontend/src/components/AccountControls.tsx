import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleUser, X } from "lucide-react";
import type { AccountStore } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { ConnectAgent } from "./ConnectAgent";
import { WorkBrowser } from "./WorkBrowser";

function Field({
  label,
  value,
  onChange,
  detail,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  detail: string;
}>) {
  return (
    <label data-hint-detail={detail}>
      {label}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** A form whose action can fail with a message for the person. */
function ActionForm({
  action,
  label,
  detail,
  children,
}: Readonly<{
  action: () => Promise<void>;
  label: string;
  detail: string;
  children: ReactNode;
}>) {
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
      <button className="primary" disabled={working} data-hint-detail={detail}>
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
      <button
        className="primary"
        data-hint-detail="Go to Ahara's sign-in page, where you can also create an account."
        onClick={() => void account.signIn()}
      >
        Sign in or create an account
      </button>
      <p className="password-note">A new account is activated from the email it is sent.</p>
    </div>
  );
}

function SignedIn({
  account,
  onOpen,
  onJoin,
}: Readonly<{
  account: AccountStore;
  onOpen: (copy: SavedCopy) => void;
  onJoin: (id: string) => void;
}>) {
  const [name, setName] = useState(account.name);
  const [error, setError] = useState("");
  return (
    <>
      <div className="account-profile">
        <p className="password-note">{account.email}</p>
        <ActionForm
          label="Save name"
          detail="Store this name on your Arconis profile."
          action={() => account.rename(name)}
        >
          <Field
            label="Your name"
            value={name}
            onChange={setName}
            detail="Your name in Arconis, shown on the account button and to room participants."
          />
        </ActionForm>
      </div>
      <WorkBrowser account={account} onOpen={onOpen} onJoin={onJoin} headingLevel={2} />
      <ConnectAgent />
      {error && <p role="alert">{error}</p>}
      <div className="account-links">
        <button
          type="button"
          data-hint-detail="Sign out on this device; your saved work stays in the account."
          onClick={() => void account.signOut()}
        >
          Sign out
        </button>
        <button
          type="button"
          data-hint-detail="Permanently remove your Arconis profile, saved workspaces, history and layouts. Your Ahara login and other apps are kept."
          onClick={() => {
            if (
              window.confirm(
                "Delete your Arconis profile, saved workspaces, history and layouts? Your Ahara login and data in other apps will remain."
              )
            ) {
              setError("");
              void account
                .deleteAccount()
                .catch((reason: unknown) =>
                  setError(reason instanceof Error ? reason.message : "Could not delete account.")
                );
            }
          }}
        >
          Delete Arconis account
        </button>
      </div>
    </>
  );
}

function Deleting({ account }: Readonly<{ account: AccountStore }>) {
  return (
    <div className="account-form">
      <p>{account.email}</p>
      <p>
        Arconis account deletion is unfinished. Retry to remove your Arconis profile and saved work.
        Your Ahara login and data in other apps will remain.
      </p>
      {account.error && <p role="alert">{account.error}</p>}
      <button
        className="primary"
        disabled={account.deletionPending}
        data-hint-detail="Try again to remove your Arconis profile and saved work."
        onClick={() => {
          void account.deleteAccount().catch(() => {});
        }}
      >
        {account.deletionPending ? "Working…" : "Retry account deletion"}
      </button>
      <button
        data-hint-detail="Sign out on this device without finishing the deletion."
        onClick={() => void account.signOut()}
      >
        Sign out
      </button>
    </div>
  );
}

/** Sign-in, and everything in the account once signed in. */
export function AccountButton({
  account,
  onOpen,
  onJoin,
}: Readonly<{
  account: AccountStore;
  onOpen: (copy: SavedCopy) => void;
  onJoin: (id: string) => void;
}>) {
  useSyncExternalStore(account.subscribe, account.snapshot);
  const [chosen, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const signedIn = account.status === "in";
  const deleting = account.status === "deleting";
  const name = signedIn ? account.name : "Sign in";
  const caption = deleting ? "Account deletion" : name;
  // A sign-in that came back refused opens the panel to say why, until it is closed.
  const open = chosen || (account.error !== "" && account.error !== dismissed);
  return (
    <>
      <button
        className="icon-button account-button"
        aria-label={caption}
        data-help-id="account"
        data-help-topic="accounts"
        data-hint-detail="Sign in, or manage your saved work, agent connections and account."
        onClick={() => setOpen(true)}
      >
        <CircleUser size={18} /> <span className="account-button-label">{caption}</span>
      </button>
      {open && (
        <div className="password-gate account-dialog" role="dialog" aria-label="Account">
          <section>
            <header className="account-heading">
              <h2>Your account</h2>
              <button
                className="icon-action account-close"
                aria-label="Close account"
                data-hint-detail="Close the account panel and return to the canvas."
                onClick={() => {
                  setOpen(false);
                  setDismissed(account.error);
                }}
              >
                <X size={15} />
              </button>
            </header>
            <div className="account-content">
              {signedIn && (
                <SignedIn
                  account={account}
                  onJoin={(id) => {
                    setOpen(false);
                    onJoin(id);
                  }}
                  onOpen={(copy) => {
                    setOpen(false);
                    onOpen(copy);
                  }}
                />
              )}
              {deleting && <Deleting account={account} />}
              {!signedIn && !deleting && <SignedOut account={account} />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
