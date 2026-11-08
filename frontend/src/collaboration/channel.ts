/** Status of the carrier, including a relay that can be asleep or at its budget limit. */
export type ConnectionState =
  "connecting" | "online" | "offline" | "error" | "starting" | "stopped" | "limit";

/**
 * A room's frame channel. The provider owns connect/close; composition owns status reporting.
 * Ready means frames may flow, which an encrypted channel delays until its key is open.
 */
export interface FrameChannel {
  onMessage: (message: string) => void;
  onReady: () => void;
  onStatus: (state: ConnectionState, detail?: string) => void;
  connect(): void;
  send(message: string): void;
  close(): void;
}
