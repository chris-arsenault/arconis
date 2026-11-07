import type {
  ConnectionState,
  RelayStatus,
  Transport,
  UploadReply,
  UploadRequest,
} from "./transport";

/** How long to wait for a relay that said it is starting before reporting it off. */
export const START_DEADLINE_MS = 3 * 60_000;
const START_RETRY_MS = 3000;
const STOPPING_RETRY_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;
/** The relay sends a keepalive every 30 seconds; missing several means the path is dead. */
const WATCHDOG_MS = 100_000;

const OFFLINE_DETAIL = "Offline; edits are saved on this device.";
const OFF_DETAIL = "Collaboration is off; edits are saved on this device.";
const LIMIT_DETAIL = "Collaboration is off until next month; edits are saved on this device.";
const STARTING_DETAIL = "Collaboration is starting; edits are saved on this device.";

const UPLOAD_REPLY_MS = 15_000;

type ControlMessage =
  | { relay: "ka" }
  | { relay: "closing"; reason: string }
  | { relay: "upload-reply"; reply: UploadReply };

export class RelayTransport implements Transport {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  private socket: WebSocket | null = null;
  private uploads = new Map<string, (reply: UploadReply) => void>();
  private ready = false;
  private stopped = true;
  private retry = 0;
  /** Ask the relay to count this arrival as activity until one socket has opened. */
  private fresh = false;
  private startingSince: number | null = null;
  private statusChecked = false;
  private knownOff: "stopped" | "limit" | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private online = () => {
    if (!this.stopped) this.connect();
  };
  private offline = () => {
    this.clearReconnect();
    this.retire();
    this.onStatus("offline", OFFLINE_DETAIL);
  };

  constructor(
    private relayUrl: string,
    private room: string
  ) {
    window.addEventListener("online", this.online);
    window.addEventListener("offline", this.offline);
  }

  connect() {
    this.stopped = false;
    this.clearReconnect();
    if (!navigator.onLine) {
      this.onStatus("offline", OFFLINE_DETAIL);
      return;
    }
    if (this.socket) return;
    if (this.startingSince === null && !this.knownOff) this.onStatus("connecting");
    this.open();
  }

  private open() {
    const base = this.relayUrl.replace(/^http/, "ws");
    const query = this.fresh ? "?fresh=1" : "";
    const socket = new WebSocket(`${base}/rooms/${this.room}${query}`);
    this.socket = socket;
    this.resetWatchdog();
    socket.onopen = () => {
      if (this.socket === socket) this.opened();
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      this.resetWatchdog();
      this.receive(event.data);
    };
    socket.onerror = () => {
      if (this.socket === socket) this.disconnected();
    };
    socket.onclose = () => {
      if (this.socket === socket) this.disconnected();
    };
  }

  private opened() {
    this.ready = true;
    this.fresh = false;
    this.retry = 0;
    this.startingSince = null;
    this.statusChecked = false;
    this.knownOff = null;
    this.clearRestart();
    this.onStatus("online");
    this.onReady();
  }

  private receive(message: string) {
    if (!message.startsWith('{"relay"')) {
      this.onMessage(message);
      return;
    }
    const notice = JSON.parse(message) as ControlMessage;
    if (notice.relay === "closing") this.knownOff = notice.reason === "limit" ? "limit" : "stopped";
    if (notice.relay === "upload-reply") {
      this.uploads.get(notice.reply.hash)?.(notice.reply);
      this.uploads.delete(notice.reply.hash);
    }
  }

  /** Asks over the open socket. Fails when not connected, and the upload retries on reconnecting. */
  requestUpload(request: UploadRequest) {
    return new Promise<UploadReply>((resolve, reject) => {
      if (!this.ready) {
        reject(new Error("Not connected"));
        return;
      }
      const timer = setTimeout(() => {
        this.uploads.delete(request.hash);
        reject(new Error("No reply"));
      }, UPLOAD_REPLY_MS);
      this.uploads.set(request.hash, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      this.send(JSON.stringify({ relay: "upload", request }));
    });
  }

  /** Marks this arrival as activity: a room being created, or a local copy being loaded. */
  markFresh() {
    this.fresh = true;
  }

  /** Asks the relay to start. The control service enforces the monthly limit. */
  start() {
    this.startingSince ??= Date.now();
    this.knownOff = null;
    this.statusChecked = false;
    this.clearRestart();
    void this.requestStart();
  }

  private async requestStart() {
    try {
      this.applyStart(await this.control("start", "POST"));
    } catch {
      this.startingSince = null;
      if (!this.ready)
        this.onStatus(
          "error",
          "Collaboration could not be started; edits are saved on this device."
        );
    }
  }

  private applyStart(status: RelayStatus) {
    if (this.ready) {
      this.startingSince = null;
      return;
    }
    if (status === "limit") {
      this.startingSince = null;
      this.showOff("limit");
      return;
    }
    if (status === "stopping")
      this.restartTimer = setTimeout(() => void this.requestStart(), STOPPING_RETRY_MS);
    // A running relay normally answers the socket already on its way, with nothing to announce.
    if (status !== "running") this.onStatus("starting", STARTING_DETAIL);
    this.retry = 0;
    this.scheduleReconnect(START_RETRY_MS);
  }

  private async control(action: "start" | "status", method: string) {
    const response = await fetch(`${this.relayUrl}/control/${action}`, { method });
    if (!response.ok) throw new Error(`Control request failed: ${response.status}`);
    return ((await response.json()) as { status: RelayStatus }).status;
  }

  private showOff(status: "stopped" | "limit") {
    this.knownOff = status;
    this.onStatus(status, status === "limit" ? LIMIT_DETAIL : OFF_DETAIL);
  }

  private resetWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.disconnected(), WATCHDOG_MS);
  }

  send(message: string) {
    if (this.ready && this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
  }

  private retire() {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    if (this.watchdog) clearTimeout(this.watchdog);
    socket?.close();
  }

  private disconnected() {
    this.retire();
    if (this.stopped) return;
    if (this.startingSince !== null && Date.now() - this.startingSince > START_DEADLINE_MS)
      this.startingSince = null;
    if (this.startingSince !== null) {
      this.onStatus("starting", STARTING_DETAIL);
      this.scheduleReconnect(START_RETRY_MS);
      return;
    }
    if (this.knownOff) this.showOff(this.knownOff);
    else if (!this.statusChecked) void this.checkStatus();
    this.scheduleReconnect(this.backoff());
  }

  /** Looks once per outage, so a tab left open never polls the control service. */
  private async checkStatus() {
    this.statusChecked = true;
    let status: RelayStatus;
    try {
      status = await this.control("status", "GET");
    } catch {
      this.onStatus("offline", "Reconnecting; edits are saved on this device.");
      return;
    }
    if (this.ready || this.startingSince !== null) return;
    if (status === "limit") this.showOff("limit");
    else if (status === "starting") this.onStatus("starting", STARTING_DETAIL);
    else if (status === "running")
      this.onStatus("offline", "Reconnecting; edits are saved on this device.");
    else this.showOff("stopped");
  }

  private backoff() {
    const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    return Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.retry++) * (0.7 + jitter * 0.6);
  }

  private scheduleReconnect(delay: number) {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  close() {
    this.stopped = true;
    this.clearReconnect();
    this.clearRestart();
    this.retire();
    window.removeEventListener("online", this.online);
    window.removeEventListener("offline", this.offline);
  }
}
