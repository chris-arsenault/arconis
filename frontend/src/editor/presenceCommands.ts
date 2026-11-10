import { roomHash } from "../collaboration/room";
import type { CommandDefinition as Command, CommandContext } from "./registry";
import { callEveryone, itemLink, openChat, peerStates, stopFollowing } from "./presence";
import { LASER_KEY } from "./laserInput";

/** Being together on the canvas: calling everyone over, following, pointing, chatting and linking. */

const inRoom = ({ editor }: CommandContext) => editor.room !== null;
const withPeers = (context: CommandContext) =>
  inRoom(context) && peerStates(context.editor.room!).length > 0;

export const PRESENCE_COMMANDS: Command[] = [
  {
    id: "presence.spotlight",
    label: "Bring everyone to me",
    help: "Show everyone else a banner with your name; each decides whether to follow you.",
    group: "view",
    keywords: ["spotlight", "call", "look here", "follow me"],
    when: withPeers,
    run: ({ editor }) => callEveryone(editor.room!),
  },
  {
    id: "presence.stopFollowing",
    label: "Stop following",
    help: "Stop your view tracking the person you are following.",
    group: "view",
    when: ({ editor }) => editor.ui.following !== null,
    run: ({ editor }) => stopFollowing(editor),
  },
  {
    id: "presence.laser",
    label: "Point with the laser (hold)",
    help: "While held, a fading trail in your colour follows your pointer on everyone's screen.",
    group: "view",
    shortcuts: [{ key: LASER_KEY }],
    native: true,
    keywords: ["pointer", "highlight for others"],
    when: inRoom,
    run: () => undefined,
  },
  {
    id: "presence.chat",
    label: "Say something beside your cursor",
    help: "Type a short message that shows under your name at your cursor for everyone here.",
    group: "view",
    shortcuts: [{ key: "/" }],
    keywords: ["cursor chat", "message"],
    when: inRoom,
    run: ({ editor }) => openChat(editor),
  },
  {
    id: "presence.copyLink",
    label: "Copy a link to this object",
    help: "Copy an address that opens this room at the selected object.",
    group: "edit",
    keywords: ["deep link", "share", "url"],
    when: (context) => inRoom(context) && context.selected.length === 1,
    run: ({ editor, selected }) => {
      const base = `${location.origin}${location.pathname}`;
      const link = itemLink(base, roomHash(editor.room!.id), selected[0].id);
      void navigator.clipboard?.writeText(link).catch(() => undefined);
      editor.room!.setNotice("Link copied. It opens this room at the object.");
    },
  },
];
