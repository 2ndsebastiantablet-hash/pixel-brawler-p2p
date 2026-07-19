# pixel-brawler-p2p

A fast 2D pixel-art platform brawler prototype with a canvas game loop, procedural chunky stick-figure fighters, multiplayer room state sync, and Cloudflare Worker + Durable Object signaling.

## What is included

- Vite + TypeScript front end.
- Plain canvas side-view game loop with crisp pixel rendering.
- Main menu flow for Play, player setup, hosting, joining, and Offline Test.
- Player name/color customization and real equipment loadouts stored in localStorage, with a front/back character creator, one clear front hand target, a front leg target, front/back strap targets, a glowing attachment-string target, item search, right-click slot clearing, an explicit starter-loadout button, and drag/drop equipment placement. Fresh profiles start empty unless saved gear exists.
- Procedural one-color chunky pixel brawler rendering with idle, run, jump, double jump, slide, low slide, air dive, duck, ground slam, and slam landing poses.
- Compact in-game HUD for private room codes, public server names, Offline Test, and the active Q/E/mouse/F/leg loadout slots.
- Escape server menu with player list, leave/end server, host kick/ban controls, and an in-game Edit Character button that returns to the live match after saving name/color/loadout edits.
- Private and public online rooms support up to 10 players, with public room counts shown as `players/10`.
- Host-left, empty-room, and AFK cleanup are handled by the Durable Object room so stale public servers disappear and old private codes become invalid.
- Rebuilt combat slice with 100 HP, hitstun, invulnerability flash, HEAD/BODY/LEG damage labels, stronger knockback, projectiles, directional melee hitboxes, status effects, weapon cooldowns, reloads, equipment slots, drops, throws, pickups, crosshair aiming, screen shake, hit sparks, blood flecks, and an offline training dummy.
- Thirty-one enabled polished weapons/items for this slice: pistol, whip, teleporting ball, lightning rod, sledgehammer, slingshot, laser blaster, revolver, minigun, sniper, knife, machete, axe, wings, virgin blood, death aura, rocket, hands, super legs, holy bazooka, grappling hook, chainsaw, spikes, van, Spirit of a Fighter, cross, The Moon, Jupiter, Uranus, Mars, and Neptune.
- Optional hybrid Three.js/WebGL render layer in `src/game/render3d/` for real low-poly 3D model support beside the current 2D canvas. It now renders visual-only Jupiter sharks, the centered Uranus/Saturn ring planet, the remade left-side Ring Chomper, Mars event planet models, and Neptune boss/sea-creature models when available. The Moon stays in the 2D background during live gameplay so it cannot cover fighters, and the layer fails closed so the 2D game still loads if WebGL is unavailable.
- Centralized combat tuning in `src/game/combat/CombatTuning.ts` for knockback, recoil, body-contact values, weapon weight, sound volume, laser heat/charge, minigun spin-up, projectile floor rules, and sniper leg-shot slow.
- Weapon weight strongly affects movement speed, acceleration, air control, jump height, and slide speed.
- Body-contact combat for Knife contact cuts, slide trips, stronger low-slide trips, head stomps, air-dive hits, ground-slam direct hits, and ground-slam shockwaves.
- Louder procedural Web Audio sound effects for menu actions, movement, impacts, hits, reloads, weapon use, teleporting, lightning, heavy hammer and axe attacks, ricochets, lasers, revolver shots, minigun spin/fire, sniper shots, wing flaps, wind, bursts, gust pushback, holy blessing, revive, death aura pulses, rockets, Holy Bazooka shots/explosions/pickups, grappling hooks, chainsaw running/overheat, spike mode/growth/impales/crumbling, van spawn/absorb/drive/honk/crash/explosion, Spirit beat focus/perfect/miss sounds, Cross shield/bounce/Judgment sounds, Moon activation/switch/end sounds, Jupiter footstep/tornado/shark sounds, Uranus fall/impact/flash/chomp sounds, Mars extraction/clone release sounds, Neptune roar/wave/slam/laser/creature sounds, zombie bites, and crawling hands. Volume constants are fed from the central combat tuning file.
- Remote players are real combat targets with hurtboxes, synced current/max HP, knockback, status effects, KO/respawn state, soft body collision, projectile hits, mouse-directed melee hits, slide trips, stomps, dives, and ground-slam interactions. Remote state also includes active weapon/item, loadout slot visuals, held item silhouettes, visual-only bullets/throws/rockets/hands/Holy Bazooka missiles/grappling ropes/spikes/Cross shields/Judgment beams/Moon/Jupiter/Uranus/Mars/Neptune events from combat events, synced Van state, charge aim/charge time, active Death Aura, rocket placed/lit/riding state, poison and spike poison tint, Spike Mode hand blocking, Spirit Focus/Winded status visuals, and major buff/status visuals.
- The arena platform is finite: walking or falling past the stage edge drops into the void, kills the combatant through the normal respawn flow, returns them to spawn, and grants a two-second blue invulnerability glow that ignores damage/knockback locally and online.
- Cloudflare Worker + Durable Objects for room creation, public room listing, lobby WebSockets, room metadata, player lists, kick/ban controls, WebRTC signaling, and targeted state/combat relay fallback.

