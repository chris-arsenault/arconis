import * as Y from "yjs";

/** Old rooms retain holder ids and contents while joining the ordinary panel representation. */
export function upgradeDrawingHolders(
  items: Y.Map<Y.Map<unknown>>,
  events: readonly {
    path: (string | number)[];
    changes: { keys: Map<string, unknown> };
  }[]
) {
  const ids = new Set(
    events.flatMap((event) =>
      typeof event.path[0] === "string" ? [event.path[0]] : [...event.changes.keys.keys()]
    )
  );
  const legacy = [...ids]
    .map((id) => items.get(id))
    .filter((record) => record?.get("type") === "sketch");
  if (!legacy.length) return;
  items.doc!.transact(() => {
    for (const record of legacy) {
      if (!record) continue;
      record.set("type", "frame");
      record.set("scaleContents", true);
      const look = record.get("look");
      if (look instanceof Y.Map) {
        if (!look.has("fill")) look.set("fill", "none");
        if (!look.has("title")) look.set("title", "top");
      }
    }
  });
}
