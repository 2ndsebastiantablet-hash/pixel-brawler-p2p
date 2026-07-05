/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";

export interface RoomMeta {
  code: string;
  visibility: "private" | "public";
  createdAt: number;
}

export interface PublicRoomSummary {
  code: string;
  visibility: "public";
  createdAt: number;
  peers: number;
}

interface PeerSession {
  peerId: string;
  socket: WebSocket;
}

const roomTtlMs = 1000 * 60 * 60;

type DurableObjectEnv = Record<string, unknown>;

export class RoomDurableObject extends DurableObject<DurableObjectEnv> {
  private meta: RoomMeta | null = null;
  private readonly sessions = new Map<WebSocket, PeerSession>();

  constructor(ctx: DurableObjectState, env: DurableObjectEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.meta = (await this.ctx.storage.get<RoomMeta>("meta")) ?? null;
    });
  }

  async initialize(meta: RoomMeta): Promise<void> {
    if (!this.meta) {
      this.meta = meta;
      await this.ctx.storage.put("meta", meta);
    }
  }

  async snapshot(): Promise<PublicRoomSummary | null> {
    if (!this.meta || this.meta.visibility !== "public") {
      return null;
    }
    return {
      code: this.meta.code,
      visibility: "public",
      createdAt: this.meta.createdAt,
      peers: this.sessions.size,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "Expected WebSocket upgrade" }, 426);
    }
    if (!this.meta) {
      return json({ error: "Room not found" }, 404);
    }
    if (this.sessions.size >= 2) {
      return json({ error: "Room is full" }, 409);
    }

    const url = new URL(request.url);
    const peerId = url.searchParams.get("peer") || crypto.randomUUID();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    const session: PeerSession = { peerId, socket: server };
    this.sessions.set(server, session);
    this.broadcastLobby();

    server.addEventListener("message", (event) => {
      this.handleMessage(session, event.data);
    });
    server.addEventListener("close", () => this.closeSession(server));
    server.addEventListener("error", () => this.closeSession(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(sender: PeerSession, rawData: string | ArrayBuffer): void {
    if (typeof rawData !== "string") {
      return;
    }

    try {
      const message = JSON.parse(rawData) as Record<string, unknown>;
      if (!["offer", "answer", "ice"].includes(String(message.type))) {
        return;
      }

      const relayed = JSON.stringify({ ...message, from: sender.peerId });
      for (const session of this.sessions.values()) {
        if (session.peerId !== sender.peerId) {
          safeSend(session.socket, relayed);
        }
      }
    } catch {
      safeSend(sender.socket, JSON.stringify({ type: "error", message: "Malformed signaling message" }));
    }
  }

  private closeSession(socket: WebSocket): void {
    const session = this.sessions.get(socket);
    if (!session) {
      return;
    }
    this.sessions.delete(socket);
    const leftMessage = JSON.stringify({ type: "peer-left", peerId: session.peerId });
    for (const peer of this.sessions.values()) {
      safeSend(peer.socket, leftMessage);
    }
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    if (!this.meta) {
      return;
    }
    const peers = [...this.sessions.values()].map((session) => session.peerId);
    const lobbyMessage = JSON.stringify({ type: "lobby", roomCode: this.meta.code, peers });
    for (const session of this.sessions.values()) {
      safeSend(session.socket, lobbyMessage);
    }
  }
}

export class RoomDirectoryDurableObject extends DurableObject<DurableObjectEnv> {
  async addRoom(room: PublicRoomSummary): Promise<void> {
    await this.ctx.storage.put(`room:${room.code}`, room);
  }

  async listRooms(): Promise<PublicRoomSummary[]> {
    const now = Date.now();
    const stored = await this.ctx.storage.list<PublicRoomSummary>({ prefix: "room:" });
    const rooms: PublicRoomSummary[] = [];

    for (const [key, room] of stored) {
      if (now - room.createdAt > roomTtlMs) {
        await this.ctx.storage.delete(key);
      } else {
        rooms.push(room);
      }
    }

    rooms.sort((a, b) => b.createdAt - a.createdAt);
    return rooms.slice(0, 20);
  }
}

function safeSend(socket: WebSocket, message: string): void {
  try {
    socket.send(message);
  } catch (error) {
    console.warn("Failed to send WebSocket message", error);
  }
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