The client creates a WebRTC data-channel mesh between all peers for gameplay packets. Until a data channel is open, or when one direct peer connection hiccups, the Worker relays compact state/combat packets only to the peers that still need fallback delivery. Gameplay simulation remains client-predicted and client-owned for now. Future rollback, prediction, and host/server authoritative validation should replace the current practical prototype sync in `src/net/WebRTCClient.ts`, `src/game/Game.ts`, and `src/game/combat/CombatSystem.ts`.

## Hybrid 3D rendering foundation

The game is still a 2D gameplay game. The current canvas renderer, combat, player sprites, loadout editor, maps, and multiplayer packets remain in place. The optional Three.js layer renders real low-poly 3D event objects through `src/game/render3d/ThreeLayer.ts`, with reusable model factories in `LowPolyFactory.ts`, lifecycle tracking in `ModelRegistry.ts`, and coordinate helpers in `Render3DTypes.ts`.

By default the layer initializes without demo actors. During active combat events it mirrors existing snapshot state with 3D Jupiter sharks, a translucent centered Saturn-style Uranus planet with rings, a remade yellow left-side Ring Chomper, a red/orange Mars model, and Neptune boss/sea-creature actors; the Moon event is drawn behind gameplay in the 2D canvas layer to keep the playfield readable. Existing 2D canvas event art remains the fallback when render3d is disabled or unavailable. Enable the small rotating cube demo with `?render3dDemo=1` or `localStorage.setItem("pixel-brawler-p2p.render3d.demo", "true")`. Disable WebGL with `?render3d=0` or `localStorage.setItem("pixel-brawler-p2p.render3d.disabled", "true")`. Details, current Jupiter/Uranus/Moon/Mars/Neptune model notes, and rollback instructions live in `docs/3d-rendering.md`.

## Controls

- `A` / `D`: Move.
- `Space`: Jump, then double jump. Near an active Van, `Space` enters it; while driving, `Space` exits.
- With Wings equipped, hold `Space` to launch/flap, release to glide, press `S` in air to dive, and press airborne `Shift` for a movement-only air burst.
- With Super Legs equipped, `Space` still jumps/triple-jumps and also triggers cooldown-gated kick combos based on movement direction: forward flying kick, back kick, downward stomp, or leg slam.
- `Shift` on ground: Dash / slide.
- `Shift` in air: Air dive.
- `S` on ground: Duck.
- `S` + `Shift` on ground: Low slide.
- `S` in air: Ground slam.
- `N`: Toggle player names.
- `Escape`: Server info / leave menu, including Edit Character during a match.
- Mouse move: Aim crosshair.
- Left mouse: Use the held item primary action.
- Right mouse: Use the held item alternate/secondary action, such as Knife throw, Axe throw/recall, Rocket light, Holy Bazooka ammo call, Grappling Hook pull while attached, Chainsaw stop/vent, Virgin Blood consume, or Cross Judgment Day. Pistol right click does not throw the pistol.
- `Q`: Activate the front strap slot only. If Spikes is strapped, this starts 30 seconds of Spike Mode; if Van is strapped, this spawns or absorbs the physics van; if Spirit of a Fighter is strapped, this starts Beat Focus; if The Moon is strapped, it is consumed to flip the map for one minute; if Jupiter is strapped, it is consumed to start one minute of floaty gas, delayed footstep bursts, and shark tornado; if Uranus is strapped, it is consumed to drop a planet and reveal the moving ring arena; if Mars is strapped, it is consumed to raise Mars and release AI duplicates from green extraction beams; if Neptune is strapped, it is consumed to summon the one-minute ocean boss event.
- `E`: Activate the back strap slot only. If Spikes is strapped, this starts 30 seconds of Spike Mode; if Van is strapped, this spawns or absorbs the physics van; if Spirit of a Fighter is strapped, this starts Beat Focus; if The Moon is strapped, it is consumed to flip the map for one minute; if Jupiter is strapped, it is consumed to start one minute of floaty gas, delayed footstep bursts, and shark tornado; if Uranus is strapped, it is consumed to drop a planet and reveal the moving ring arena; if Mars is strapped, it is consumed to raise Mars and release AI duplicates from green extraction beams; if Neptune is strapped, it is consumed to summon the one-minute ocean boss event.
- During The Moon event, press both mouse buttons to switch the Moon user between the bottom invisible floor and the upside-down top side; pressing both buttons again mid-switch reverses the transition.
- `F`: Safely swap the attachment string item with the current hand item, move a held compatible item onto an empty attachment, move an attachment item into an empty hand, or pick up nearby compatible gear first. Empty attachment plus empty hand does nothing.
- `R`: Reload the currently held ammo weapon. This works after `F` swaps, respawn, and while driving the Van if the held weapon can fire from inside; strap/body items without ammo do not reload.
- `G`: Drop / throw the current active item. Physical non-knife, non-pistol throws leave the inventory until the dropped item is picked up; Axe still uses recall.

