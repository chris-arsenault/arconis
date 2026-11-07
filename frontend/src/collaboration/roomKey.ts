import { fromBase64, toBase64 } from "lib0/buffer";

/**
 * Envelope encryption for password rooms. A random room key encrypts everything, and the password
 * only wraps that key, so changing the password rewraps the key rather than the document. Everything
 * happens in the browser; no server ever holds a key or a password.
 */
const ITERATIONS = 600_000;
/** An envelope comes from a peer, so its work factor is bounded in both directions. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const IV_BYTES = 12;
const PROOF = new TextEncoder().encode("arconis room key");

export interface Envelope {
  salt: string;
  iterations: number;
  wrapped: string;
  /** The fixed text under the room key, so a holder can tell a real envelope from a planted one. */
  proof: string;
  /** Larger replaces smaller, so a changed password spreads to peers. */
  revision: number;
}

export class WrongPassword extends Error {}

function buffer(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

/** Encrypts with a fresh nonce, which travels in front of the result. */
export async function seal(key: CryptoKey, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer(bytes))
  );
  const result = new Uint8Array(IV_BYTES + sealed.length);
  result.set(iv);
  result.set(sealed, IV_BYTES);
  return result;
}

/** Decrypts and authenticates, and throws on anything altered or sealed under another key. */
export async function unseal(key: CryptoKey, sealed: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buffer(sealed.subarray(0, IV_BYTES)) },
      key,
      buffer(sealed.subarray(IV_BYTES))
    )
  );
}

export function generateRoomKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function passwordKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createEnvelope(
  password: string,
  roomKey: CryptoKey,
  revision: number
): Promise<Envelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapping = await passwordKey(password, salt, ITERATIONS);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", roomKey));
  return {
    salt: toBase64(salt),
    iterations: ITERATIONS,
    wrapped: toBase64(await seal(wrapping, raw)),
    proof: toBase64(await seal(roomKey, PROOF)),
    revision,
  };
}

/** Recovers the room key, or throws WrongPassword. */
export async function openEnvelope(password: string, envelope: Envelope) {
  const wrapping = await passwordKey(password, fromBase64(envelope.salt), envelope.iterations);
  try {
    const raw = await unseal(wrapping, fromBase64(envelope.wrapped));
    return await crypto.subtle.importKey("raw", buffer(raw), "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw new WrongPassword();
  }
}

/** True when an envelope really came from someone holding this room's key. */
export async function envelopeMatches(roomKey: CryptoKey, envelope: Envelope) {
  try {
    await unseal(roomKey, fromBase64(envelope.proof));
    return true;
  } catch {
    return false;
  }
}

/** Reads an envelope from a peer or from storage, ignoring anything malformed. */
export function parseEnvelope(value: unknown): Envelope | null {
  try {
    const envelope = (typeof value === "string" ? JSON.parse(value) : value) as Envelope;
    const strings = [envelope.salt, envelope.wrapped, envelope.proof];
    const valid =
      strings.every((field) => typeof field === "string") &&
      Number.isInteger(envelope.revision) &&
      Number.isInteger(envelope.iterations) &&
      envelope.iterations >= MIN_ITERATIONS &&
      envelope.iterations <= MAX_ITERATIONS;
    return valid ? envelope : null;
  } catch {
    return null;
  }
}
