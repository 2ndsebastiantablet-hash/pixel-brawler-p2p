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
  return Promise.all(
    rooms.map(async (room) => {
      const liveRoom = await env.ROOMS.getByName(room.code).snapshot();
      return liveRoom ?? room;
    }),
  );
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  let visibility: "private" | "public" = "private";
  try {
    const body = (await request.json()) as { visibility?: string };
    visibility = body.visibility === "public" ? "public" : "private";
  } catch {
    visibility = "private";
  }

  const roomCode = createRoomCode();
  const createdAt = Date.now();
  const room = env.ROOMS.getByName(roomCode);
  await room.initialize({ code: roomCode, visibility, createdAt });

  if (visibility === "public") {
    const summary: PublicRoomSummary = {
      code: roomCode,
      visibility: "public",
      createdAt,
      peers: 0,
    };
    await directory(env).addRoom(summary);
  }

  console.info(JSON.stringify({ event: "room_created", roomCode, visibility }));
  return json({ roomCode, visibility });
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

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders });
}