## Enabled Weapons

- Pistol: 20-shot tap-fire sidearm. A hand slot fires one bullet for 10 damage, `R` reloads, a late `R` press during reload grants three perfect shots, air shots recoil the player, slide shots get extra speed/knockback, close shots knock harder, right click/`G` do not throw or remove it, and the old global weapon cycling controls are no longer used.
- Whip: Very long mouse-aimed control weapon. The body hit deals light damage, the tip sweet spot adds stun/knockback, low/duck whip trips, air whip stalls slightly, and the same target is pulled only after two quick whip hits inside the combo window.
- Teleporting Ball: Left click throws a higher, farther arcing marker that rolls with momentum after landing. After three seconds the player teleports to the ball unless right click cancels it. Direct hits deal small damage and speed up the teleport. Arrival creates a small burst that damages and knocks enemies away.
- Lightning Rod: Hold/release left click to call a giant directional strike from the aimed direction toward the rod. Side, downward, and diagonal strikes damage targets on the bolt path without granting the full buff. Specifically holding upward self-charges the player: longer holds deal more self-damage, form a long visible lightning column that shifts yellow to blue to red to purple, and grant longer empowered time with faster movement, stronger attacks, visible aura, and touch shocks on a per-target cooldown. Right click still raises the rod for the delayed call-lightning behavior, now with strain-scaled empowerment rather than a fixed 60-second timer. Thrown rods shock on hit or landing.
- Sledgehammer: Heavy slow weapon with a large pixel hammer. Holding left click charges an overhead slam, full charge creates a shockwave, air attacks pull downward, right click shoves, and heavy impacts add recovery, screen shake, sound, big damage, and knockback.
- Slingshot: Light five-stone volley weapon. Hold left click to stretch and release five fast stones, right click fires a wider five-stone scatter, each volley consumes five ammo, stones travel far with low gravity, and they ricochet many times with clack feedback instead of vanishing quickly.
- Laser Blaster: Heat and charge weapon. Hold left click to build charge, release to fire a visible piercing bolt even from short or overheated charge, right click vents heat with a short radial blast, and holding to maximum risks an overcharge burst.
- Laser charge now scales damage, beam width, beam length, enemy knockback, self-recoil, heat, visual brightness, and shake. Heat turns the blaster red, venting cools it, and overcharge creates a small damaging particle burst.
- Revolver: Six-shot high-knockback sidearm. Left click fires deliberate tap shots, right click fan-fires several rounds with stronger self-recoil, the last bullet hits harder with extra kick, and head/leg hits become especially dangerous or slowing.
- Minigun: Very heavy sustained-fire weapon. Hold right click to pre-spin, hold left click to spin/fire, and it must spin for five seconds before firing. Heat rises while firing, overheat locks the gun briefly, the barrels glow red, and recoil pushes the player back.
- Sniper: Heavy precision weapon. Hold right click to enter steady mode, locking movement and making the player fully invisible to local and remote players for up to 30 seconds. Left click reveals immediately and fires the chambered shot; waiting too long auto-reveals with sound/effect. Steady shots deal more damage, mark targets, and pierce harder. Head shots are near lethal, and lower-body shots apply a 10-second leg-shot slow with pixel blood flecks.
- Knife: Infinite throwing knife in slot 11. Right click or `G` throws a fast spinning knife without ammo or inventory loss, with a short cooldown and noticeable recoil; every grounded or airborne throw kicks the player opposite the aim direction, and airborne throws kick much harder for movement tricks. Touching another combatant while Knife is equipped deals small bleed contact damage on a short per-target cooldown, including during walking, sliding, and dashing. Left click still chains quick close slashes/stabs that can bleed.
- Machete: Heavy blade in slot 12. Left click swings a wide pushing slash with a tip bonus, slide slashes cleave farther, air slashes slow falling slightly, and right click uses a slower overhead chop. Every successful Machete damage hit permanently grows its range for the current weapon state with no gameplay cap; every Machete KO grows it much more and adds permanent damage. As it gains range/power, the blade and slash visuals heat from green toward red.
- Axe: Heavy blade hybrid after Machete. Left click now auto-rushes from a much farther range toward the nearest valid target, locks the user into the charge briefly, then swings when close or timed out; if no rush target is in range, it falls back to an extended heavy chop with high knockback, bleed, and an axe-head sweet spot. Right click throws the actual held Axe, removing the held visual and blocking Axe melee until right click recalls the existing thrown axe like a hammer return. The returning axe pierces through targets with stronger damage/knockback and a blue electric trail before being caught, without leaving permanent drops or projectiles.
- Wings: Light mobility item after Axe. Wings have no left-click or right-click attacks, no thrown form, and no dive damage. Hold `Space` to launch and flap upward, release to glide, use `A`/`D` for air control, hold `S` to dive faster, and press airborne `Shift` for a cooldown-gated movement burst. Rapid flapping near a dummy, enemy, or online player creates a visible close gust radius that repeatedly pushes targets away with 0 damage and tiny hitstun until they leave the radius.
- Virgin Blood: Light holy utility item after Wings. Left or right click consumes it to fully heal, gain a holy buff, and arm one revive once it is held. `F` swaps it between the attachment string and the current hand item instead of consuming it. If killed while the revive is ready, the player revives once with restored HP, invulnerability, renewed holy buff, and 30 seconds of angel wings flight using the Wings movement model. The blessing has a long cooldown and cannot chain infinite revives.
- Death Aura: Dark utility item after Virgin Blood. Left or right click releases a 60-second dark aura, then starts a 40-second cooldown. Stored suffering from damage taken persists through cooldown and combines with missing health to make the radius larger, damage ticks stronger, freezes longer, and smoke darker. Activation particles expand outward, ending particles pull inward, and frozen targets are shown inside an ice block with heavy gravity until the freeze expires.
- Rocket: Deployable ridable explosive after Death Aura. As a two-handed loadout item, left mouse places one rocket facing the aimed direction, right mouse lights it when nearby or standing on it, and standing on it attaches the rider. Lit rockets launch straight in their facing direction briefly and can be gently guided toward the rider's mouse aim, then veer into chaotic fire-trail flight with only reduced guidance; `Space` jumps off before the explosion and destabilizes the path. Rocket explosions are giant true-radius splash attacks with very heavy center damage, lighter edge damage, huge knockback, owner/rider splash damage, and matching fireball/smoke/shockwave/debris visuals.
- Hands: Summoner item after Rocket. Left or right click summons five crawling mini-hands, then the summoner loses their own hands for about 40 seconds and cannot use weapons/items. The mini-hands chase non-owner targets, attach to faces, deal tiny damage over time, and scramble movement until the target spams movement/jump inputs to flick them off.
- Super Legs: Leg equipment after Hands. Super Legs can only equip in the front leg slot, not the hand, strap, or attachment slots. They massively increase run speed, acceleration, first-jump height, second-jump strength, third-jump reliability, slide speed, slam force, and air control; show visible powered pixel legs, glowing boots, and speed streaks; reduce leg-hit damage; resist leg-shot slow/stagger; and add Space-based kick combos including rising kicks, forward flying kicks, back kicks, downward stomps, stronger leg slams, and bounce-style recovery without replacing normal jump behavior. After the third jump, air jumps lock until landing or a valid reset, so Super Legs no longer become jump-flight.
- Holy Bazooka: Very heavy two-handed launcher after Super Legs. It can be held or stored on the attachment string because attachments accept any handheld item. It starts empty; right click calls one visible +1 holy ammo pickup onto a valid map spot away from the hand, with its own cooldown and active pickup cap. Left mouse fires only when ammo is loaded and the 7-second fire cooldown is ready. The shot is a homing missile with giant recoil; on impact it creates a huge white-gold holy explosion larger than Rocket splash, using true radius falloff damage/knockback, owner splash if close, the strongest blast shove in the game, and health/max-health steal from damaged targets.
- Grappling Hook: Light hand/attachment-compatible mobility tool after Holy Bazooka. Left click fires a physical segmented rope hook that can attach to the floor, walls/platform edges, training dummies, enemies, and online players. Left click while attached releases the rope instead of firing again. Right click now pulls/winches the owner toward the current target or anchor with capped speed, rope sag, tension, finite max length, and visible hook/rope particles. Player attachments deal only light 6-damage contact and a tiny tug.
- Chainsaw: Heavy handheld close-range weapon after Grappling Hook. Left click starts the saw running immediately at close range for low damage over time, starts at 8 DPS, scales slowly from total chainsaw damage dealt, and overheats after about 15 active seconds before cooling down. There is no rev-up meter, rev percentage, or startup delay. Right click or release stops/vents it. Chainsaw kills spawn AI zombies at the victim's death spot, with health, speed, and bite strength based on how much chainsaw damage that owner dealt to that victim before the KO; zombies rise from the ground while inactive/invulnerable before their AI starts. Killed zombies play a small death effect and are removed permanently; they do not respawn unless another Chainsaw KO creates a new one.
- Spikes: Light strap-only weapon after Chainsaw. Equip it only on the front or back strap; it cannot go in hands, attachment, or legs. Press `Q`/`E` to activate 30 seconds of Spike Mode, which hides/blocks the hand item without deleting it. During Spike Mode, left or right mouse clicks choose the spike tip destination, then the base is calculated behind it so the spike grows and rotates toward the click, including high/floating air clicks. Touching the spike body poisons any combatant, including the owner; touching the tip impales and pins dummies, enemies, online players, or the owner regardless of strength/armor. Impaled targets release on spike disintegration, mode end, death, Teleporting Ball arrival, a strong Grappling Hook pull, or failsafe. When the mode ends, all owner spikes disintegrate and a 60-second cooldown starts.
- Van: Heavy strap-only vehicle after Spikes. Equip it only on the front or back strap. Press `Q`/`E` to spawn one persistent white panel van or absorb it back from anywhere, including from the air; absorbing kicks out any occupant, does not heal the van, and only refills gas while stored. Anyone can press `Space` near the van to drive it. While driving, `A`/`D` accelerate faster than player run speed, `Shift` cycles speed levels 0-5, right click honks only when no right-click weapon action is available, and `Space` exits. Gas lasts about 50 seconds at max speed and longer at lower speeds. The van has health, momentum, heavy gravity, hard-landing damage, recoil, wall crashes, wheel/dust/smoke visuals, projectile/melee/aura/explosion/spike/slam damage, ramming knockback based on impact speed, and a strong radius explosion when destroyed that can hurt the owner, driver, dummies, enemies, and online players.
- Spirit of a Fighter: Light strap-only rhythm focus mode after Van. Equip it only on the front or back strap, then press `Q`/`E` to activate up to 25 seconds of Beat Focus with a 60-second cooldown. While active, hand weapons are hidden/disabled without being deleted; the Spirit user's screen becomes a gray focus view with a bottom heart assembled from particles, three miss markers, and left/right beat lines moving into it. Left click punches, right click grabs/throws, `Shift` flash-steps, and fresh `A`/`D` or jump inputs all must land on beat. Patterns include normal, split, fast, slow, double, burst, unsynced, and fake-out cues as difficulty rises. Perfect/good timing builds combos, flurries, counters, and precision finishers. Missed beats, off-beat inputs, and whiffs consume one of three miss chances; the third miss or any incoming hit ends the mode and applies about 9 seconds of Winded movement penalty.
- Cross: Light hand/attachment-compatible holy item after Spirit of a Fighter. Left click creates a mouse-aimed crescent shield whose radius, duration, and knockback scale with its 10-second stopwatch charge; it bounces nearby combatants, shoves vans, and deflects hostile projectiles with tiny chip damage. Right click starts Judgment Day with a one-minute global countdown and no beams during the countdown. When the clock hits zero, about 200 tall lethal sky columns arrive over the next minute, with a one-second warning circle before each beam and a cap on active beams so the storm stays readable. Beams can hit enemies, dummies, online players, vans, and the Cross owner if they stand in a beam. After Judgment Day starts, the Cross rests for 180 seconds before either Cross action can be used again.
- The Moon: Light one-use strap-only Space item after Cross. Equip it only on the front or back strap. Press `Q`/`E` to consume it and flip the map upside down for one minute: everyone except the Moon user is moved to the screen-top side, the Moon user stays on the bottom invisible floor, and the user can switch sides by pressing both mouse buttons. A giant moon rises from the ground to center screen, holds during the event, descends during the final seconds, then the event restores cleanly without changing normal room signaling.
- Jupiter: Light one-use strap-only Space item after The Moon. Equip it only on the front or back strap. Press `Q`/`E` to consume it and start a one-minute Jupiter event that can stack with other global events. Jupiter no longer opens earthquake cracks or deadly holes. Instead, grounded steps and landings create visible orange/dark pressure markers that pulse for about one second, then erupt upward for light damage and strong vertical launch; the creator can be caught too. Orange gas makes gravity floaty, and a dark green shark tornado sucks in players/vans while spawning killable flying homing sharks drawn as simple low-poly PS1-style 3D models with body, head wedge, tail, fins, eyes, mouth, facets, and tilt.
- Uranus: Light one-use strap-only Space item after Jupiter. Equip it only on the front or back strap. Press `Q`/`E` to consume it: a faceted planet falls from the sky, grows dramatically toward center screen, hits the map, triggers a full-screen flash, then reveals a surreal Saturn-ring arena for about one minute. The 2D fighters keep normal combat controls on a fast scrolling ring floor while a large translucent rotating Saturn-like planet sits centered in the background without covering the fight. The old red debug kill line is gone; the Ring Chomper itself communicates the left danger zone. The ring does not carry players safely; falling behind the moving left boundary kills through normal respawn, and Uranus respawns players safely ahead of the boundary instead of on top of the Ring Chomper. A giant original low-poly yellow Ring Chomper stays anchored at the left side, uses jagged jaws, eyes, spikes/fins, a dark mouth interior, and obvious chomping animation, and instantly respawns players or destroys vans caught inside.
- Mars: Light one-use strap-only Space item after Uranus. Equip it only on the front or back strap. Press `Q`/`E` to consume it and start a one-minute Mars event that can stack with other global events. A red/orange Mars rises from the ground with green flickering beams, extracts a duplicate from every active player, drags the copies into the planet, then releases AI clones with the original player's color and loadout. Clones hunt their originals with item-aware behavior, can be killed, reform after a short delay while the event is active, and dissolve into green particles when Mars descends. Mars has no normal left-click or right-click attacks.
- Neptune: Light one-use strap-only Space item after Mars. Equip it only on the front or back strap. Press `Q`/`E` to consume it and summon a one-minute invincible ocean boss event. Neptune's giant hands rise through the platform, crush targets underneath, grab the map, then his torso, arms, neck, head, and crown rise without visible legs while blue text slams in and the roar shakes the screen. During the event he uses readable boss attacks: ocean vomit floods the entire map with buoyant swimming physics before he sucks the water back up; hand slams tilt the platform and slide players; laser eyes telegraph, track, and instantly kill touched targets; and sea-creature summons create killable urchins, octopuses, giant sharks, and clown fish. Urchins stick/poison targets for 10 seconds, octopus arms fling up to eight targets, giant sharks chase and bite, clown fish flop then shoot variable water pellets, and all Neptune water/tilt/creature state cleans up when he descends.

