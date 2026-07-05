import type { RoomSummary, SignalMessage } from "./NetTypes";

interface CreateRoomResponse {
  roomCode: string;
  visibility: "private" | "public";
}

export class SignalingClient {
  constructor(private readonly baseUrl = getDefaultSignalingUrl()) {}

  async createRoom(visibility: "private" | "public"): Promise<CreateRoomResponse> {
    const response = await fetch(`${this.baseUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    if (!response.ok) {
      throw new Error(`Room creation failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CreateRoomResponse>;
  }

  async listPublicRooms(): Promise<RoomSummary[]> {
    const response = await fetch(`${this.baseUrl}/rooms/public`);
    if (!response.ok) {
      throw new Error(`Public room refresh failed: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { rooms: RoomSummary[] };
    return payload.rooms;
  }

  connect(roomCode: string, peerId: string, onMessage: (message: SignalMessage) => void): WebSocket {
    const url = new URL(`${toWsBase(this.baseUrl)}/rooms/${encodeURIComponent(roomCode)}/ws`);
    url.searchParams.set("peer", peerId);
    const socket = new WebSocket(url);

    socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as SignalMessage);
      } catch (error) {
        console.warn("Ignored malformed signaling message", error);
      }
    });

    return socket;
  }
}

function getDefaultSignalingUrl(): string {
  const configured = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  return configured?.replace(/\/$/, "") || "http://localhost:8787";
}

function toWsBase(baseUrl: string): string {
  if (baseUrl.startsWith("https://")) {
    return baseUrl.replace("https://", "wss://");
  }
  if (baseUrl.startsWith("http://")) {
    return baseUrl.replace("http://", "ws://");
  }
  return baseUrl;
}
