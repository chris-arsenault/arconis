import type { AppSyncConfig, ConnectionState, Transport } from "./transport";

type ServerMessage = { type: string } & Partial<{
  id: string;
  event: string | string[];
  events: string[];
  connectionTimeoutMs: number;
  errors: { message: string }[];
  failed: { message: string }[];
}>;

export class AppSyncTransport implements Transport {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  private socket: WebSocket | null = null;
  private stopped = true;
  private ready = false;
  private retry = 0;
  private error = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private timeout = 60000;
  private subscription = crypto.randomUUID();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private queue: string[] = [];
  private online = () => {
    if (!this.stopped) this.connect();
  };
  private offline = () => {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.retire();
    this.onStatus("offline", "Offline; edits are saved on this device.");
  };

  constructor(
    private config: AppSyncConfig,
    private room: string
  ) {
    window.addEventListener("online", this.online);
    window.addEventListener("offline", this.offline);
  }
  private auth() {
    return {
      host: new URL(this.config.appsyncHttp!).host,
      "x-api-key": this.config.appsyncApiKey!,
    };
  }

  connect() {
    this.stopped = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (!navigator.onLine) {
      this.onStatus("offline", "Offline; edits are saved on this device.");
      return;
    }
    if (this.socket) return;
    this.onStatus("connecting");
    const header = btoa(JSON.stringify(this.auth()))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const socket = new WebSocket(this.config.appsyncRealtime!, [
      "aws-appsync-event-ws",
      `header-${header}`,
    ]);
    this.socket = socket;
    this.resetWatchdog();
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.write({ type: "connection_init" });
      this.resetWatchdog();
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      try {
        this.receive(JSON.parse(event.data) as ServerMessage);
      } catch {
        this.fail("The collaboration service sent an unreadable message.");
      }
    };
    socket.onerror = () => {
      if (this.socket === socket) this.disconnected();
    };
    socket.onclose = () => {
      if (this.socket === socket) this.disconnected();
    };
  }
  private write(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  private receive(message: ServerMessage) {
    const actions: Record<string, () => void> = {
      connection_ack: () => {
        this.timeout = message.connectionTimeoutMs || 60000;
        this.resetWatchdog();
        this.write({
          type: "subscribe",
          id: this.subscription,
          channel: `/rooms/${this.room}`,
          authorization: this.auth(),
        });
      },
      subscribe_success: () => {
        this.ready = true;
        this.error = "";
        this.retry = 0;
        this.onStatus("online");
        this.onReady();
      },
      data: () => this.receiveEvents(message),
      ka: () => this.resetWatchdog(),
      publish_success: () => this.published(message),
      publish_error: () => this.failMessage(message),
      subscribe_error: () => this.failMessage(message),
      connection_error: () => this.failMessage(message),
      broadcast_error: () => this.failMessage(message),
    };
    actions[message.type]?.();
  }
  private receiveEvents(message: ServerMessage) {
    if (typeof message.event === "string") this.onMessage(message.event);
    else message.event?.forEach(this.onMessage);
    message.events?.forEach(this.onMessage);
  }
  private published(message: ServerMessage) {
    const timer = this.pending.get(message.id!);
    if (timer) clearTimeout(timer);
    this.pending.delete(message.id!);
    if (message.failed?.length) this.failMessage(message);
  }
  private resetWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.disconnected(), this.timeout);
  }
  private failMessage(message: ServerMessage) {
    this.fail(
      message.errors?.map((error) => error.message).join("; ") ||
        "The collaboration service refused the request. Reload to refresh its configuration."
    );
  }
  private fail(detail: string) {
    this.error = detail;
    this.disconnected();
  }

  send(message: string) {
    if (!this.ready) return;
    this.queue.push(message);
    this.publishTimer ??= setTimeout(() => this.publishBatch(), 50);
  }
  private publishBatch() {
    this.publishTimer = null;
    if (!this.ready || !this.queue.length) return;
    const id = crypto.randomUUID();
    const events = this.queue.splice(0, 5);
    this.write({
      type: "publish",
      id,
      channel: `/rooms/${this.room}`,
      events,
      authorization: this.auth(),
    });
    this.pending.set(
      id,
      setTimeout(() => this.disconnected(), 15000)
    );
    if (this.queue.length) this.publishTimer = setTimeout(() => this.publishBatch(), 100);
  }
  private clearTimers() {
    this.pending.forEach(clearTimeout);
    this.pending.clear();
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.queue = [];
  }
  private retire() {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    this.clearTimers();
    socket?.close();
  }
  private disconnected() {
    this.retire();
    if (this.stopped) return;
    this.onStatus(
      this.error ? "error" : "offline",
      this.error || "Reconnecting; edits are saved on this device."
    );
    const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const delay = Math.min(30000, 500 * 2 ** this.retry++) * (0.7 + jitter * 0.6);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.retire();
    window.removeEventListener("online", this.online);
    window.removeEventListener("offline", this.offline);
  }
}