## Movement Combat

- Slide Trip: Ground `Shift` slide trips enemies on contact, dealing light damage, upward pop, knockback, and short stun.
- Low Slide Trip: `S` + `Shift` slides longer and trips harder with stronger pop and stun.
- Head Stomp: Landing on a target's head with downward velocity deals damage, stuns/squashes the target briefly, bounces the stomping player upward, clears dive state, and refreshes one midair double jump.
- Air Dive Hit: `Shift` in air dives into targets for damage, knockback, and about one second of stun.
- Ground Slam Damage: `S` in air starts a ground slam. Direct body contact damages targets, and floor impact creates a tuned shockwave.
- Weapon Weight: Light weapons keep movement snappy, balanced weapons stay close to default physics, and heavy/very heavy weapons reduce run speed, acceleration, air control, jump strength, and slide speed.
- Wings Flight: Wings replace normal air dive and ground slam with lift, glide, dive, and air-burst movement. Wings also soften falling by slowing descent while gliding.
- Super Legs Movement: Super Legs are always-on leg equipment. They stack large mobility buffs with the currently held weapon, give leg armor, enable exactly three jumps before reset, boost slide/super-slide/stomp/slam contact, and use Space kick hitboxes through the normal combat event path so online targets receive damage/knockback.
- Scrambled Movement: Face-attached hands swap/mix movement inputs briefly. Repeated movement, jump, dash, or duck input shakes the hands off.

