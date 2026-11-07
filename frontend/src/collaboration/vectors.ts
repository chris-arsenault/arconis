import * as Y from "yjs";

const DIGEST_BYTES = 4;

/**
 * A deletion does not advance a Yjs state vector, so two peers with equal vectors can still differ.
 * A digest of the delete set lets them find that out without sending it. An update computed against
 * a document's own vector holds no structs, leaving exactly the delete set.
 */
function deletionDigest(doc: Y.Doc) {
  let hash = 0x811c9dc5;
  for (const byte of Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc)))
    hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

/** What a peer holds: its state vector, preceded by a digest of its deletions. */
export function encodeHoldings(doc: Y.Doc) {
  const vector = Y.encodeStateVector(doc);
  const data = new Uint8Array(DIGEST_BYTES + vector.length);
  new DataView(data.buffer).setUint32(0, deletionDigest(doc));
  data.set(vector, DIGEST_BYTES);
  return data;
}

function isAhead(vector: Map<number, number>, other: Map<number, number>) {
  for (const [client, clock] of vector) if (clock > (other.get(client) ?? 0)) return true;
  return false;
}

/** Compares a peer's holdings with this document. */
export function compareHoldings(doc: Y.Doc, data: Uint8Array) {
  const digest = new DataView(data.buffer, data.byteOffset).getUint32(0);
  const vector = data.subarray(DIGEST_BYTES);
  const theirs = Y.decodeStateVector(vector);
  const mine = Y.decodeStateVector(Y.encodeStateVector(doc));
  const deletionsDiffer = digest !== deletionDigest(doc);
  return {
    vector,
    /** This document holds something the peer lacks. */
    peerLacks: isAhead(mine, theirs) || deletionsDiffer,
    /** The peer holds something this document lacks. */
    weLack: isAhead(theirs, mine) || deletionsDiffer,
  };
}
