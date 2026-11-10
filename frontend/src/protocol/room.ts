/** Room addresses share one grammar across browser navigation and relay agent tools. */
export function parseRoom(value: string) {
  let candidate = value.trim();
  try {
    candidate = new URL(candidate).hash.slice(1);
  } catch {
    /* Raw room codes need no URL parsing. */
  }
  let prefix = "";
  if (candidate.startsWith("local=")) prefix = "local-";
  if (candidate.startsWith("locked=")) prefix = "locked-";
  candidate = candidate.replace(/^(room|local|locked)=/, "");
  const extra = candidate.search(/[&?]/);
  if (extra >= 0) candidate = candidate.slice(0, extra);
  return /^[a-f0-9]{48}$/.test(candidate) ? `${prefix}${candidate}` : null;
}
