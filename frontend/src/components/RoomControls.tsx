import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Plus, LogIn, X, Copy, Check } from "lucide-react";
import { parseRoom } from "../collaboration/room";

interface Props {
  onCreate: () => void;
  onJoin: (id: string) => void;
  name: string;
  onName: (name: string) => void;
}

export function RoomControls(props: Readonly<Props>) {
  const [dialog, setDialog] = useState("");
  const closeDialog = useCallback(() => setDialog(""), []);
  return (
    <>
      <button
        className="icon-button"
        aria-label="Create another room"
        title="New room"
        onClick={props.onCreate}
      >
        <Plus size={18} />
      </button>
      <button
        className="icon-button"
        aria-label="Join another room"
        title="Join room"
        onClick={() => setDialog("join")}
      >
        <LogIn size={18} />
      </button>
      <button className="primary share-button" onClick={() => setDialog("share")}>
        <Link2 size={16} /> Share room
      </button>
      {dialog && <RoomDialog {...props} mode={dialog} onClose={closeDialog} />}
    </>
  );
}

function RoomDialog({
  mode,
  onClose,
  ...props
}: Readonly<Props & { mode: string; onClose: () => void }>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = [...ref.current!.querySelectorAll<HTMLElement>("button, input")];
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      event.preventDefault();
      elements[next].focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-dialog-title"
      >
        <button className="close-dialog icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
        <h2 id="room-dialog-title">{mode === "share" ? "Share this room" : "Join a room"}</h2>
        <label>
          Your display name
          <input
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
            maxLength={40}
          />
        </label>
        {mode === "share" ? (
          <ShareLink />
        ) : (
          <JoinRoom
            onJoin={(id) => {
              props.onJoin(id);
              onClose();
            }}
          />
        )}
      </section>
    </div>
  );
}

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      setError("Select and copy the room link below.");
    }
  };
  return (
    <>
      <p>
        Anyone with this link can join and edit. Keep a participant online for new devices to
        receive the canvas.
      </p>
      <input
        aria-label="Shareable room link"
        readOnly
        value={location.href}
        onFocus={(event) => event.target.select()}
      />
      <button className="primary" onClick={() => void copy()}>
        {copied ? <Check size={17} /> : <Copy size={17} />}
        {copied ? "Copied" : "Copy room link"}
      </button>
      <p className="muted">
        Anonymous rooms are intended for non-sensitive work. Export a file to keep a portable copy.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function JoinRoom({ onJoin }: Readonly<{ onJoin: (id: string) => void }>) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const id = parseRoom(code);
        if (id) onJoin(id);
        else setError("Paste the full room link or its 48-character code.");
      }}
    >
      <input
        aria-label="Room link or code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Room link or code"
      />
      <button className="primary">Join room</button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