## Projectile And Status Rules

- Floor Collision: Projectiles resolve against the platform floor. Non-ricochet shots impact and expire, ricochet shots have limited bounces, and safety cleanup removes anything that escapes world bounds.
- Hit Locations: Weapon and body hits classify contact as head/top 25%, body/middle 45%, or leg/bottom 30%. Head hits deal 1.8x damage with extra stun/knockback, body hits use normal damage, and leg hits deal 0.65x damage with reduced vertical knockback plus weapon-specific slows or suppression.
- Ricochet: Slingshot stones can bounce many times. Revolver crouch/low shots can ricochet once. Normal bullets do not bounce forever.
- Teleporting Ball: The marker flies in a high/far arc, rolls with friction after landing, and remains usable for the delayed teleport instead of falling into the void or being cleaned up before teleporting.
- Lightning Aura: Shocked targets glow with a yellow/gray aura and electric pixel sparks while the shock status remains active.
- Knife Throw: Thrown knives hit online/offline combatants, bleed on impact, show a brief stick/spark, then clean up automatically because Knife has infinite throws.
- Physical Weapon Throws: Non-knife, non-pistol, non-recall physical throws create a world pickup and remove that weapon from the player's weapon inventory until the pickup is collected again.
- Axe Throw And Recall: Thrown axes hit online/offline combatants, bleed on impact, hit harder and knock farther than Knife throws, and clean up automatically. While the thrown Axe exists, the owner no longer shows or swings a duplicate held Axe. A second right click recalls the existing thrown axe as a stronger piercing return projectile with a blue trail, hit packets, and a catch cleanup near the owner.
- Wings Gust: Wing flap gust packets use the same combat event path as other knockback so online players receive the shove without turning Wings into a normal damage weapon.
- Spike Mode: Spikes are a strap mode rather than normal left/right attacks. Spike mode, spike poison, hand blocking, rotated tip-targeted spike spawn visuals, body poison, impale hit packets, and disintegration particles use the existing combat snapshot/status/event flow so remote players can see spikes and receive impale/poison effects without changing signaling.
- Van Vehicles: Vans live in the combat snapshot as persistent physics entities with compact owner state sync. Other players can see spawn/absorb, movement, occupant, health, gas, speed level, honk, ramming, damage, smoke, and explosion effects without changing the Worker/signaling layer.
- Virgin Blood Revive: The blessing, holy buff, one-shot revive, angel wings status, and revive hit packets stay in the same combat/status flow as other player-owned effects so local and online clients receive the state without special networking paths.
- Green Buff Visuals: Empowered, holy, blessed, angel wings, and other major positive buffs show a visible green aura/outline so local and online players can read buffed targets quickly.
- Death Aura Field: Death Aura uses per-target tick cooldowns to avoid permanent stun-locking while still freezing and draining targets inside the current radius. Targets that leave the aura thaw normally once the synced frozen status expires.
- Rocket Projectiles: Rockets are tracked as owner projectiles, support one active rocket per owner, preserve placement facing, attach riders locally, show fire from the back of the rocket, and use reusable giant explosion radius/falloff damage events for online targets, dummies, riders, and nearby owners.
- Holy Bazooka Projectiles: Holy Bazooka ammo pickups are spawned manually by right click and live in the combat snapshot. Missiles steer toward nearby valid targets, and the reusable explosion helper applies huge distance-falloff splash damage, upward/outward knockback, hit packets, health steal, gold-white fireball visuals, smoke, shockwave, debris, sound, and screen shake.
- Grappling Hook Ropes: Grapples live in the combat snapshot as segmented rope state separate from normal projectiles. Local ropes attach to surfaces or combatants, lightly damage player/enemy targets through hit packets, restrain the owner at a long finite rope length, pull/winch only from right click, and release by left click, death/invalid target, or extreme snap distance. Remote primary/release/pull events spawn matching visual-only ropes without changing signaling code.
- Spirit Focus: Spirit of a Fighter is a strap mode rather than a normal hand attack. Beat Focus and Winded are synced statuses, the local timing HUD shows beat/combo/feedback/cooldown plus heart/beat-line focus visuals and three miss markers, and the full-screen gray focus treatment stays local so remote multiplayer simulation is not slowed.
- Cross Judgment: Cross shields and Judgment Day beams live in the combat snapshot/event flow. The shield uses normal combat hit events for pushback/projectile deflection. Judgment Day right click first broadcasts the global countdown, then beam warning circles and tall beam columns render through combat snapshot/event state while actual damage syncs through the same hit packets as other combat effects.
- Moon Event: The Moon is a strap-only one-use Space event. Activating it with `Q`/`E` consumes the equipped slot, broadcasts a one-minute upside-down map event, moves non-owner combatants to the screen-top side, keeps the owner on the bottom side until they press both mouse buttons, animates a giant moon rise/hold/descent, and restores sides when the event expires. Moon activation, side switching, timer state, sounds, and remote visuals use combat events/snapshots instead of Worker/signaling changes.
- Jupiter Event: Jupiter is a strap-only one-use Space event. Activating it with `Q`/`E` consumes the equipped slot, broadcasts orange floaty gas, delayed footstep pressure markers, tornado state, and killable homing sharks through combat snapshots/events, mirrors those sharks as real low-poly Three.js models when render3d is available, and cleans up only its own markers/sharks when the timer ends while allowing Moon, Uranus, Mars, Neptune, and Judgment Day to keep running.
- Uranus Event: Uranus is a strap-only one-use Space event. Activating it with `Q`/`E` consumes the equipped slot, broadcasts the falling planet, flash, moving Saturn-ring arena, invisible left kill boundary, and remade Ring Chomper through combat snapshots/events. Uranus is a visual/gameplay arena layer: it does not rewrite Worker/signaling state, mirrors the active centered Saturn-style planet and left-side Ring Chomper as real Three.js models when render3d is available, keeps the Chomper screen-anchored ahead of the scroll without a red debug line, and cleans up only its own scrolling boundary/chomper when the timer ends.
- Mars Event: Mars is a strap-only one-use Space event. Activating it with `Q`/`E` consumes the equipped slot, broadcasts the planet phase, green extraction beams, clone count, copied loadout/color data, clone reform state, and cleanup through combat snapshots/events. Mars clones are regular combat targets owned by the event, so they can damage, chase, be knocked back, die, reform while Mars remains active, and vanish without touching Worker/signaling code.
- Neptune Event: Neptune is a strap-only one-use Space event. Activating it with `Q`/`E` consumes the equipped slot, broadcasts a one-minute invincible boss state with intro hands, roar text, water/flood state, tilt state, laser-eye state, killable sea-creature combat bodies, pellet projectiles, sounds, and cleanup through combat snapshots/events. The boss model is visual-only; the crush zones, water buoyancy, tilt force, instant lasers, creature damage, and creature death cleanup stay in `CombatSystem` so dummies, online players, vans, enemies, and other event targets share the same authoritative hit path. If Moon, Jupiter, Uranus, Mars, Neptune, and Judgment overlap, the stable render priority is Uranus space/ring background, Moon background/top-floor overlay, Mars planet/beams/clones, Neptune boss/water/creatures, Jupiter gas/tornado/markers, then players/combat; each event owns and restores only its own state.
- Hands Attachments: Mini-hands are lightweight owner projectiles. Face attachment applies a synced scrambled status and tiny damage over time; the target can remove attachments by spamming movement inputs.
- Super Legs Armor: Super Legs mark the equipped player with a short refreshed status, reducing leg-hit damage and blocking leg-shot slow/stagger while leaving normal head/body hits effective.
- Chainsaw Zombies: Chainsaw damage is tracked per owner/victim pair. A lethal Chainsaw hit consumes that contribution record and spawns a zombie whose health clamps from the contribution amount, whose bite damage scales from weak to strong, and whose body rises from the ground with dirt/dust while inactive and invulnerable before its AI wanders until it sees a non-owner target, then runs in for a lunge bite. Once killed, the zombie's AI, combat body, target tracking, status state, and sync snapshot entry are cleaned up instead of respawning as a dummy-like body.
- Poison: Zombie bites apply an 18-second poison status. Poison slows movement, deals green-tinted damage over time, keeps a local green poison-heart timer visible until the poison ends or refreshes, emits dark green particles/tint locally and remotely, and refreshes through the same status packet flow as other combat effects. Spike impales apply stronger 18-second spike poison with a darker green tint, stronger slow, and faster DOT ticks.
- Remote Visual Projectiles: Non-hit remote combat events spawn visual-only bullets, throws, rockets, hands, and kick effects in the local combat snapshot. They render and expire like normal effects but do not apply duplicate damage or physics.
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

