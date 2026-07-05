/// <reference types="@cloudflare/workers-types" />

import { RoomDirectoryDurableObject, RoomDurableObject, type PublicRoomSummary } from "./RoomDurableObject";

export { RoomDirectoryDurableObject, RoomDurableObject };

interface Env {
  ROOMS: DurableObjectNamespace<RoomDurableObject>;
  ROOM_DIRECTORY: DurableObjectNamespace<RoomDirectoryDurableObject>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/rooms") {
      return createRoom(request, env);
    }

    if (request.method === "GET" && url.pathname === "/rooms/public") {
      const rooms = await hydratePublicRooms(await directory(env).listRooms(), env);
      return json({ rooms });
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Z2-9]{5})\/ws$/);
    if (roomMatch) {
      const roomCode = roomMatch[1];
      return env.ROOMS.getByName(roomCode).fetch(request);
    }

    return json({ error: "Not found" }, 404);
  },
};

async function hydratePublicRooms(rooms: PublicRoomSummary[], env: Env): Promise<PublicRoomSummary[]> {
  const hydrated = await Promise.all(
    rooms.map(async (room) => {
      const liveRoom = await env.ROOMS.getByName(room.code).snapshot();
      return liveRoom ?? room;
    }),
  );
  return hydrated.filter((room): room is PublicRoomSummary => Boolean(room));
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  let visibility: "private" | "public" = "private";
  let hostName = "Host";
  let serverName = "Host's Server";
  let hostClientId = crypto.randomUUID();
  let bannedClientIds: string[] = [];

  try {
    const body = (await request.json()) as {
      visibility?: string;
      hostName?: string;
      serverName?: string;
      hostClientId?: string;
      bannedClientIds?: unknown;
    };
    visibility = body.visibility === "public" ? "public" : "private";
    hostName = sanitizeText(body.hostName, "Host", 18);
    serverName = sanitizeText(body.serverName, `${hostName}'s Server`, 28);
    hostClientId = sanitizeText(body.hostClientId, hostClientId, 80);
    bannedClientIds = Array.isArray(body.bannedClientIds)
      ? body.bannedClientIds.filter((value): value is string => typeof value === "string").slice(0, 200)
      : [];
  } catch {
    visibility = "private";
  }

  const roomCode = createRoomCode();
  const createdAt = Date.now();
  const room = env.ROOMS.getByName(roomCode);
  await room.initialize({ code: roomCode, visibility, createdAt, hostName, serverName, hostClientId, bannedClientIds });

  if (visibility === "public") {
    const summary: PublicRoomSummary = {
      code: roomCode,
      visibility: "public",
      serverName,
      hostName,
      createdAt,
      peers: 0,
    };
    await directory(env).addRoom(summary);
  }

  console.info(JSON.stringify({ event: "room_created", roomCode, visibility }));
  return json({ roomCode, visibility, serverName, hostName, hostClientId });
}

function directory(env: Env): DurableObjectStub<RoomDirectoryDurableObject> {
  return env.ROOM_DIRECTORY.getByName("public-room-directory");
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized || fallback;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders });
}
