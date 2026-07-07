import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PlayerStatePacket, SignalMessage } from "../src/net/NetTypes";
import type { SignalingClient } from "../src/net/SignalingClient";
import { WebRTCClient } from "../src/net/WebRTCClient";
import type { PlayerProfile } from "../src/ui/Profile";

const localProfile: PlayerProfile = {
  clientId: "client-local",
  name: "Local",
  color: "#18dff5",
  showNames: true,
};

const remoteProfile: PlayerProfile = {
  clientId: "client-remote",
  name: "Remote",
  color: "#ff6f91",
  showNames: true,
};

describe("WebRTCClient mesh connections", () => {
  let originalRtcPeerConnection: typeof RTCPeerConnection | undefined;
  let socket: FakeSocket;

  beforeEach(() => {
    originalRtcPeerConnection = globalThis.RTCPeerConnection;
    FakePeerConnection.instances.length = 0;
    socket = new FakeSocket();
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalRtcPeerConnection) {
      globalThis.RTCPeerConnection = originalRtcPeerConnection;
    }
  });

  it("creates a targeted offer when a remote peer appears in the lobby", async () => {
    const client = new WebRTCClient(fakeSignaling(socket), localProfile, noopHandlers());
    await client.host("ROOM1");

    socket.receive({
      type: "lobby",
      roomCode: "ROOM1",
      visibility: "private",
      serverName: "Private Server",
      hostName: localProfile.name,
      hostClientId: localProfile.clientId,
      peers: [
        { peerId: client.peerId, clientId: localProfile.clientId, name: localProfile.name, color: localProfile.color, isHost: true },
        { peerId: "zz-remote-peer", clientId: remoteProfile.clientId, name: remoteProfile.name, color: remoteProfile.color, isHost: false },
      ],
    });
    await flushPromises();

    expect(socket.sentMessages).toContainEqual(expect.objectContaining({
      type: "offer",
      targetPeerId: "zz-remote-peer",
      sdp: { type: "offer", sdp: "fake-offer" },
    }));
  });

  it("answers targeted offers and routes packets over an open data channel", async () => {
    const client = new WebRTCClient(fakeSignaling(socket), localProfile, noopHandlers());
    await client.join("ROOM1");

    socket.receive({
      type: "offer",
      from: "aa-remote-peer",
      targetPeerId: client.peerId,
      sdp: { type: "offer", sdp: "remote-offer" },
    });
    await flushPromises();

    expect(socket.sentMessages).toContainEqual(expect.objectContaining({
      type: "answer",
      targetPeerId: "aa-remote-peer",
      sdp: { type: "answer", sdp: "fake-answer" },
    }));

    const connection = FakePeerConnection.instances[0];
    const channel = connection.emitDataChannel();
    channel.open();
    const packet = playerPacket(client.peerId);
    client.sendPlayerState(packet);

    expect(channel.sentMessages).toContainEqual({ type: "data", from: client.peerId, packet });
  });

  it("falls back to a targeted signaling relay before a data channel opens", async () => {
    const client = new WebRTCClient(fakeSignaling(socket), localProfile, noopHandlers());
    await client.host("ROOM1");

    socket.receive({
      type: "lobby",
      roomCode: "ROOM1",
      visibility: "private",
      serverName: "Private Server",
      hostName: localProfile.name,
      hostClientId: localProfile.clientId,
      peers: [
        { peerId: client.peerId, clientId: localProfile.clientId, name: localProfile.name, color: localProfile.color, isHost: true },
        { peerId: "zz-remote-peer", clientId: remoteProfile.clientId, name: remoteProfile.name, color: remoteProfile.color, isHost: false },
      ],
    });
    await flushPromises();

    const packet = playerPacket(client.peerId);
    client.sendPlayerState(packet);

    expect(socket.sentMessages).toContainEqual({
      type: "data",
      targetPeerId: "zz-remote-peer",
      packet,
    });
  });

  it("normalizes old Worker lobby peer strings without making guests hosts", async () => {
    const handlers = noopHandlers();
    const client = new WebRTCClient(fakeSignaling(socket), localProfile, handlers);
    await client.join("ROOM1");

    socket.receive({
      type: "lobby",
      roomCode: "ROOM1",
      peers: ["aa-host-peer", client.peerId],
    } as unknown as SignalMessage);
    await flushPromises();

    expect(handlers.onLobby).toHaveBeenCalledWith(expect.objectContaining({
      hostClientId: "",
      peers: [
        expect.objectContaining({ peerId: "aa-host-peer", isHost: false }),
        expect.objectContaining({ peerId: client.peerId, clientId: localProfile.clientId, isHost: false }),
      ],
    }));
  });
});

function fakeSignaling(fakeSocket: FakeSocket): SignalingClient {
  return {
    baseUrl: "http://127.0.0.1:8787",
    createRoom: vi.fn(),
    listPublicRooms: vi.fn(),
    connect: (_roomCode: string, _peerId: string, _profile: PlayerProfile, onMessage: (message: SignalMessage) => void) => {
      fakeSocket.onParsedMessage = onMessage;
      queueMicrotask(() => fakeSocket.open());
      return fakeSocket as unknown as WebSocket;
    },
    roomWebSocketUrl: () => "ws://test/rooms/ROOM1/ws",
  } as unknown as SignalingClient;
}

function noopHandlers(): ConstructorParameters<typeof WebRTCClient>[2] {
  return {
    onStatus: vi.fn(),
    onRemoteState: vi.fn(),
    onCombatEvent: vi.fn(),
    onPeerLeft: vi.fn(),
    onLobby: vi.fn(),
    onKicked: vi.fn(),
    onBanned: vi.fn(),
    onServerClosed: vi.fn(),
    onAfkWarning: vi.fn(),
  };
}

function playerPacket(peerId: string): PlayerStatePacket {
  return {
    t: "s",
    id: peerId,
    cid: localProfile.clientId,
    n: localProfile.name,
    c: localProfile.color,
    x: 10,
    y: 20,
    vx: 0,
    vy: 0,
    f: 1,
    g: 1,
    sl: 0,
    a: "idle",
    seq: 1,
    ts: 100,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  sentMessages: unknown[] = [];
  onParsedMessage: ((message: SignalMessage) => void) | null = null;

  send(data: string): void {
    this.sentMessages.push(JSON.parse(data) as unknown);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(message: SignalMessage): void {
    this.onParsedMessage?.(message);
  }
}

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = "connecting";
  sentMessages: unknown[] = [];

  constructor(readonly label: string) {
    super();
  }

  send(data: string): void {
    this.sentMessages.push(JSON.parse(data) as unknown);
  }

  open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  close(): void {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
}

class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = [];

  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = "new";
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  createdDataChannel: FakeDataChannel | null = null;

  constructor() {
    super();
    FakePeerConnection.instances.push(this);
  }

  createDataChannel(label: string): RTCDataChannel {
    this.createdDataChannel = new FakeDataChannel(label);
    return this.createdDataChannel as unknown as RTCDataChannel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "offer", sdp: "fake-offer" });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "answer", sdp: "fake-answer" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.connectionState = "closed";
  }

  emitDataChannel(): FakeDataChannel {
    const channel = new FakeDataChannel("game-state");
    this.ondatachannel?.({ channel } as unknown as RTCDataChannelEvent);
    return channel;
  }
}
