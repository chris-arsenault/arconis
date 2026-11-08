import { roomHash } from "../collaboration/room";
import type { Command, CommandContext } from "./registry";
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
    group: "view",
    keywords: ["spotlight", "call", "look here", "follow me"],
    when: withPeers,
    run: ({ editor }) => callEveryone(editor.room!),
  },
  {
    id: "presence.stopFollowing",
    label: "Stop following",
    group: "view",
    when: ({ editor }) => editor.ui.following !== null,
    run: ({ editor }) => stopFollowing(editor),
  },
  {
    id: "presence.laser",
    label: "Point with the laser (hold)",
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
    group: "view",
    shortcuts: [{ key: "/" }],
    keywords: ["cursor chat", "message"],
    when: inRoom,
    run: ({ editor }) => openChat(editor),
  },
  {
    id: "presence.copyLink",
    label: "Copy a link to this object",
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
