# pixel-brawler-p2p

A fast 2D pixel-art platform brawler prototype with a canvas game loop, procedural chunky stick-figure fighters, peer-to-peer WebRTC movement sync, and Cloudflare Worker + Durable Object signaling.

## What is included

- Vite + TypeScript front end.
- Plain canvas side-view game loop with crisp pixel rendering.
- Main menu flow for Play, player setup, hosting, joining, and Offline Test.
- Player name/color customization stored in localStorage.
- Procedural one-color chunky pixel brawler rendering with idle, run, jump, double jump, slide, low slide, air dive, duck, ground slam, and slam landing poses.
- Compact in-game HUD for private room codes, public server names, and Offline Test.
- Escape server menu with player list, leave/end server, and host kick/ban controls.
- Rebuilt combat slice with 100 HP, hitstun, invulnerability flash, damage numbers, knockback, projectiles, melee hitboxes, status effects, weapon cooldowns, reloads, drops, throws, pickups, crosshair aiming, screen shake, hit sparks, and an offline training dummy.
- Five enabled polished weapons for this slice: pistol, whip, teleporting ball, lightning rod, and sledgehammer. The older unfinished weapons are registered for compatibility but hidden from the armory/loadout.
- Body-contact combat for slide trips, stronger low-slide trips, head stomps, air-dive hits, ground-slam direct hits, and ground-slam shockwaves.
- Procedural Web Audio sound effects for menu actions, movement, impacts, hits, reloads, weapon use, teleporting, lightning, and heavy hammer attacks.
- WebRTC DataChannel state replication at a compact tick rate.
- Cloudflare Worker + Durable Objects for room creation, public room listing, lobby WebSockets, room metadata, player lists, and WebRTC offer/answer/ICE relay.

The Worker handles signaling and room management only. Gameplay simulation remains peer-to-peer and client-owned for now. Future rollback, prediction, and deterministic input sync should replace the current simple state replication in `src/net/WebRTCClient.ts` and `src/game/Game.ts`.

## Controls

- `A` / `D`: Move.
- `Space`: Jump, then double jump.
- `Shift` on ground: Dash / slide.
- `Shift` in air: Air dive.
- `S` on ground: Duck.
- `S` + `Shift` on ground: Low slide.
- `S` in air: Ground slam.
- `N`: Toggle player names.
- `Escape`: Server info / leave menu.
- Mouse move: Aim crosshair.
- Left mouse: Primary fire / swing / use.
- Right mouse: Secondary, throw, or weapon special.
- `R`: Reload weapons that use ammo.
- `1`-`5`: Equip from the enabled test loadout slots.
- `Q` / `E`: Previous / next weapon.
- `F`: Pick up nearby dropped weapon.
- `G`: Drop / throw current weapon.

## Enabled Weapons

- Pistol: 20-shot tap-fire sidearm. Left click fires one bullet for 10 damage, `R` reloads, a late `R` press during reload grants three perfect shots, air shots recoil the player, slide shots get extra speed/knockback, close shots knock harder, and right click throws the pistol as a pickup object.
- Whip: Very long mouse-aimed control weapon. The body hit deals light damage, the tip sweet spot adds stun/knockback, low/duck whip trips, air whip stalls slightly, and the same target is pulled only after two quick whip hits inside the combo window.
- Teleporting Ball: Left click throws an arcing marker. After three seconds the player teleports to the ball unless right click cancels it. Direct hits deal small damage and speed up the teleport. Arrival creates a small burst that damages and knocks enemies away.
- Lightning Rod: Left click pokes with shock. Right click raises the rod and calls lightning after a short delay, slightly damaging the player but granting empowered movement and a visible electric aura. Touching an empowered player shocks and briefly stuns targets on a per-target cooldown. Thrown rods shock on hit or landing.
- Sledgehammer: Heavy slow weapon with a large pixel hammer. Holding left click charges an overhead slam, full charge creates a shockwave, air attacks pull downward, right click shoves, and heavy impacts add recovery, screen shake, sound, big damage, and knockback.

## Movement Combat

- Slide Trip: Ground `Shift` slide trips enemies on contact, dealing light damage, upward pop, knockback, and short stun.
- Low Slide Trip: `S` + `Shift` slides longer and trips harder with stronger pop and stun.
- Head Stomp: Landing on a target's head with downward velocity deals small damage, stuns/squashes the target briefly, and bounces the stomping player upward.
- Air Dive Hit: `Shift` in air dives into targets for damage, knockback, and about one second of stun.
- Ground Slam Damage: `S` in air starts a ground slam. Direct body contact damages targets, and floor impact creates a small shockwave.

## Loading Screen And Sound

The first screen shows a recreated keyboard layout with keycaps, labels, mouse controls, and a continue button. The game uses procedural Web Audio sounds generated in code; there are no copyrighted external sound assets. Volume constants live in `src/audio/SoundSystem.ts`, and repeated sounds such as footsteps and shock pulses are rate-limited.

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

Open the printed local URL, usually `http://localhost:5173`. The first screen is a controls/loading screen with keyboard keycaps and mouse controls. Continue to the main menu, press **Play**, choose a name/color, then use **Offline Test** for local movement and combat. Offline Test spawns a training dummy and shows the five-weapon armory strip along the bottom of the screen. Use `1`-`5` and `Q`/`E` to equip the enabled weapons, then attack with the mouse.

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
4. In window one, press **Play**, set name/color, choose **Host**, then host a private or public server.
5. Private rooms show a room code at the top of the game screen. Public rooms show the server name at the top right.
6. In window two, press **Play**, set name/color, choose **Join**, then enter the private room code or refresh and join a public server.
7. Press `Escape` in game to view players, leave, or host-manage the server.
8. Prototype combat events are also sent over the WebRTC DataChannel, so remote players should see attack/projectile effects. Hit validation is still client-predicted prototype logic.

If the peers do not connect, check both browser consoles and the Worker terminal. The current WebRTC setup uses a public STUN server and may need TURN later for restrictive networks.

## Host Kick And Ban

Hosts can kick or ban non-host players from the Escape menu. Bans use the stable `clientId` stored in each browser. The host browser stores banned client IDs in localStorage and sends that list when creating future private or public servers; the Worker enforces the list it receives for that room. Clearing host localStorage or hosting from another browser/device removes that local ban list.

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

Cloudflare Pages will auto-deploy when `main` is pushed if the Pages project is connected to this repository and auto deploys are enabled.

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

Wrangler will create the Durable Object classes declared in the `v1` migration on first deploy. The npm scripts pass `-c wrangler.toml` explicitly so Wrangler does not pick up a parent directory config when this repo sits inside another workspace.

If Worker or Durable Object code changes, run `npm run worker:deploy` after tests pass. This combat update keeps combat packets on the WebRTC DataChannel and does not require a new Durable Object migration.

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

- Combat is a playable vertical slice for the first five weapons, not final balance.
- Offline Test is the main combat-quality target for this update. Multiplayer still uses simple state replication and prototype combat event mirroring, not rollback netcode or authoritative hit validation, so remote players can see movement/attack effects but combat authority is not final.
- Public room entries are short-lived development records hydrated from live Durable Objects when listed.
- TURN is not configured, so some restrictive networks may fail peer connection.
