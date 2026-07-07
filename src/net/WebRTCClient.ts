import {
  decodePlayerStatePacket,
  isCombatEventPacket,
  isSignalDataMessage,
  isStatePacket,
  type CombatEventPacket,
  type PeerInfo,
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

export interface WebRTCDebugSnapshot {
  webSocketStatus: string;
  peerStatus: Record<string, string>;
  dataChannels: Record<string, RTCDataChannelState | "missing">;
  connectedPeerCount: number;
  relayFallbackPeerCount: number;
}

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

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  offerStarted: boolean;
}

const dataChannelLabel = "game-state";
const fallbackPeerColor = "#18dff5";

export class WebRTCClient {
  readonly peerId = createPeerId();
  private signalingSocket: WebSocket | null = null;
  private isHost = false;
  private readonly manuallyClosingSockets = new WeakSet<WebSocket>();
  private readonly peers = new Map<string, PeerConnection>();
  private connecting = false;
  private activeRoomCode = "";
  private webSocketStatus = "closed";

  constructor(
    private readonly signaling: SignalingClient,
    private readonly profile: PlayerProfile,
    private readonly handlers: WebRTCHandlers,
  ) {}

  async host(roomCode: string): Promise<void> {
    this.isHost = true;
    this.setStatus("Waiting for peer");
    await this.connectSignaling(roomCode);
  }

  async join(roomCode: string): Promise<void> {
    this.isHost = false;
    this.setStatus("Connecting");
    await this.connectSignaling(roomCode);
  }

  sendPlayerState(packet: PlayerStatePacket): void {
    this.sendPacket(packet);
  }

  sendCombatEvent(packet: CombatEventPacket): void {
    this.sendPacket(packet);
  }

  kickPeer(peerId: string): void {
    this.sendSignal({ type: "kick", targetPeerId: peerId, reason: "You were kicked from the server." });
  }

  banPeer(clientId: string): void {
    this.sendSignal({ type: "ban", targetClientId: clientId, reason: "Banned by host" });
  }

  closeServer(): void {
    this.sendSignal({ type: "server-closed", reason: "Host left. Server closed." });
    this.close();
  }

  close(): void {
    if (this.signalingSocket) {
      this.manuallyClosingSockets.add(this.signalingSocket);
      this.signalingSocket.close();
    }
    this.signalingSocket = null;
    this.webSocketStatus = "closed";
    for (const peer of this.peers.values()) {
      peer.dataChannel?.close();
      peer.connection.close();
    }
    this.peers.clear();
    this.isHost = false;
    this.connecting = false;
    this.setStatus("Offline");
  }

  getDebugSnapshot(): WebRTCDebugSnapshot {
    const peerStatus: Record<string, string> = {};
    const dataChannels: Record<string, RTCDataChannelState | "missing"> = {};
    let connectedPeerCount = 0;
    let relayFallbackPeerCount = 0;

    for (const [peerId, peer] of this.peers) {
      peerStatus[peerId] = peer.connection.connectionState;
      dataChannels[peerId] = peer.dataChannel?.readyState ?? "missing";
      if (peer.dataChannel?.readyState === "open") {
        connectedPeerCount += 1;
      } else {
        relayFallbackPeerCount += 1;
      }
    }

    return {
      webSocketStatus: this.webSocketStatus,
      peerStatus,
      dataChannels,
      connectedPeerCount,
      relayFallbackPeerCount,
    };
  }

