# pixel-brawler-p2p

A fast 2D pixel-art platform brawler prototype with a canvas game loop, procedural chunky stick-figure fighters, multiplayer room state sync, and Cloudflare Worker + Durable Object signaling.

## What is included

- Vite + TypeScript front end.
- Plain canvas side-view game loop with crisp pixel rendering.
- Main menu flow for Play, player setup, hosting, joining, and Offline Test.
- Player name/color customization stored in localStorage.
- Procedural one-color chunky pixel brawler rendering with idle, run, jump, double jump, slide, low slide, air dive, duck, ground slam, and slam landing poses.
- Compact in-game HUD for private room codes, public server names, and Offline Test.
- Escape server menu with player list, leave/end server, and host kick/ban controls.
- Private and public online rooms support up to 10 players, with public room counts shown as `players/10`.
- Host-left, empty-room, and AFK cleanup are handled by the Durable Object room so stale public servers disappear and old private codes become invalid.
- Rebuilt combat slice with 100 HP, hitstun, invulnerability flash, HEAD/BODY/LEG damage labels, stronger knockback, projectiles, melee hitboxes, status effects, weapon cooldowns, reloads, drops, throws, pickups, crosshair aiming, screen shake, hit sparks, blood flecks, and an offline training dummy.
- Thirteen enabled polished weapons for this slice: pistol, whip, teleporting ball, lightning rod, sledgehammer, slingshot, laser blaster, revolver, minigun, sniper, knife, machete, and axe.
- Centralized combat tuning in `src/game/combat/CombatTuning.ts` for knockback, recoil, body-contact values, weapon weight, sound volume, laser heat/charge, minigun spin-up, projectile floor rules, and sniper leg-shot slow.
- Weapon weight strongly affects movement speed, acceleration, air control, jump height, and slide speed.
- Body-contact combat for Knife contact cuts, slide trips, stronger low-slide trips, head stomps, air-dive hits, ground-slam direct hits, and ground-slam shockwaves.
- Louder procedural Web Audio sound effects for menu actions, movement, impacts, hits, reloads, weapon use, teleporting, lightning, heavy hammer and axe attacks, ricochets, lasers, revolver shots, minigun spin/fire, and sniper shots. Volume constants are fed from the central combat tuning file.
- Remote players are real combat targets with hurtboxes, HP, knockback, status effects, KO/respawn state, soft body collision, projectile hits, melee hits, slide trips, stomps, dives, and ground-slam interactions.
- Cloudflare Worker + Durable Objects for room creation, public room listing, lobby WebSockets, room metadata, player lists, kick/ban controls, WebRTC signaling, and targeted state/combat relay fallback.

The client creates a WebRTC data-channel mesh between all peers for gameplay packets. Until a data channel is open, or when one direct peer connection hiccups, the Worker relays compact state/combat packets only to the peers that still need fallback delivery. Gameplay simulation remains client-predicted and client-owned for now. Future rollback, prediction, and host/server authoritative validation should replace the current practical prototype sync in `src/net/WebRTCClient.ts`, `src/game/Game.ts`, and `src/game/combat/CombatSystem.ts`.

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
- `1`-`9` and `0`: Equip from the enabled test loadout slots.
- `Q` / `E`: Previous / next weapon.
- `F`: Pick up nearby dropped weapon.
- `G`: Drop / throw current weapon.

## Enabled Weapons

