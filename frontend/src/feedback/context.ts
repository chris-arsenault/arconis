import { isLocalRoom, isLockedRoom, type RoomSession } from "../collaboration/room";
import type { AccountStore } from "../account/accountStore";
import type { EditorController } from "../editor/controller";
import type { FeedbackMetadata } from "../protocol/feedback";

/** An explicit diagnostic projection; never serialize location.hash, credentials or room keys. */
export function feedbackContext(
  session: RoomSession,
  editor: EditorController,
  name: string,
  account: AccountStore | null
): FeedbackMetadata {
  let roomType: FeedbackMetadata["canvas"]["roomType"] = "ordinary";
  if (isLocalRoom(session.id)) roomType = "device";
  if (isLockedRoom(session.id)) roomType = "password";
  return {
    submittedAt: new Date().toISOString(),
    revision: (document.documentElement.dataset.revision ?? "unknown").slice(0, 100),
    page: `${location.origin}${location.pathname}`.slice(0, 500),
    reporter: {
      name: name.slice(0, 200),
      accountStatus: account?.status ?? "unavailable",
      accountEmail: account?.status === "in" ? account.email : null,
    },
    browser: {
      userAgent: navigator.userAgent.slice(0, 1000),
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
      online: navigator.onLine,
    },
    canvas: {
      roomId: session.id,
      roomType,
      title: session.document.title().slice(0, 500),
      connection: session.state,
      participants: session.provider.awareness.getStates().size,
      objects: session.document.list().length,
      selected: editor.selected().length,
      tool: editor.tool,
      drawingInstrument: editor.drawing.settings.mode,
      zoom: editor.graph.view.scale,
      layers: { active: editor.layers.active, hidden: [...editor.layers.hidden] },
    },
  };
}
