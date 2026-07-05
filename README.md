# pixel-brawler-p2p

A first technical foundation for a fast 2D pixel-art platform brawler with peer-to-peer WebRTC multiplayer. This prototype focuses on movement feel, a simple black-void stage, local/remote player sync, and Cloudflare-ready signaling infrastructure.

## What is included

- Vite + TypeScript front end.
- Plain canvas side-view game loop with crisp pixel rendering.
- Fast A/D movement with acceleration and deceleration.
- Space jump, double jump, coyote time, and jump buffering.
- Shift ground slide with a visible slide streak.
- Smooth camera follow.
- Developer lobby UI for offline test, private rooms, public rooms, public room refresh, and join-by-code.
- WebRTC DataChannel state replication at a compact tick rate.
- Cloudflare Worker + Durable Objects signaling and lobby foundation.

The Worker only handles room creation, public room listing, lobby WebSockets, and WebRTC offer/answer/ICE relay. Gameplay simulation remains peer-to-peer and client-owned for now. Future rollback, prediction, and deterministic input sync should replace the current simple state replication in `src/net/WebRTCClient.ts` and `src/game/Game.ts`.

## Requirements

- Node.js 20 or newer.
- npm.
- A Cloudflare account for deployment.

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd` for the same commands.

## Local setup

```bash
npm install
npm run check
npm run build
```

## Run the game locally

Start the Vite front end:

```bash
npm run dev
```

Open the printed local URL, usually `http://localhost:5173`.

Click **Start Offline Test** to test the movement prototype without the Worker.

## Run the signaling Worker locally

In a second terminal:

```bash
npm run worker:dev
```

The Worker runs at `http://localhost:8787` by default. The front end uses that URL automatically unless `VITE_SIGNALING_URL` is set.

## Test multiplayer locally

1. Start the Worker with `npm run worker:dev`.
2. Start the front end with `npm run dev`.
3. Open two browser windows at the Vite URL.
4. In window one, click **Host Private Room** or **Host Public Room**.
5. In window two, enter the room code and click **Join**, or refresh public rooms and select the room.
6. Once connected, both players should appear in the black stage. Each local browser controls its own fighter and receives the remote fighter over WebRTC.

If the peers do not connect, check both browser consoles and the Worker terminal. The current WebRTC setup uses a public STUN server and may need TURN later for restrictive networks.

## Cloudflare Pages deployment

Create a Cloudflare Pages project connected to the GitHub repository.

Use these Pages settings:

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root

If the Worker is deployed separately, add a Pages environment variable:

```text
VITE_SIGNALING_URL=https://<your-worker-name>.<your-subdomain>.workers.dev
```

Then redeploy Pages so the front end points at the deployed signaling Worker.

## Cloudflare Worker deployment

The Worker and Durable Object config live in `wrangler.toml`.

Run locally:

```bash
npm run worker:dev
```

Deploy:

```bash
npm run worker:deploy
```

Wrangler will create the Durable Object classes declared in the `v1` migration on first deploy.
The npm scripts pass `-c wrangler.toml` explicitly so Wrangler does not pick up a parent directory config when this repo sits inside another workspace.

## Useful scripts

```bash
npm run dev          # Vite dev server
npm run build        # TypeScript check and production build
npm run preview      # Preview built dist
npm run check        # TypeScript check and Vitest unit tests
npm test             # Vitest unit tests only
npm run worker:dev   # Local Cloudflare Worker/Durable Object signaling server
npm run worker:deploy
```

## Current limitations

- No final characters, attacks, hitboxes, combat, menus, cosmetics, or polished art yet.
- Networking uses simple state replication, not rollback netcode.
- Public room entries are stored for a short development TTL and do not yet update peer counts after every lobby transition.
- TURN is not configured, so some restrictive networks may fail peer connection.