  private async connectSignaling(roomCode: string): Promise<void> {
    this.activeRoomCode = roomCode;
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
    this.webSocketStatus = "connecting";

    socket.addEventListener("close", () => {
      this.webSocketStatus = "closed";
      if (this.manuallyClosingSockets.has(socket)) {
        return;
      }
      if (!this.connecting) {
        this.setStatus("Disconnected / failed");
      }
    });
    socket.addEventListener("error", () => {
      this.webSocketStatus = "error";
      if (!this.connecting) {
        this.setStatus("Disconnected / failed");
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        this.webSocketStatus = "open";
        resolve();
      }, { once: true });
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
    this.webSocketStatus = "closed";
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      this.manuallyClosingSockets.add(socket);
      socket.close();
    }
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (message.type === "kick") {
      if (!message.targetPeerId || message.targetPeerId === this.peerId || message.targetClientId === this.profile.clientId) {
        const reason = message.reason ?? "You were kicked from the server.";
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
      const reason = message.reason ?? "Host left. Server closed.";
      this.close();
      this.handlers.onServerClosed(reason);
      return;
    }
    if (message.type === "afk-warning") {
      this.handlers.onAfkWarning(message.message);
      return;
    }

    try {
      if (message.type === "offer") {
        await this.handleOffer(message);
      } else if (message.type === "answer") {
        await this.handleAnswer(message);
      } else if (message.type === "ice") {
        await this.handleIce(message);
      } else if (isSignalDataMessage(message)) {
        this.handleDataPacket(message.packet, message.from, message.targetPeerId);
      } else if (message.type === "lobby") {
        const lobby = this.normalizeLobbyMessage(message);
        this.ensureLobbyPeerConnections(lobby.peers);
        this.handlers.onLobby(lobby);
        this.setStatus(lobby.peers.length >= 2 ? "Connected" : "Waiting for peer");
      } else if (message.type === "peer-left") {
        this.removePeerConnection(message.peerId);
        this.handlers.onPeerLeft(message.peerId);
        this.setStatus(this.isHost ? "Waiting for peer" : "Connected");
      } else if (message.type === "error") {
        console.warn("Signaling error:", message.message);
        this.setStatus("Disconnected / failed");
      }
    } catch (error) {
      console.warn("WebRTC signaling failed", error);
      this.setStatus("Disconnected / failed");
    }
  }

  private normalizeLobbyMessage(message: Extract<SignalMessage, { type: "lobby" }>): Extract<SignalMessage, { type: "lobby" }> {
    const raw = message as unknown as {
      roomCode?: unknown;
      visibility?: unknown;
      serverName?: unknown;
      hostName?: unknown;
      hostClientId?: unknown;
      peers?: unknown[];
    };
    const peers = Array.isArray(raw.peers) ? raw.peers.map((peer) => this.normalizePeer(peer)) : [];

    return {
      type: "lobby",
      roomCode: typeof raw.roomCode === "string" ? raw.roomCode : this.activeRoomCode,
      visibility: raw.visibility === "public" ? "public" : "private",
      serverName: typeof raw.serverName === "string" ? raw.serverName : "Private Server",
      hostName: typeof raw.hostName === "string" ? raw.hostName : "Host",
      hostClientId: typeof raw.hostClientId === "string" ? raw.hostClientId : this.isHost ? this.profile.clientId : "",
      peers,
    };
  }

  private normalizePeer(peer: unknown): PeerInfo {
    if (typeof peer === "string") {
      return {
        peerId: peer,
        clientId: peer === this.peerId ? this.profile.clientId : peer,
        name: peer === this.peerId ? this.profile.name : "Player",
        color: peer === this.peerId ? this.profile.color : fallbackPeerColor,
        isHost: this.isHost && peer === this.peerId,
      };
    }

    if (peer && typeof peer === "object") {
      const value = peer as Partial<PeerInfo>;
      return {
        peerId: typeof value.peerId === "string" ? value.peerId : createPeerId(),
        clientId: typeof value.clientId === "string" ? value.clientId : "",
        name: typeof value.name === "string" ? value.name : "Player",
        color: typeof value.color === "string" ? value.color : fallbackPeerColor,
        isHost: Boolean(value.isHost),
      };
    }

    return {
      peerId: createPeerId(),
      clientId: "",
      name: "Player",
      color: fallbackPeerColor,
      isHost: false,
    };
  }

  private ensureLobbyPeerConnections(peers: PeerInfo[]): void {
    const nextPeerIds = new Set(peers.map((peer) => peer.peerId));
    for (const peer of peers) {
      if (peer.peerId !== this.peerId) {
        this.ensurePeerConnection(peer.peerId);
      }
    }

    for (const peerId of [...this.peers.keys()]) {
      if (!nextPeerIds.has(peerId)) {
        this.removePeerConnection(peerId);
      }
    }
  }

  private async handleOffer(message: Extract<SignalMessage, { type: "offer" }>): Promise<void> {
    if (this.shouldIgnoreTargetedMessage(message.targetPeerId, message.from)) {
      return;
    }
    if (!message.from || message.from === this.peerId) {
      return;
    }

    const peer = this.ensurePeerConnection(message.from, false);
    if (!peer) {
      return;
    }
    await peer.connection.setRemoteDescription(message.sdp);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    this.sendSignal({ type: "answer", targetPeerId: message.from, sdp: answer });
    await this.flushPendingIce(peer);
  }

  private async handleAnswer(message: Extract<SignalMessage, { type: "answer" }>): Promise<void> {
    if (this.shouldIgnoreTargetedMessage(message.targetPeerId, message.from)) {
      return;
    }
    if (!message.from || message.from === this.peerId) {
      return;
    }

    const peer = this.peers.get(message.from);
    if (!peer) {
      return;
    }
    await peer.connection.setRemoteDescription(message.sdp);
    await this.flushPendingIce(peer);
  }

  private async handleIce(message: Extract<SignalMessage, { type: "ice" }>): Promise<void> {
    if (this.shouldIgnoreTargetedMessage(message.targetPeerId, message.from)) {
      return;
    }
    if (!message.from || message.from === this.peerId) {
      return;
    }

    const peer = this.ensurePeerConnection(message.from, false);
    if (!peer) {
      return;
    }
    if (peer.connection.remoteDescription) {
      await peer.connection.addIceCandidate(message.candidate);
    } else {
      peer.pendingIce.push(message.candidate);
    }
  }

  private shouldIgnoreTargetedMessage(targetPeerId: string | undefined, fromPeerId: string | undefined): boolean {
    return Boolean(targetPeerId && targetPeerId !== this.peerId) || fromPeerId === this.peerId;
  }

  private async flushPendingIce(peer: PeerConnection): Promise<void> {
    while (peer.pendingIce.length > 0 && peer.connection.remoteDescription) {
      const candidate = peer.pendingIce.shift();
      if (candidate) {
        await peer.connection.addIceCandidate(candidate);
      }
    }
  }

  private ensurePeerConnection(peerId: string, allowOffer = true): PeerConnection | null {
    if (peerId === this.peerId) {
      return null;
    }

    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }

    if (typeof RTCPeerConnection === "undefined") {
      return null;
    }

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const peer: PeerConnection = {
      peerId,
      connection,
      dataChannel: null,
      pendingIce: [],
      offerStarted: false,
    };
    this.peers.set(peerId, peer);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ type: "ice", targetPeerId: peerId, candidate: event.candidate.toJSON() });
      }
    };
    connection.ondatachannel = (event) => {
      this.attachDataChannel(peer, event.channel);
    };
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "connected") {
        this.setStatus("Connected");
      } else if (state === "failed" || state === "disconnected") {
        this.setStatus("Disconnected / failed");
      }
    };

    if (allowOffer && this.shouldCreateOffer(peerId)) {
      this.attachDataChannel(peer, connection.createDataChannel(dataChannelLabel));
      void this.createOffer(peer);
    }

    return peer;
  }

  private shouldCreateOffer(peerId: string): boolean {
    return this.peerId < peerId;
  }

  private async createOffer(peer: PeerConnection): Promise<void> {
    if (peer.offerStarted) {
      return;
    }
    peer.offerStarted = true;
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.sendSignal({ type: "offer", targetPeerId: peer.peerId, sdp: offer });
  }

  private attachDataChannel(peer: PeerConnection, channel: RTCDataChannel): void {
    peer.dataChannel = channel;
    channel.addEventListener("open", () => {
      this.setStatus("Connected");
    });
    channel.addEventListener("message", (event) => {
      this.handleDataChannelMessage(peer.peerId, event.data);
    });
    channel.addEventListener("close", () => {
      if (peer.dataChannel === channel) {
        peer.dataChannel = null;
      }
    });
    channel.addEventListener("error", () => {
      if (peer.dataChannel === channel) {
        peer.dataChannel = null;
      }
    });
  }

  private handleDataChannelMessage(fromPeerId: string, data: unknown): void {
    try {
      const message = JSON.parse(String(data)) as unknown;
      if (isSignalDataMessage(message)) {
        this.handleDataPacket(message.packet, fromPeerId, this.peerId);
      }
    } catch (error) {
      console.warn("Ignored malformed data channel message", error);
    }
  }

  private handleDataPacket(packet: PlayerStatePacket | CombatEventPacket, fromPeerId?: string, targetPeerId?: string): void {
    if (targetPeerId && targetPeerId !== this.peerId) {
      return;
    }
    if (fromPeerId === this.peerId) {
      return;
    }
    if (isStatePacket(packet)) {
      this.handlers.onRemoteState(decodePlayerStatePacket(packet));
    } else if (isCombatEventPacket(packet)) {
      this.handlers.onCombatEvent(packet);
    }
  }

  private removePeerConnection(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    peer.dataChannel?.close();
    peer.connection.close();
    this.peers.delete(peerId);
  }

  private sendPacket(packet: PlayerStatePacket | CombatEventPacket): void {
    const fallbackTargets: string[] = [];
    let sentByDataChannel = false;

    for (const peer of this.peers.values()) {
      if (peer.dataChannel?.readyState === "open") {
        peer.dataChannel.send(JSON.stringify({ type: "data", from: this.peerId, packet }));
        sentByDataChannel = true;
      } else {
        fallbackTargets.push(peer.peerId);
      }
    }

    if (fallbackTargets.length === 0 && sentByDataChannel) {
      return;
    }
    if (fallbackTargets.length === 0) {
      this.sendSignal({ type: "data", packet });
      return;
    }
    for (const targetPeerId of fallbackTargets) {
      this.sendSignal({ type: "data", targetPeerId, packet });
    }
  }

  private sendSignal(message: Exclude<SignalMessage, { type: "lobby" | "peer-left" | "error" | "afk-warning" }>): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify(message));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.handlers.onStatus(status);
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
