import { describe, expect, it } from "vitest";
import { roomHash } from "../collaboration/room";
import { parseRoom } from "../protocol/room";
import {
  LASER_FADE_MS,
  SPOTLIGHT_WINDOW_MS,
  extendLaser,
  freshSpotlights,
  itemInHash,
  itemLink,
  liveLaser,
  readPeerState,
  type PeerState,
} from "./presence";

describe("presence helpers", () => {
  it("keeps a laser trail short and fresh", () => {
    let trail: PeerState["laser"] = [];
    for (let index = 0; index < 40; index++)
      trail = extendLaser(trail, { x: index, y: 0 }, 1000 + index);
    expect(trail).toHaveLength(24);
    expect(trail.at(-1)).toMatchObject({ x: 39 });
    expect(liveLaser(trail, 1039 + LASER_FADE_MS + 1)).toEqual([]);
    expect(liveLaser(trail, 1039 + 10)).toHaveLength(24);
  });

  it("answers only recent calls to follow, newest first", () => {
    const peers: [number, PeerState][] = [
      [1, readPeerState({ spotlight: { at: 1000 } })],
      [2, readPeerState({ spotlight: { at: 5000 } })],
      [3, readPeerState({})],
      [4, readPeerState({ spotlight: { at: 5000 - SPOTLIGHT_WINDOW_MS - 1 } })],
    ];
    expect(freshSpotlights(peers, 6000).map(([id]) => id)).toEqual([2, 1]);
    expect(freshSpotlights(peers, 5000 + SPOTLIGHT_WINDOW_MS + 1)).toEqual([]);
  });

  it("builds links that open a room at an item, which the room parser still reads", () => {
    const room = `${"a".repeat(48)}`;
    const link = itemLink("https://arconis.test/", roomHash(room), "api-1");
    expect(link).toBe(`https://arconis.test/#room=${room}&item=api-1`);
    expect(parseRoom(link)).toBe(room);
    expect(itemInHash(new URL(link).hash)).toBe("api-1");
    expect(itemInHash(`#room=${room}`)).toBeNull();
  });
});
