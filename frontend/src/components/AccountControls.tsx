import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleUser, FolderOpen, Trash2, X } from "lucide-react";
import type { AccountStore, SavedWorkspace } from "../account/accountStore";
import type { WorkspaceContents } from "../account/workspaceFile";

type Mode = "signIn" | "signUp" | "confirm" | "forgot" | "reset";
const MIN_PASSWORD = 12;
const CODE_NOTE = "We emailed you a code. An account not activated within 7 days is removed.";
const LOSS_NOTE =
  "Your workspaces are encrypted with this password in your browser, and nobody can read them without it.";

interface FormProps {
  account: AccountStore;
  email: string;
  setEmail: (email: string) => void;
  setMode: (mode: Mode) => void;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: Readonly<{ label: string; value: string; onChange: (value: string) => void; type?: string }>) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** A form whose action can fail with a message for the person. */
function ActionForm({
  action,
  label,
  note,
  children,
  extra,
}: Readonly<{
  action: () => Promise<void>;
  label: string;
  note?: string;
  children: ReactNode;
  extra?: ReactNode;
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
      {note && <p className="password-note">{note}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={working}>
        {working ? "Working…" : label}
      </button>
      {extra}
    </form>
  );
}

function SignInForm({ account, email, setEmail, setMode }: Readonly<FormProps>) {
  const [password, setPassword] = useState("");
  return (
    <ActionForm
      label="Sign in"
      action={() => account.signIn(email, password)}
      extra={
        <div className="account-links">
          <button type="button" onClick={() => setMode("signUp")}>
            Create an account
          </button>
          <button type="button" onClick={() => setMode("forgot")}>
            Forgot password
          </button>
          <button type="button" onClick={() => setMode("confirm")}>
            Enter an activation code
          </button>
        </div>
      }
    >
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <Field label="Password" value={password} onChange={setPassword} type="password" />
    </ActionForm>
  );
}

function SignUpForm({ account, email, setEmail, setMode }: Readonly<FormProps>) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <ActionForm
      label="Create account"
      note={`${LOSS_NOTE} If you forget it and reset it, they are lost.`}
      action={async () => {
        if (password.length < MIN_PASSWORD)
          throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
        if (!name.trim()) throw new Error("Choose the name people will see.");
        await account.signUp(email, password, name.trim());
        setMode("confirm");
      }}
      extra={
        <button type="button" className="account-back" onClick={() => setMode("signIn")}>
          I already have an account
        </button>
      }
    >
      <Field label="Your name" value={name} onChange={setName} />
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <Field label="Password" value={password} onChange={setPassword} type="password" />
    </ActionForm>
  );
}

function ConfirmForm({ account, email, setEmail, setMode }: Readonly<FormProps>) {
  const [code, setCode] = useState("");
  return (
    <ActionForm
      label="Activate"
      note={CODE_NOTE}
      action={async () => {
        await account.confirm(email, code.trim());
        setMode("signIn");
      }}
      extra={
        <button
          type="button"
          className="account-back"
          onClick={() => void account.resendCode(email)}
        >
          Send a new code
        </button>
      }
    >
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <Field label="Activation code" value={code} onChange={setCode} />
    </ActionForm>
  );
}

function ForgotForm({ account, email, setEmail, setMode }: Readonly<FormProps>) {
  return (
    <ActionForm
      label="Send a reset code"
      note="You can reset your password, but your workspaces still need the old one to open."
      action={async () => {
        await account.forgotPassword(email);
        setMode("reset");
      }}
    >
      <Field label="Email" value={email} onChange={setEmail} type="email" />
    </ActionForm>
  );
}

function ResetForm({ account, email, setMode }: Readonly<FormProps>) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  return (
    <ActionForm
      label="Reset password"
      action={async () => {
        await account.resetPassword(email, code.trim(), password);
        setMode("signIn");
      }}
    >
      <Field label="Reset code" value={code} onChange={setCode} />
      <Field label="New password" value={password} onChange={setPassword} type="password" />
    </ActionForm>
  );
}

const FORMS = {
  signIn: SignInForm,
  signUp: SignUpForm,
  confirm: ConfirmForm,
  forgot: ForgotForm,
  reset: ResetForm,
};

function SignedOut({ account }: Readonly<{ account: AccountStore }>) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const Form = FORMS[mode];
  return <Form account={account} email={email} setEmail={setEmail} setMode={setMode} />;
}

/** After a password reset, the old password is the only thing that can open the account key. */
function Locked({ account }: Readonly<{ account: AccountStore }>) {
  const [old, setOld] = useState("");
  return (
    <ActionForm
      label="Open my workspaces"
      note="Your password was reset, and your workspaces are still encrypted with the old one."
      action={async () => {
        try {
          await account.unlockWithOldPassword(old);
        } catch {
          throw new Error("That is not your old password.");
        }
      }}
      extra={
        <button type="button" className="account-back" onClick={() => void account.startOver()}>
          I can&apos;t remember it: delete my workspaces and start over
        </button>
      }
    >
      <Field label="Old password" value={old} onChange={setOld} type="password" />
    </ActionForm>
  );
}

function WorkspaceList({
  account,
  onOpen,
}: Readonly<{ account: AccountStore; onOpen: (contents: WorkspaceContents) => void }>) {
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
              void account.load(item.id).then(({ contents }) => onOpen(contents));
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
}: Readonly<{ account: AccountStore; onOpen: (contents: WorkspaceContents) => void }>) {
  const [name, setName] = useState(account.name);
  return (
    <>
      <p className="password-note">{account.email}</p>
      <ActionForm label="Save name" action={() => account.rename(name)}>
        <Field label="Your name" value={name} onChange={setName} />
      </ActionForm>
      <h3>Workspaces</h3>
      <WorkspaceList account={account} onOpen={onOpen} />
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
}: Readonly<{ account: AccountStore; onOpen: (contents: WorkspaceContents) => void }>) {
  useSyncExternalStore(account.subscribe, account.snapshot);
  const [open, setOpen] = useState(false);
  const signedIn = account.status === "in";
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
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
            {signedIn && (
              <SignedIn
                account={account}
                onOpen={(contents) => {
                  setOpen(false);
                  onOpen(contents);
                }}
              />
            )}
            {account.status === "locked" && <Locked account={account} />}
            {(account.status === "out" || account.status === "loading") && (
              <SignedOut account={account} />
            )}
          </section>
        </div>
      )}
    </>
  );
}
