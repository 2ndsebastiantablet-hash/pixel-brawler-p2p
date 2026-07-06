import {
  decodePlayerStatePacket,
  isCombatEventPacket,
  isSignalDataMessage,
  isStatePacket,
  type CombatEventPacket,
  type PlayerNetState,
  type PlayerStatePacket,
  type SignalMessage,
} from "./NetTypes";
import { SignalingClient } from "./SignalingClient";
import type { PlayerProfile } from "../ui/Profile";

export type ConnectionStatus =
  | "Offline"
  | "Creating room"
  | "Waiting for peer"
  | "Connecting"
  | "Connected"
  | "Disconnected / failed";

interface WebRTCHandlers {
  onStatus: (status: ConnectionStatus) => void;
  onRemoteState: (state: PlayerNetState) => void;
  onCombatEvent: (event: CombatEventPacket) => void;
  onPeerLeft: (peerId: string) => void;
  onLobby: (message: Extract<SignalMessage, { type: "lobby" }>) => void;
  onKicked: (reason: string) => void;
  onBanned: (reason: string) => void;
  onServerClosed: (reason: string) => void;
  onAfkWarning: (message: string) => void;
}

export class WebRTCClient {
  readonly peerId = createPeerId();
  private signalingSocket: WebSocket | null = null;
  private isHost = false;
  private readonly manuallyClosingSockets = new WeakSet<WebSocket>();
  private connecting = false;

  constructor(
    private readonly signaling: SignalingClient,
    private readonly profile: PlayerProfile,
    private readonly handlers: WebRTCHandlers,
  ) {}

  async host(roomCode: string): Promise<void> {
    this.isHost = true;
    this.handlers.onStatus("Waiting for peer");
    await this.connectSignaling(roomCode);
  }

  async join(roomCode: string): Promise<void> {
    this.isHost = false;
    this.handlers.onStatus("Connecting");
    await this.connectSignaling(roomCode);
  }

  sendPlayerState(packet: PlayerStatePacket): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify({ type: "data", packet }));
    }
  }

  sendCombatEvent(packet: CombatEventPacket): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify({ type: "data", packet }));
    }
  }

  kickPeer(peerId: string): void {
    this.sendSignal({ type: "kick", targetPeerId: peerId, reason: "Kicked by host" });
  }

  banPeer(clientId: string): void {
    this.sendSignal({ type: "ban", targetClientId: clientId, reason: "Banned by host" });
  }

  closeServer(): void {
    this.sendSignal({ type: "server-closed", reason: "Server closed by host" });
    this.close();
  }

  close(): void {
    if (this.signalingSocket) {
      this.manuallyClosingSockets.add(this.signalingSocket);
      this.signalingSocket.close();
    }
    this.signalingSocket = null;
    this.isHost = false;
    this.connecting = false;
    this.handlers.onStatus("Offline");
  }

  private async connectSignaling(roomCode: string): Promise<void> {
    this.connecting = true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const socketUrl = this.signaling.roomWebSocketUrl(roomCode, this.peerId, this.profile);
      try {
        await this.openSignalingSocket(roomCode);
        this.connecting = false;
        return;
      } catch (error) {
        console.warn(`Could not connect to signaling server at ${socketUrl} (attempt ${attempt + 1}/2)`, error);
        this.cleanupFailedSocket();
        if (attempt === 0) {
          await delay(450);
        }
      }
    }
    this.connecting = false;
    throw new Error("Could not connect to signaling server. Try refreshing or rejoining.");
  }

  private async openSignalingSocket(roomCode: string): Promise<void> {
    const socket = this.signaling.connect(roomCode, this.peerId, this.profile, (message) => {
      void this.handleSignal(message);
    });
    this.signalingSocket = socket;

    socket.addEventListener("close", () => {
      if (this.manuallyClosingSockets.has(socket)) {
        return;
      }
      if (!this.connecting) {
        this.handlers.onStatus("Disconnected / failed");
      }
    });
    socket.addEventListener("error", () => {
      if (!this.connecting) {
        this.handlers.onStatus("Disconnected / failed");
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to signaling server. Try refreshing or rejoining.")), { once: true });
      socket.addEventListener("close", () => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error("Could not connect to signaling server. Try refreshing or rejoining."));
        }
      }, { once: true });
    });
  }

  private cleanupFailedSocket(): void {
    const socket = this.signalingSocket;
    this.signalingSocket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      this.manuallyClosingSockets.add(socket);
      socket.close();
    }
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (message.type === "kick") {
      if (!message.targetPeerId || message.targetPeerId === this.peerId || message.targetClientId === this.profile.clientId) {
        const reason = message.reason ?? "Kicked by host";
        this.close();
        this.handlers.onKicked(reason);
      }
      return;
    }
    if (message.type === "ban") {
      if (!message.targetClientId || message.targetClientId === this.profile.clientId || message.targetPeerId === this.peerId) {
        const reason = message.reason ?? "Banned by host";
        this.close();
        this.handlers.onBanned(reason);
      }
      return;
    }
    if (message.type === "server-closed") {
      const reason = message.reason ?? "Server closed";
      this.close();
      this.handlers.onServerClosed(reason);
      return;
    }
    if (message.type === "afk-warning") {
      this.handlers.onAfkWarning(message.message);
      return;
    }

    try {
      if (isSignalDataMessage(message)) {
        if (isStatePacket(message.packet)) {
          this.handlers.onRemoteState(decodePlayerStatePacket(message.packet));
        } else if (isCombatEventPacket(message.packet)) {
          this.handlers.onCombatEvent(message.packet);
        }
      } else if (message.type === "lobby") {
        const peerCount = message.peers.length;
        this.handlers.onLobby(message);
        this.handlers.onStatus(peerCount >= 2 ? "Connected" : "Waiting for peer");
      } else if (message.type === "peer-left") {
        this.handlers.onPeerLeft(message.peerId);
        this.handlers.onStatus(this.isHost ? "Waiting for peer" : "Connected");
      } else if (message.type === "error") {
        console.warn("Signaling error:", message.message);
        this.handlers.onStatus("Disconnected / failed");
      }
    } catch (error) {
      console.warn("WebRTC signaling failed", error);
      this.handlers.onStatus("Disconnected / failed");
    }
  }

  private sendSignal(message: Exclude<SignalMessage, { type: "lobby" | "peer-left" | "error" }>): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify(message));
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2, 12)}`;
}
