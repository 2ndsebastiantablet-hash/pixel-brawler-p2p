/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
import { MAX_ROOM_PLAYERS } from "../src/net/RoomConfig";

export interface RoomMeta {
  code: string;
  visibility: "private" | "public";
  createdAt: number;
  serverName: string;
  hostName: string;
  hostClientId: string;
  bannedClientIds: string[];
  closed?: boolean;
}

export interface PublicRoomSummary {
  code: string;
  visibility: "public";
  serverName: string;
  hostName: string;
  createdAt: number;
  peers: number;
  maxPeers?: number;
}

interface PeerSession {
  peerId: string;
  clientId: string;
  name: string;
  color: string;
  isHost: boolean;
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
    if (!this.meta || this.meta.visibility !== "public" || this.meta.closed) {
      return null;
    }
    return {
      code: this.meta.code,
      visibility: "public",
      serverName: this.meta.serverName,
      hostName: this.meta.hostName,
      createdAt: this.meta.createdAt,
      peers: this.sessions.size,
      maxPeers: MAX_ROOM_PLAYERS,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "Expected WebSocket upgrade" }, 426);
    }
    if (!this.meta) {
      return json({ error: "Room not found" }, 404);
    }
    if (this.meta.closed) {
      return json({ error: "Room is closed" }, 410);
    }

    const url = new URL(request.url);
    const peerId = sanitizeText(url.searchParams.get("peer"), crypto.randomUUID(), 80);
    const clientId = sanitizeText(url.searchParams.get("clientId"), peerId, 80);
    const name = sanitizeText(url.searchParams.get("name"), "Player", 18);
    const color = sanitizeColor(url.searchParams.get("color"));
    const isHost = clientId === this.meta.hostClientId;
    const hostConnected = [...this.sessions.values()].some((session) => session.clientId === this.meta?.hostClientId);

    if (!isHost && !hostConnected) {
      return json({ error: "Host is not connected" }, 409);
    }
    if (!isHost && this.meta.bannedClientIds.includes(clientId)) {
      return json({ error: "Banned from this host" }, 403);
    }
    if (this.sessions.size >= MAX_ROOM_PLAYERS) {
      return json({ error: "Room is full" }, 409);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    const session: PeerSession = { peerId, clientId, name, color, isHost, socket: server };
    this.sessions.set(server, session);
    this.broadcastLobby();

    server.addEventListener("message", (event) => {
      void this.handleMessage(session, event.data);
    });
    server.addEventListener("close", () => {
      void this.closeSession(server);
    });
    server.addEventListener("error", () => {
      void this.closeSession(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(sender: PeerSession, rawData: string | ArrayBuffer): Promise<void> {
    if (typeof rawData !== "string") {
      return;
    }

    try {
      const message = JSON.parse(rawData) as Record<string, unknown>;
      const type = String(message.type);

      if (["offer", "answer", "ice"].includes(type)) {
        const relayed = JSON.stringify({ ...message, from: sender.peerId });
        for (const session of this.sessions.values()) {
          if (session.peerId !== sender.peerId) {
            safeSend(session.socket, relayed);
          }
        }
        return;
      }

      if (type === "data" && isRelayPacket(message.packet)) {
        const relayed = JSON.stringify({ type: "data", from: sender.peerId, packet: message.packet });
        for (const session of this.sessions.values()) {
          if (session.peerId !== sender.peerId) {
            safeSend(session.socket, relayed);
          }
        }
        return;
      }

      if (!sender.isHost || !this.meta) {
        safeSend(sender.socket, JSON.stringify({ type: "error", message: "Only the host can manage the room" }));
        return;
      }

      if (type === "kick") {
        const targetPeerId = typeof message.targetPeerId === "string" ? message.targetPeerId : "";
        const target = [...this.sessions.values()].find((session) => session.peerId === targetPeerId);
        if (target && !target.isHost) {
          await this.removeSession(target, { type: "kick", reason: "Kicked by host" });
        }
        return;
      }

      if (type === "ban") {
        const targetClientId = typeof message.targetClientId === "string" ? message.targetClientId : "";
        if (targetClientId && !this.meta.bannedClientIds.includes(targetClientId)) {
          this.meta.bannedClientIds.push(targetClientId);
          await this.ctx.storage.put("meta", this.meta);
        }
        const targets = [...this.sessions.values()].filter((session) => session.clientId === targetClientId && !session.isHost);
        for (const target of targets) {
          await this.removeSession(target, { type: "ban", reason: "Banned by host" });
        }
        return;
      }

      if (type === "server-closed") {
        await this.closeRoom("Server closed by host");
      }
    } catch {
      safeSend(sender.socket, JSON.stringify({ type: "error", message: "Malformed signaling message" }));
    }
  }

  private async removeSession(session: PeerSession, message: Record<string, unknown>): Promise<void> {
    safeSend(session.socket, JSON.stringify(message));
    this.sessions.delete(session.socket);
    safeClose(session.socket);
    const leftMessage = JSON.stringify({ type: "peer-left", peerId: session.peerId });
    for (const peer of this.sessions.values()) {
      safeSend(peer.socket, leftMessage);
    }
    this.broadcastLobby();
  }

  private async closeSession(socket: WebSocket): Promise<void> {
    const session = this.sessions.get(socket);
    if (!session) {
      return;
    }
    if (session.isHost && this.meta && !this.meta.closed) {
      await this.closeRoom("Host left");
      return;
    }

    this.sessions.delete(socket);
    const leftMessage = JSON.stringify({ type: "peer-left", peerId: session.peerId });
    for (const peer of this.sessions.values()) {
      safeSend(peer.socket, leftMessage);
    }
    this.broadcastLobby();
  }

  private async closeRoom(reason: string): Promise<void> {
    if (!this.meta || this.meta.closed) {
      return;
    }

    this.meta = { ...this.meta, closed: true };
    await this.ctx.storage.put("meta", this.meta);
    const message = JSON.stringify({ type: "server-closed", reason });
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) {
      safeSend(session.socket, message);
      safeClose(session.socket);
    }
  }

  private broadcastLobby(): void {
    if (!this.meta || this.meta.closed) {
      return;
    }

    const peers = [...this.sessions.values()].map((session) => ({
      peerId: session.peerId,
      clientId: session.clientId,
      name: session.name,
      color: session.color,
      isHost: session.isHost,
    }));
    const lobbyMessage = JSON.stringify({
      type: "lobby",
      roomCode: this.meta.code,
      visibility: this.meta.visibility,
      serverName: this.meta.serverName,
      hostName: this.meta.hostName,
      hostClientId: this.meta.hostClientId,
      peers,
    });
    for (const session of this.sessions.values()) {
      safeSend(session.socket, lobbyMessage);
    }
  }
}

function isRelayPacket(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as { t?: unknown };
  return packet.t === "s" || packet.t === "c";
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

function safeClose(socket: WebSocket): void {
  try {
    socket.close(1000, "Room update");
  } catch (error) {
    console.warn("Failed to close WebSocket", error);
  }
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized || fallback;
}

function sanitizeColor(value: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return "#18dff5";
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
