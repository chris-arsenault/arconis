export type ConnectionState = "connecting" | "online" | "offline" | "error";
export interface Transport {
  onMessage: (message: string) => void;
  onReady: () => void;
  onStatus: (state: ConnectionState, detail?: string) => void;
  connect(): void;
  send(message: string): void;
  close(): void;
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

export interface AppSyncConfig {
  transport: "appsync";
  appsyncHttp: string;
  appsyncRealtime: string;
  appsyncApiKey: string;
}
export type AppConfig = { transport: "local" } | AppSyncConfig;
type RuntimeConfiguration = AppConfig | undefined;
declare global {
  interface Window {
    __APP_CONFIG__: RuntimeConfiguration;
  }
}

export function readConfig(): AppConfig {
  const config = window.__APP_CONFIG__;
  if (!config) throw new Error("Application configuration could not be loaded. Reload this page.");
  if (config.transport !== "local" && config.transport !== "appsync")
    throw new Error("The configured collaboration service is not supported.");
  if (
    config.transport === "appsync" &&
    (!config.appsyncHttp || !config.appsyncRealtime || !config.appsyncApiKey)
  )
    throw new Error("The collaboration service configuration is incomplete.");
  return config;
}
