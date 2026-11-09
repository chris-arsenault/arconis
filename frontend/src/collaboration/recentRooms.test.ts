import { expect, it } from "vitest";
import { recentRooms, rememberRoom } from "./recentRooms";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

it("keeps room addresses distinct, refreshes titles and orders by opening time", () => {
  const saved = storage();
  const first = "a".repeat(48);
  const second = `local-${"b".repeat(48)}`;
  rememberRoom(first, "Planning", 10, saved);
  rememberRoom(second, "Private scratch", 20, saved);
  rememberRoom(first, "Revised plan", 10, saved);
  expect(recentRooms(saved)).toEqual([
    { id: second, title: "Private scratch", openedAt: 20 },
    { id: first, title: "Revised plan", openedAt: 10 },
  ]);
});

it("does not copy password-room titles into the plaintext index", () => {
  const saved = storage();
  rememberRoom(`locked-${"c".repeat(48)}`, "Secret acquisition", 30, saved);
  expect(saved.getItem()).not.toContain("Secret acquisition");
  expect(recentRooms(saved)[0].title).toBe("Password room");
});

it("ignores malformed addresses and unavailable index storage", () => {
  expect(recentRooms(storage("not JSON"))).toEqual([]);
  expect(recentRooms(storage(JSON.stringify([{ id: "bad", title: "Bad", openedAt: 1 }])))).toEqual(
    []
  );
  const unavailable = {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
    setItem: () => {
      throw new Error("Storage unavailable");
    },
  };
  expect(() => rememberRoom("d".repeat(48), "Draft", 1, unavailable)).not.toThrow();
});
