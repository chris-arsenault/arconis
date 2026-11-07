/**
 * starting: the relay was asked to start and is booting. stopped: the relay is off because nobody
 * needs it. limit: the relay is off until next month's budget.
 */
export type ConnectionState =
  "connecting" | "online" | "offline" | "error" | "starting" | "stopped" | "limit";
/** What the relay's control service reports. */
export type RelayStatus = "running" | "starting" | "stopped" | "stopping" | "limit";
/** Asks for permission to put a picture's bytes in shared storage. */
export interface UploadRequest {
  hash: string;
  type: string;
  size: number;
  checksum: string;
}
export type UploadReply =
  | { status: "upload"; hash: string; url: string }
  | { status: "stored"; hash: string }
  | { status: "refused"; hash: string; reason: "limit" | "invalid" | "unavailable" };
export interface Transport {
  onMessage: (message: string) => void;
  onReady: () => void;
  onStatus: (state: ConnectionState, detail?: string) => void;
  connect(): void;
  send(message: string): void;
  close(): void;
  /** Present when the service behind this transport can be off and asked to start. */
  start?(): void;
  /** Counts this arrival as activity once connected. */
  markFresh?(): void;
  /** Present when the room has shared picture storage. */
  requestUpload?(request: UploadRequest): Promise<UploadReply>;
}

export class LocalTransport implements Transport {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  private channel: BroadcastChannel | null = null;
  constructor(private room: string) {}
  connect() {
    this.channel = new BroadcastChannel(`arconis:${this.room}`);
    this.channel.onmessage = (event: MessageEvent<string>) => this.onMessage(event.data);
    this.onStatus("online", "Local browser collaboration");
    this.onReady();
  }
  send(message: string) {
    this.channel?.postMessage(message);
  }
  close() {
    this.channel?.close();
    this.channel = null;
  }
}

export interface RelayConfig {
  transport: "relay";
  /** http or https base; sockets use the matching ws scheme, control requests use it directly. */
  relayUrl: string;
}
export type AppConfig = { transport: "local" } | RelayConfig;
type RuntimeConfiguration = AppConfig | undefined;
declare global {
  interface Window {
    __APP_CONFIG__: RuntimeConfiguration;
  }
}

export function readConfig(): AppConfig {
  const config = window.__APP_CONFIG__;
  if (!config) throw new Error("Application configuration could not be loaded. Reload this page.");
  if (config.transport !== "local" && config.transport !== "relay")
    throw new Error("The configured collaboration service is not supported.");
  if (config.transport === "relay" && !config.relayUrl)
    throw new Error("The collaboration service configuration is incomplete.");
  return config;
}
