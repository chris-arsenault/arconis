import { useEffect, useRef, useState } from "react";
import { Eye, Megaphone, X } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import {
  callEveryone,
  closeChat,
  dismissSpotlight,
  followPeer,
  freshSpotlights,
  liveLaser,
  peerStates,
  sendChat,
  stopFollowing,
  type PeerState,
} from "../editor/presence";
import { worldBounds } from "../document/relations";

function toScreen(editor: EditorController, point: { x: number; y: number }) {
  const { scale, translate } = editor.graph.view;
  return { x: (point.x + translate.x) * scale, y: (point.y + translate.y) * scale };
}

/** A laser trail as a fading line, in a participant's colour. */
export function LaserTrail({
  editor,
  points,
  color,
}: Readonly<{ editor: EditorController; points: PeerState["laser"]; color: string }>) {
  const [, tick] = useState(0);
  const live = liveLaser(points);
  useEffect(() => {
    if (!live.length) return;
    const timer = setInterval(() => tick((n) => n + 1), 60);
    return () => clearInterval(timer);
  }, [live.length]);
  if (live.length < 2) return null;
  const screen = live.map((point) => toScreen(editor, point));
  return (
    <svg className="laser" data-testid="laser">
      <polyline
        points={screen.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The line this person is saying beside their cursor, until Escape or an empty send. */
function CursorChat({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const close = () => closeChat(editor, session);
  const at = editor.pointer ? editor.worldPoint(editor.pointer) : null;
  const screen = at ? toScreen(editor, at) : { x: 24, y: 24 };
  useEffect(() => {
    if (input.current)
      Object.assign(input.current.style, { left: `${screen.x + 16}px`, top: `${screen.y + 20}px` });
  }, [screen.x, screen.y]);
  return (
    <input
      ref={input}
      className="cursor-chat"
      aria-label="Say something beside your cursor"
      placeholder="Say something"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        sendChat(session, event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && !text)) close();
        else if (event.key === "Enter") {
          setText("");
          sendChat(session, "");
        }
        event.stopPropagation();
      }}
      onBlur={close}
    />
  );
}

function FollowingPill({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  const target = editor.ui.following;
  if (target === null) return null;
  const state = session.provider.awareness.getStates().get(target) as PeerState | undefined;
  return (
    <div className="following-pill" data-testid="following">
      <Eye size={14} /> Following {state?.user?.name ?? "someone"}
      <button
        className="icon-action"
        aria-label="Stop following"
        onClick={() => stopFollowing(editor)}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** A call to look at someone's view: follow it, or let it pass. */
function SpotlightBanner({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(timer);
  }, []);
  const calls = freshSpotlights(peerStates(session)).filter(
    ([, state]) => !editor.ui.dismissedSpotlights.includes(state.spotlight!.at)
  );
  const call = calls[0];
  if (!call || editor.ui.following === call[0]) return null;
  const [clientId, state] = call;
  const dismiss = () => dismissSpotlight(editor, state.spotlight!.at);
  return (
    <div className="spotlight-banner" role="status" data-testid="spotlight">
      <Megaphone size={14} /> {state.user?.name ?? "Someone"} asks everyone to look at their view
      <button className="primary" onClick={() => followPeer(editor, session, clientId)}>
        Follow
      </button>
      <button onClick={dismiss}>Not now</button>
    </div>
  );
}

/** A brief ring around an item that a link or a find led to. */
function Pulse({ editor }: Readonly<{ editor: EditorController }>) {
  const id = editor.ui.pulse;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      editor.ui.pulse = null;
      editor.emit();
    }, 1500);
    return () => clearTimeout(timer);
  }, [editor, id]);
  useEffect(() => {
    const item = id ? editor.document.get(id) : null;
    const box = item ? worldBounds([item]) : null;
    if (!ref.current || !box) return;
    const { scale, translate } = editor.graph.view;
    Object.assign(ref.current.style, {
      left: `${(box.x + translate.x) * scale}px`,
      top: `${(box.y + translate.y) * scale}px`,
      width: `${box.width * scale}px`,
      height: `${box.height * scale}px`,
    });
  });
  if (!id) return null;
  return <div ref={ref} key={id} className="find-pulse" data-testid="find-pulse" />;
}

/** This person's own presence chrome: their laser, chat line, following state and incoming calls. */
export function PresenceOverlays({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  const own = session.provider.awareness.getLocalState() as PeerState | null;
  return (
    <>
      <LaserTrail editor={editor} points={editor.ui.laser} color={own?.user?.color ?? "#7863d4"} />
      {editor.ui.chat && <CursorChat editor={editor} session={session} />}
      <FollowingPill editor={editor} session={session} />
      <SpotlightBanner editor={editor} session={session} />
      <Pulse editor={editor} />
    </>
  );
}

function ParticipantDot({ color }: Readonly<{ color: string | undefined }>) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.style.background = color ?? "#7863d4";
  }, [color]);
  return <span ref={ref} className="participant-dot" />;
}

/** Who is here, with a way to follow each and to call everyone over. */
export function Participants({
  editor,
  session,
  onEditName,
  onClose,
}: Readonly<{
  editor: EditorController | null;
  session: RoomSession;
  onEditName: () => void;
  onClose: () => void;
}>) {
  const peers = peerStates(session);
  const own = session.provider.awareness.getLocalState() as PeerState | null;
  return (
    <div className="participants" role="dialog" aria-label="Participants">
      <ul>
        <li>
          <ParticipantDot color={own?.user?.color} />
          {own?.user?.name ?? "You"} (you)
          <button className="text-action" onClick={onEditName}>
            Change your name
          </button>
        </li>
        {peers.map(([clientId, state]) => (
          <li key={clientId}>
            <ParticipantDot color={state.user?.color} />
            {state.user?.name ?? "Guest"}
            {editor && (
              <button
                className="text-action"
                aria-label={`Follow ${state.user?.name ?? "Guest"}`}
                onClick={() => {
                  followPeer(editor, session, clientId);
                  onClose();
                }}
              >
                <Eye size={13} /> Follow
              </button>
            )}
          </li>
        ))}
      </ul>
      {peers.length > 0 && (
        <button
          className="text-action"
          onClick={() => {
            callEveryone(session);
            onClose();
          }}
        >
          <Megaphone size={13} /> Bring everyone to me
        </button>
      )}
    </div>
  );
}
