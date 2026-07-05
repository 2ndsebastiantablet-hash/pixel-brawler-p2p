import {
  decodePlayerStatePacket,
  isStatePacket,
  type PlayerNetState,
  type PlayerStatePacket,
  type SignalMessage,
} from "./NetTypes";
import { HostOfferCoordinator } from "./OfferCoordinator";
import { SignalingClient } from "./SignalingClient";

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
  onPeerLeft: (peerId: string) => void;
}

export class WebRTCClient {
  readonly peerId = crypto.randomUUID();
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signalingSocket: WebSocket | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private isHost = false;
  private readonly hostOfferCoordinator = new HostOfferCoordinator();

  constructor(
    private readonly signaling: SignalingClient,
    private readonly handlers: WebRTCHandlers,
  ) {}

  async host(roomCode: string): Promise<void> {
    this.isHost = true;
    this.hostOfferCoordinator.reset();
    this.handlers.onStatus("Waiting for peer");
    this.createPeerConnection();
    this.dataChannel = this.peerConnection?.createDataChannel("player-state", {
      ordered: false,
      maxRetransmits: 0,
    }) ?? null;
    this.configureDataChannel();
    await this.connectSignaling(roomCode);
  }

  async join(roomCode: string): Promise<void> {
    this.isHost = false;
    this.handlers.onStatus("Connecting");
    this.createPeerConnection();
    await this.connectSignaling(roomCode);
  }

  sendPlayerState(packet: PlayerStatePacket): void {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(packet));
    }
  }

  close(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.signalingSocket?.close();
    this.dataChannel = null;
    this.peerConnection = null;
    this.signalingSocket = null;
    this.pendingIce = [];
    this.isHost = false;
    this.hostOfferCoordinator.reset();
    this.handlers.onStatus("Offline");
  }

  private createPeerConnection(): void {
    this.peerConnection?.close();
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.sendSignal({ type: "ice", candidate: event.candidate.toJSON() });
      }
    });

    this.peerConnection.addEventListener("connectionstatechange", () => {
      const state = this.peerConnection?.connectionState;
      if (state === "connected") {
        this.handlers.onStatus("Connected");
      }
      if (state === "failed" || state === "disconnected" || state === "closed") {
        this.handlers.onStatus("Disconnected / failed");
      }
    });

    this.peerConnection.addEventListener("datachannel", (event) => {
      this.dataChannel = event.channel;
      this.configureDataChannel();
    });
  }

  private configureDataChannel(): void {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.binaryType = "arraybuffer";
    this.dataChannel.addEventListener("open", () => {
      console.info("WebRTC data channel open");
      this.handlers.onStatus("Connected");
    });
    this.dataChannel.addEventListener("close", () => this.handlers.onStatus("Disconnected / failed"));
    this.dataChannel.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(String(event.data));
        if (isStatePacket(packet)) {
          this.handlers.onRemoteState(decodePlayerStatePacket(packet));
        }
      } catch (error) {
        console.warn("Ignored malformed data channel packet", error);
      }
    });
  }

  private async connectSignaling(roomCode: string): Promise<void> {
    this.signalingSocket = this.signaling.connect(roomCode, this.peerId, (message) => {
      void this.handleSignal(message);
    });

    this.signalingSocket.addEventListener("close", () => {
      if (this.peerConnection?.connectionState !== "connected") {
        this.handlers.onStatus("Disconnected / failed");
      }
    });
    this.signalingSocket.addEventListener("error", () => this.handlers.onStatus("Disconnected / failed"));

    await new Promise<void>((resolve, reject) => {
      const socket = this.signalingSocket;
      if (!socket) {
        reject(new Error("Signaling socket missing"));
        return;
      }
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Signaling socket failed")), { once: true });
    });
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error("Peer connection was not created");
    }
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: offer });
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (!this.peerConnection) {
      return;
    }

    try {
      if (message.type === "offer") {
        this.handlers.onStatus("Connecting");
        await this.peerConnection.setRemoteDescription(message.sdp);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.sendSignal({ type: "answer", sdp: answer });
        await this.flushPendingIce();
      } else if (message.type === "answer") {
        await this.peerConnection.setRemoteDescription(message.sdp);
        await this.flushPendingIce();
      } else if (message.type === "ice") {
        await this.addIce(message.candidate);
      } else if (message.type === "lobby") {
        const peerCount = message.peers.length;
        this.handlers.onStatus(peerCount >= 2 ? "Connecting" : "Waiting for peer");
        if (this.hostOfferCoordinator.shouldCreateOffer(this.isHost, peerCount)) {
          await this.createAndSendOffer();
        }
      } else if (message.type === "peer-left") {
        this.hostOfferCoordinator.reset();
        this.handlers.onPeerLeft(message.peerId);
        this.handlers.onStatus("Disconnected / failed");
      } else if (message.type === "error") {
        console.warn("Signaling error:", message.message);
        this.handlers.onStatus("Disconnected / failed");
      }
    } catch (error) {
      console.warn("WebRTC signaling failed", error);
      this.handlers.onStatus("Disconnected / failed");
    }
  }

  private async addIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection?.remoteDescription) {
      this.pendingIce.push(candidate);
      return;
    }
    await this.peerConnection.addIceCandidate(candidate);
  }

  private async flushPendingIce(): Promise<void> {
    const candidates = [...this.pendingIce];
    this.pendingIce = [];
    for (const candidate of candidates) {
      await this.peerConnection?.addIceCandidate(candidate);
    }
  }

  private sendSignal(message: Exclude<SignalMessage, { type: "lobby" | "peer-left" | "error" }>): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      this.signalingSocket.send(JSON.stringify(message));
    }
  }
}
