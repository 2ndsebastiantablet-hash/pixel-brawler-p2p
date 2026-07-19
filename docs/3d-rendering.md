# Hybrid 2D + 3D Rendering Foundation

Pixel Brawler remains a 2D gameplay game. The existing canvas renderer, physics, combat, loadout editor, maps, HUD, and multiplayer sync still own the playable experience. The new 3D code is an optional visual layer that can draw real Three.js objects beside the 2D canvas without controlling gameplay state.

## Rollback Point

A rollback branch and tag were created from the known-good version:

- Branch: `backup/pre-3d-renderer`
- Tag: `pre-3d-renderer-9a4ec39`
- Commit: `9a4ec39 Revise jupiter and add uranus event`

Rollback options:

```bash
git checkout backup/pre-3d-renderer
```

or:

```bash
git checkout pre-3d-renderer-9a4ec39
```

## Runtime Shape

The foundation lives in `src/game/render3d/`:

- `ThreeLayer.ts`: Owns the Three.js scene, camera, lights, WebGL renderer, resize handling, per-frame update, render call, fallback behavior, and debug status.
- `Render3DTypes.ts`: Defines render-frame types, feature flags, and `worldToThreePosition()` for mapping 2D world points into Three space.
- `ModelRegistry.ts`: Registers model actor factories, tracks live actors, updates them each frame, removes them from the scene, and disposes geometries/materials.
- `LowPolyFactory.ts`: Creates real low-poly Three meshes/groups for the demo cube and current event visuals: Jupiter sharks, Saturn/Uranus planet rings, the remade Ring Chomper, Moon, Mars, Neptune, and Neptune sea creatures.

`Game.ts` constructs the layer once, resizes it with the 2D canvas, sends it camera/viewport timing and event visual snapshots each tick, and calls its render method after the 2D draw. The layer does not mutate players, combatants, weapons, events, or network packets.

## Coordinate Mapping

The current 2D camera remains authoritative. `worldToThreePosition(point, camera, viewport)` converts a 2D world point into a Three position:

- 2D `x` maps to Three `x`.
- 2D downward `y` maps to Three upward `y` by flipping the sign.
- The viewport center maps to Three `(0, 0)`.
- The default scale is `64` pixels per Three unit.
- The default depth is `z = -5`.

Future 3D visuals should derive positions from existing gameplay snapshots/events, then map those positions through this helper instead of introducing new simulation state inside Three objects.

## Flags and Fallback

The layer is enabled by default, but demo actors are opt-in.

Enable the rotating cube demo:

```text
?render3dDemo=1
```

or:

```js
localStorage.setItem("pixel-brawler-p2p.render3d.demo", "true");
```

Disable the 3D layer:

```text
?render3d=0
```

or:

```js
localStorage.setItem("pixel-brawler-p2p.render3d.disabled", "true");
```

Force-enable after a stored disable:

```text
?render3d=1
```

If WebGL or Three initialization throws, `ThreeLayer` catches the error, logs one warning, exposes `available: false` in the debug snapshot, and leaves the 2D canvas running.

## Current Event Models

The current event conversions use `ModelRegistry` actors that are driven by existing `CombatSystem` snapshots:

- Jupiter sharks: `low-poly-shark` actors follow `jupiterSharks` positions, velocity, bite cooldown, and lifetime state with a simple PS1-style body, head wedge, fins, tail, eyes, and mouth. The 2D shark combat body remains authoritative and the actor is removed when the shark leaves the snapshot.
- Uranus/Saturn planet: a translucent rotating `saturn-planet` actor appears during the active Uranus ring arena, stays centered in the screen background, and uses separate front/back ring meshes driven by the existing ring scroll. Before the arena phase, a `uranus-intro` actor falls and grows toward center screen for the impact beat.
- Ring Chomper: a yellow `ring-chomper` actor stays anchored to the left side of the screen; its jagged jaws, dark mouth interior, eyes, and fins/spikes animate from the existing mouth-open state while the invisible 2D hazard radius remains authoritative.
- Moon: live gameplay draws the Moon event in the 2D background layer behind fighters so it cannot obscure combat. The factory still includes `moon-sphere` for model tests and future non-obstructing 3D use, but Moon floors, side switching, and timers remain in 2D gameplay code.
- Mars: a red/orange `mars-planet` model rises, pulses with green glow/ring accents during extraction, then descends. Green beam lines, clone pull/release state, clone AI, reform timers, and cleanup remain authoritative in 2D combat snapshots.
- Neptune: a giant `neptune-boss` actor rises with only torso, arms, hands, neck, head, and crown visible, then sinks during cleanup. Separate sea-creature actors mirror killable `neptuneCreatures` snapshot entries: spiky urchins, 8-arm octopuses, oversized giant sharks, and clown fish. Flood water, tilt force, hand crush, lasers, pellets, creature health, and damage remain authoritative in `CombatSystem`.
- Space-series events: keep gameplay in `CombatSystem`, sync through current snapshots/events, and make Three actors pure visual adapters.

When `?render3d=0`, stored WebGL disable is active, or WebGL initialization fails, the original 2D canvas visuals render instead. The safe rule remains: Three meshes may display state, but they should not own rules, damage, collision, timers, or multiplayer authority.
