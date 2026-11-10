import { ArrowRight, Shapes, StickyNote, GitBranch, Sparkles } from "lucide-react";
import { useState } from "react";
import { parseRoom } from "../protocol/room";
import { recentRooms } from "../collaboration/recentRooms";
import type { AccountStore } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { AccountButton } from "./AccountControls";
import { WorkBrowser } from "./WorkBrowser";

interface Props {
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onCreateLocal: () => void;
  onCreateLocked: () => void;
  onJoin: (id: string) => void;
  error: string;
  signedIn: boolean;
  account: AccountStore | null;
  onOpenSaved: (copy: SavedCopy) => void;
}

export function Welcome(props: Readonly<Props>) {
  const rooms = recentRooms();
  return (
    <main className="welcome">
      <div className="brand">
        <span className="brand-mark">
          <Shapes size={24} />
        </span>{" "}
        arconis
      </div>
      <section className="welcome-content">
        {rooms.length ? <h1>Your canvases</h1> : <WelcomeIntroduction />}
        <WorkBrowser account={props.account} onOpen={props.onOpenSaved} onJoin={props.onJoin} />
        <WelcomeForm {...props} />
        <p className="welcome-footnote">
          No account required. Share a link and start thinking together.
          <br />
          Your browser keeps a local copy. Use rooms for non-sensitive work.
        </p>
      </section>
      {!rooms.length && (
        <div className="welcome-art" aria-hidden="true">
          <div className="art-note">
            What if we
            <br />
            connected
            <br />
            <strong>the dots?</strong>
            <span>↗</span>
          </div>
          <div className="art-shape">a starting point</div>
          <div className="art-dot" />
        </div>
      )}
    </main>
  );
}

function WelcomeIntroduction() {
  return (
    <>
      <span className="eyebrow">
        <Sparkles size={15} /> A LITTLE SPACE FOR BIG IDEAS
      </span>
      <h1>
        Give your thinking
        <br />
        <em>room to grow.</em>
      </h1>
      <p>
        From the first sticky note to the whole system.
        <br />
        Draw, connect, and work it out together on one shared canvas.
      </p>
      <div className="welcome-tools">
        <span>
          <Shapes /> Diagrams
        </span>
        <span>
          <StickyNote /> Ideas
        </span>
        <span>
          <GitBranch /> Connections
        </span>
      </div>
    </>
  );
}

function WelcomeForm(props: Readonly<Props>) {
  const { name, onName, onCreate, onCreateLocal, onJoin, error } = props;
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const join = () => {
    const id = parseRoom(code);
    if (id) onJoin(id);
    else setJoinError("Paste the full room link or its 48-character code.");
  };
  return (
    <div className="welcome-card">
      {props.account && (
        <AccountButton account={props.account} onOpen={props.onOpenSaved} onJoin={props.onJoin} />
      )}
      {!props.signedIn && (
        <label>
          Your display name
          <input
            aria-label="Your display name"
            value={name}
            maxLength={40}
            onChange={(event) => onName(event.target.value)}
          />
        </label>
      )}
      <button className="primary" onClick={onCreate}>
        Create a room <ArrowRight size={18} />
      </button>
      <button type="button" className="welcome-local" onClick={onCreateLocal}>
        Work on this device only
      </button>
      <button type="button" className="welcome-local" onClick={props.onCreateLocked}>
        Create a password room
      </button>
      <div className="divider">or join a shared canvas</div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          join();
        }}
      >
        <input
          aria-label="Room link or code"
          placeholder="Paste a room link or code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit">Join room</button>
      </form>
      {(error || joinError) && (
        <p role="alert" className="error">
          {error || joinError}
        </p>
      )}
    </div>
  );
}