- Pistol: 20-shot tap-fire sidearm. Left click fires one bullet for 10 damage, `R` reloads, a late `R` press during reload grants three perfect shots, air shots recoil the player, slide shots get extra speed/knockback, close shots knock harder, and right click throws the pistol as a pickup object.
- Whip: Very long mouse-aimed control weapon. The body hit deals light damage, the tip sweet spot adds stun/knockback, low/duck whip trips, air whip stalls slightly, and the same target is pulled only after two quick whip hits inside the combo window.
- Teleporting Ball: Left click throws an arcing marker. After three seconds the player teleports to the ball unless right click cancels it. Direct hits deal small damage and speed up the teleport. Arrival creates a small burst that damages and knocks enemies away.
- Lightning Rod: Hold/release left click to call a giant directional strike from the aimed direction toward the rod. Side, downward, and diagonal strikes damage targets on the bolt path without granting the full buff. Specifically holding upward self-charges the player: longer holds deal more self-damage, create stronger charge visuals, and grant longer empowered time with faster movement, stronger attacks, visible aura, and touch shocks on a per-target cooldown. Right click still raises the rod for the delayed call-lightning behavior, now with strain-scaled empowerment rather than a fixed 60-second timer. Thrown rods shock on hit or landing.
- Sledgehammer: Heavy slow weapon with a large pixel hammer. Holding left click charges an overhead slam, full charge creates a shockwave, air attacks pull downward, right click shoves, and heavy impacts add recovery, screen shake, sound, big damage, and knockback.
- Slingshot: Light five-stone volley weapon. Hold left click to stretch and release five fast stones, right click fires a wider five-stone scatter, each volley consumes five ammo, stones travel far with low gravity, and they ricochet many times with clack feedback instead of vanishing quickly.
- Laser Blaster: Heat and charge weapon. Hold left click to build charge, release to fire a visible piercing bolt even from short or overheated charge, right click vents heat with a short radial blast, and holding to maximum risks an overcharge burst.
- Laser charge now scales damage, beam width, beam length, enemy knockback, self-recoil, heat, visual brightness, and shake. Heat turns the blaster red, venting cools it, and overcharge creates a small damaging particle burst.
- Revolver: Six-shot high-knockback sidearm. Left click fires deliberate tap shots, right click fan-fires several rounds with stronger self-recoil, the last bullet hits harder with extra kick, and head/leg hits become especially dangerous or slowing.
- Minigun: Very heavy sustained-fire weapon. Hold right click to pre-spin, hold left click to spin/fire, and it must spin for five seconds before firing. Heat rises while firing, overheat locks the gun briefly, the barrels glow red, and recoil pushes the player back.
- Sniper: Heavy precision weapon. Hold right click to enter steady mode, locking movement and making the player fully invisible to local and remote players for up to 30 seconds. Left click reveals immediately and fires the chambered shot; waiting too long auto-reveals with sound/effect. Steady shots deal more damage, mark targets, and pierce harder. Head shots are near lethal, and lower-body shots apply a 10-second leg-shot slow with pixel blood flecks.
- Knife: Infinite throwing knife in slot 11. Right click or `G` throws a fast spinning knife without ammo or inventory loss, with a short cooldown and noticeable recoil; every grounded or airborne throw kicks the player opposite the aim direction, and airborne throws kick much harder for movement tricks. Touching another combatant while Knife is equipped deals small bleed contact damage on a short per-target cooldown, including during walking, sliding, and dashing. Left click still chains quick close slashes/stabs that can bleed.
- Machete: Heavy blade in slot 12. Left click swings a wide pushing slash with a tip bonus, slide slashes cleave farther, air slashes slow falling slightly, and right click uses a slower overhead chop. Every successful Machete damage hit permanently grows its range for the current weapon state with no gameplay cap; every Machete KO grows it much more and adds permanent damage. As it gains range/power, the blade and slash visuals heat from green toward red.
- Axe: Heavy blade hybrid after Machete. Left click swings a slower focused chop with high knockback, bleed, and an axe-head sweet spot. Right click or `G` throws a spinning axe without dropping inventory, slower than Knife but stronger with heavy knockback, one bounce, hit/impact sounds, and cleanup so thrown axes do not become permanent objects. Slide attacks add horizontal force, and airborne/falling chops pull the player downward for heavier hits.

## Movement Combat

- Slide Trip: Ground `Shift` slide trips enemies on contact, dealing light damage, upward pop, knockback, and short stun.
- Low Slide Trip: `S` + `Shift` slides longer and trips harder with stronger pop and stun.
- Head Stomp: Landing on a target's head with downward velocity deals damage, stuns/squashes the target briefly, bounces the stomping player upward, clears dive state, and refreshes one midair double jump.
- Air Dive Hit: `Shift` in air dives into targets for damage, knockback, and about one second of stun.
- Ground Slam Damage: `S` in air starts a ground slam. Direct body contact damages targets, and floor impact creates a tuned shockwave.
- Weapon Weight: Light weapons keep movement snappy, balanced weapons stay close to default physics, and heavy/very heavy weapons reduce run speed, acceleration, air control, jump strength, and slide speed.

## Projectile And Status Rules

- Floor Collision: Projectiles resolve against the platform floor. Non-ricochet shots impact and expire, ricochet shots have limited bounces, and safety cleanup removes anything that escapes world bounds.
- Hit Locations: Weapon and body hits classify contact as head/top 25%, body/middle 45%, or leg/bottom 30%. Head hits deal 1.8x damage with extra stun/knockback, body hits use normal damage, and leg hits deal 0.65x damage with reduced vertical knockback plus weapon-specific slows or suppression.
- Ricochet: Slingshot stones can bounce many times. Revolver crouch/low shots can ricochet once. Normal bullets do not bounce forever.
- Teleporting Ball: The marker bounces/sticks above the floor and remains usable for the delayed teleport instead of falling into the void.
- Lightning Aura: Shocked targets glow with a yellow/gray aura and electric pixel sparks while the shock status remains active.
- Knife Throw: Thrown knives hit online/offline combatants, bleed on impact, show a brief stick/spark, then clean up automatically because Knife has infinite throws.
- Axe Throw: Thrown axes hit online/offline combatants, bleed on impact, hit harder and knock farther than Knife throws, bounce once, then clean up automatically.
- Machete Growth: Machete hitboxes use the current grown range and damage bonus, and each swing records targets already hit so long blades do not damage the same target multiple times per swing.

## Loading Screen And Sound