Open the printed local URL, usually `http://localhost:5173`. The first screen is a controls/loading screen with keyboard keycaps and mouse controls. Continue to the main menu, press **Play**, choose a name/color, edit the loadout side panel if desired, then use **Offline Test** for local movement and combat. The character creator uses true drag/drop: drag item cards onto the front hand X, front leg X, front chest strap X, straight glowing attachment-string X, or the single back strap X. The item grid has search and category filters. The attachment string accepts any physical handheld item, including Knife, Pistol, Revolver, Virgin Blood, Rocket, Machete, Slingshot, Axe, Grappling Hook, Holy Bazooka, Chainsaw, Cross, and other held weapons; body/projectable/event powers such as Hands, Death Aura, Wings, Spikes, Van, Spirit of a Fighter, The Moon, Jupiter, Uranus, Mars, and Neptune belong on front/back straps; Super Legs belongs only on the leg X. Fresh loadouts start empty unless saved gear exists. Use **Use Default Loadout** to fill the starter preset with Pistol in the left hand, Knife in the right hand, Wings on the front strap, Death Aura on the back strap, and Virgin Blood on the attachment string. Right-click an equipped X to clear it. Pressing `F` swaps attachment and hand items safely, moves compatible held items onto an empty attachment, or does nothing when both are empty. Offline Test spawns a training dummy and shows the equipped slot HUD.

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
8. If the host leaves or closes their page, the hosted server ends and guests return to the menu with “Host left. Server closed.” If a non-host leaves, the host server stays open and joinable.
9. Shoot, whip, hammer, slide, stomp, dive, and ground slam the other player. Remote players should take HP damage, knockback, hitstun/status effects, damage numbers, KO, and respawn. Also verify the other browser can see held weapons/items, Lightning Rod upward charging, Laser charge, Death Aura active rings, buff outlines, Wings, rocket state/guidance, Grappling Hook ropes/pulls, poison tint, rising zombies, Spike Mode hand blocking/rotated spike spawns/impales, Van spawn/driving/honk/ram/explosion state, Spirit Focus/Winded status, Cross shield/Judgment countdown and beam visuals, Moon flip/switch state, Jupiter gas/step markers/tornado/low-poly sharks, Uranus fall/flash/ring/chomper state, Mars beams/AI clones/reform cleanup state, Neptune boss/flood/tilt/laser/sea-creature state, and no-hands status.
10. Open a third browser window or context, join the same room, and verify all three pages show two remote players in the F3/debug data. The automated 3-page test checks `window.__PIXEL_BRAWLER_DEBUG__`, not just UI text.
11. For a five-player smoke test, host a public room, join four more browser contexts by code, then open a fresh Join screen and confirm the public row shows `5/10 players`. Public and private rooms allow up to 10 players, public rows show `1/10`, `2/10`, `3/10`, and so on, and joining is blocked only once the room reaches `10/10`.

You can also run the automated multiplayer smoke tests after both dev servers are running. They include two-browser regression coverage, host-close/non-host-leave coverage, a three-page private-room mesh test, and a five-page public-room count smoke:

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

- Combat is a playable thirty-one-weapon/item vertical slice, not final balance.
- Multiplayer combat uses client-predicted hit detection. The attacking client detects hits against synced remote combatants, broadcasts hit packets with target/damage/knockback/status details, and each target/observer applies the result locally. This is playable prototype sync, not rollback netcode or authoritative anti-cheat validation.
- The WebRTC mesh and targeted Worker relay fallback support rooms up to 10 players. They are intentionally simple and may need TURN, rate limiting, host validation, or server authority before serious competitive play.
- AFK enforcement is Worker-side and based on room activity messages. Normal open clients send frequent state updates, so the timeout primarily catches disconnected, stalled, or inactive sockets.
- Public room entries are short-lived development records hydrated from live Durable Objects when listed.
- Deployed Pages and Worker versions must match. If Pages serves an older asset or Worker `/health` lacks `signalingProtocolVersion:2`, deploy the stale side before trusting live multiplayer results.