The first screen shows a recreated keyboard layout with keycaps, labels, mouse controls, and a continue button. The game uses procedural Web Audio sounds generated in code; there are no copyrighted external sound assets. Volume constants live in `src/game/combat/CombatTuning.ts`, and repeated sounds such as footsteps, minigun fire, and shock pulses are rate-limited in `src/audio/SoundSystem.ts`.

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

Open the printed local URL, usually `http://localhost:5173`. The first screen is a controls/loading screen with keyboard keycaps and mouse controls. Continue to the main menu, press **Play**, choose a name/color, then use **Offline Test** for local movement and combat. Offline Test spawns a training dummy and shows the enabled armory strip along the bottom of the screen. Use `1`-`9`, `0`, and `Q`/`E` to equip the enabled weapons; Knife, Machete, and Axe are after Sniper and are easiest to reach with `E`.

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
8. Shoot, whip, hammer, slide, stomp, dive, and ground slam the other player. Remote players should take HP damage, knockback, hitstun/status effects, damage numbers, KO, and respawn.
9. Open a third browser window or context, join the same room, and verify all three pages show two remote players in the F3/debug data. The automated 3-page test checks `window.__PIXEL_BRAWLER_DEBUG__`, not just UI text.
10. For a five-player smoke test, host a public room, join four more browser contexts by code, then open a fresh Join screen and confirm the public row shows `5/10 players`. Public and private rooms allow up to 10 players, public rows show `1/10`, `2/10`, `3/10`, and so on, and joining is blocked only once the room reaches `10/10`.

You can also run the automated multiplayer smoke tests after both dev servers are running. They include two-browser regression coverage, a three-page private-room mesh test, and a five-page public-room count smoke:

```bash
npm run test:multiplayer
```

Press `F3` in a local/dev browser to toggle the compact network debug overlay. The same safe state is exposed as `window.__PIXEL_BRAWLER_DEBUG__` for Playwright and manual console checks. It includes the signaling URL, room code, client/peer IDs, WebSocket status, WebRTC peer status, data-channel status, connected peer count, room player count, fallback count, and remote player count/positions.

If players do not appear or combat packets do not apply, check both browser consoles, the F3 overlay, and the Worker terminal. Gameplay packets prefer WebRTC data channels and use the room WebSocket as a targeted fallback while channels connect. On the deployed Pages site, the client falls back to `https://pixel-brawler-p2p-signaling.2ndsebastiantablet.workers.dev` when `VITE_SIGNALING_URL` is not set; local dev still falls back to `http://localhost:8787`.

## Host Kick And Ban

Hosts can kick or ban non-host players from the Escape menu. Bans use the stable `clientId` stored in each browser. The host browser stores banned client IDs in localStorage and sends that list when creating future private or public servers; the Worker enforces the list it receives for that room. Clearing host localStorage or hosting from another browser/device removes that local ban list.

## Server Cleanup And AFK

- Host leaves or disconnects: the room closes, connected players receive a server-closed message, the public listing is removed, and the private room code becomes invalid.
- Last player leaves: the room closes and disappears from the public list.
- Duplicate joins with the same `clientId` replace the older socket so rejoining does not leave ghost peers behind.
- AFK warning: after 5 minutes without room activity, the player receives `You will be kicked for AFK soon.`
- AFK kick: after 6 minutes without room activity, regular players are kicked with `You were kicked for being AFK.` If the host is AFK, the server closes.

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

If Worker or Durable Object code changes, run `npm run worker:deploy` after tests pass. This patch keeps Worker source unchanged, so deploying the Worker is not required for the checked-in code changes; deploy Pages/front-end assets so the live site gets the updated mesh status/debug and combat behavior. In non-interactive terminals, Wrangler requires `CLOUDFLARE_API_TOKEN`.

## Useful scripts

```bash
npm run dev          # Vite dev server
npm run build        # TypeScript check and production build
npm run preview      # Preview built dist
npm run check        # TypeScript check and Vitest unit tests
npm test             # Vitest unit tests only
npm run test:multiplayer # Playwright multiplayer smoke tests, including 3-page and 5-page rooms
npm run worker:dev   # Local Cloudflare Worker/Durable Object signaling server
npm run worker:deploy
```

## Current limitations

- Combat is a playable twelve-weapon vertical slice, not final balance.
- Multiplayer combat uses client-predicted hit detection. The attacking client detects hits against synced remote combatants, broadcasts hit packets with target/damage/knockback/status details, and each target/observer applies the result locally. This is playable prototype sync, not rollback netcode or authoritative anti-cheat validation.
- The WebRTC mesh and targeted Worker relay fallback support rooms up to 10 players. They are intentionally simple and may need TURN, rate limiting, host validation, or server authority before serious competitive play.
- AFK enforcement is Worker-side and based on room activity messages. Normal open clients send frequent state updates, so the timeout primarily catches disconnected, stalled, or inactive sockets.
- Public room entries are short-lived development records hydrated from live Durable Objects when listed.
- Deployed Pages and Worker versions must match. If Pages serves an older asset or Worker `/health` lacks `signalingProtocolVersion:2`, deploy the stale side before trusting live multiplayer results.
