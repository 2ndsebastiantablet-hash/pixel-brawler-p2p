import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICS, VOID_DEATH_Y, createPlayerState, stepPlayer } from "../src/game/Physics";
import { CombatSystem, neptuneTiltedGroundY } from "../src/game/combat/CombatSystem";
import { createCustomFighter } from "../src/game/combat/Fighter";
import { COMBAT_TUNING } from "../src/game/combat/CombatTuning";
import { createDefaultInventory } from "../src/game/combat/WeaponRegistry";

const playerState = createPlayerState("local", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, "Tester");

function lightningChargeColorFor(heldMs: number): string | undefined {
  const combat = new CombatSystem({ mode: "offline" });
  combat.start(createDefaultInventory());
  combat.equip("lightning-rod");
  const player = { ...playerState };
  combat.syncLocalPlayer(player, "Tester", "#18dff5");
  combat.usePrimary({ ownerId: "local", player, aim: { x: 0, y: -1 }, now: 100, heldMs, isNewPress: true });
  return combat.getSnapshot().effects.find((effect) => effect.label === "FORMING LIGHTNING")?.color;
}

describe("combat system", () => {
  it("keeps exaggerated combat feel constants in central tuning", () => {
    expect(COMBAT_TUNING.enemyKnockbackMultiplier).toBeGreaterThanOrEqual(1.35);
    expect(COMBAT_TUNING.selfRecoilMultiplier).toBeGreaterThanOrEqual(1.8);
    expect(COMBAT_TUNING.headStomp.bounceForce).toBeLessThanOrEqual(-700);
    expect(COMBAT_TUNING.groundSlam.radius).toBeGreaterThanOrEqual(170);
    expect(COMBAT_TUNING.sledgehammer.shockwaveRadius).toBeGreaterThanOrEqual(280);
    expect(COMBAT_TUNING.minigun.spinUpSeconds).toBe(5);
    expect(COMBAT_TUNING.projectiles.floorY).toBe(DEFAULT_PHYSICS.groundY);
    expect(COMBAT_TUNING.sniper.legShotSlowDuration).toBe(10);
    expect(COMBAT_TUNING.sound.masterVolume).toBeGreaterThanOrEqual(0.45);
  });

  it("creates custom fighter data ready for future body-part customization", () => {
    const fighter = createCustomFighter({
      playerName: "Rowan",
      playerColor: "#18dff5",
    });

    expect(fighter).toMatchObject({
      playerName: "Rowan",
      playerColor: "#18dff5",
      headShape: "round",
      torsoShape: "compact",
      armShape: "chunky",
      legShape: "athletic",
      equippedWeapon: "pistol",
    });
    expect(fighter.weaponInventory).toHaveLength(41);
    expect(fighter.weaponInventory).toContain("grabber");
    expect(fighter.weaponInventory).toContain("trident");
    expect(fighter.weaponInventory).toContain("mars");
  });

  it("fires pistol shots as tap-fire projectiles with ammo and dry-fire feedback", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const shooter = createPlayerState("local", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, "Tester");

    const first = combat.usePrimary({
      ownerId: "local",
      player: shooter,
      aim: { x: 1, y: 0 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });
    expect(first.kind).toBe("fired");
    expect(combat.getSnapshot().projectiles).toHaveLength(1);
    expect(combat.getPlayerInventory().ammo.pistol?.magazine).toBe(19);

    const held = combat.usePrimary({
      ownerId: "local",
      player: shooter,
      aim: { x: 1, y: 0 },
      now: 140,
      heldMs: 40,
      isNewPress: false,
    });
    expect(held.kind).toBe("blocked");
    expect(combat.getSnapshot().projectiles).toHaveLength(1);

    combat.getPlayerInventory().ammo.pistol!.magazine = 0;
    const dry = combat.usePrimary({
      ownerId: "local",
      player: shooter,
      aim: { x: 1, y: 0 },
      now: 300,
      heldMs: 0,
      isNewPress: true,
    });
    expect(dry.kind).toBe("dry-fire");

    const reloading = combat.reload("local", 400);
    expect(reloading.kind).toBe("reload-started");
    combat.update(1.2, [playerState]);
    expect(combat.getPlayerInventory().ammo.pistol?.magazine).toBe(20);
  });

  it("reloads a selected ammo weapon even when a strap item is currently equipped", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("spirit-fighter" as never);
    const ammo = combat.getPlayerInventory().ammo.pistol!;
    ammo.magazine = 0;
    ammo.reserve = 20;

    const reloading = combat.reloadWeapon("local", "pistol", 400);

    expect(reloading).toMatchObject({ kind: "reload-started", weaponId: "pistol" });
    combat.update(1.2, [playerState]);
    expect(ammo.magazine).toBe(20);
  });

  it("applies damage, knockback, hitstun, invulnerability, and respawn to the training dummy", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const dummy = combat.spawnTrainingDummy({ x: 120, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });

    const hit = combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      damage: 35,
      knockback: { x: 240, y: -120 },
      stun: 0.24,
      label: "TEST",
    });

    expect(hit.applied).toBe(true);
    expect(hit.remainingHp).toBe(65);
    expect(combat.getCombatant(dummy.id)?.hitstun).toBeGreaterThan(0);
    expect(combat.getCombatant(dummy.id)?.invulnerable).toBeGreaterThan(0);
    expect(combat.getSnapshot().damageNumbers[0]).toMatchObject({ amount: 35 });

    const ignored = combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      damage: 35,
      knockback: { x: 240, y: -120 },
      stun: 0.24,
      label: "TEST",
    });
    expect(ignored.applied).toBe(false);

    combat.update(0.6, [playerState]);
    combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      damage: 200,
      knockback: { x: 480, y: -220 },
      stun: 0.5,
      label: "KO",
    });
    expect(combat.getCombatant(dummy.id)?.hp).toBe(0);
    expect(combat.getCombatant(dummy.id)?.respawnTimer).toBeGreaterThan(0);

    combat.update(2.1, [playerState]);
    expect(combat.getCombatant(dummy.id)?.hp).toBe(100);
    expect(combat.getCombatant(dummy.id)?.x).toBe(dummy.spawnX);
  });

  it("preserves synced remote max health for visible health bars", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());

    const remote = combat.syncRemotePlayer({
      id: "peer-holy",
      name: "Holy Guest",
      color: "#fff4a8",
      x: 80,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
      hp: 143,
      maxHp: 220,
      statuses: ["holyBuff"],
    });

    expect(remote.hp).toBe(143);
    expect(remote.maxHp).toBe(220);
    expect(combat.getSnapshot().combatants.find((combatant) => combatant.id === "peer-holy")).toMatchObject({
      hp: 143,
      maxHp: 220,
    });
  });

  it("kills void-fallen combatants and gives a full blue respawn invulnerability window", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState };
    const combatant = combat.syncLocalPlayer(player, "Tester", "#18dff5");
    player.y = VOID_DEATH_Y + 20;

    combat.update(1 / 60, [player]);

    expect(combatant.hp).toBe(0);
    expect(combatant.respawnTimer).toBeGreaterThan(0);
    expect(combatant.x).toBe(combatant.spawnX);
    expect(combatant.y).toBe(combatant.spawnY);

    combat.update(2.05, [player]);
    expect(combatant.hp).toBe(100);
    expect(combatant.invulnerable).toBeGreaterThan(1.7);
    player.x = combatant.spawnX;
    player.y = combatant.spawnY;

    const blocked = combat.applyDamage({
      sourceId: "training-dummy",
      targetId: "local",
      damage: 30,
      knockback: { x: 400, y: -300 },
      stun: 0.3,
      label: "RESPAWN TEST",
    });
    expect(blocked.applied).toBe(false);
    expect(combatant.hp).toBe(100);

    combat.update(2.1, [player]);
    const applied = combat.applyDamage({
      sourceId: "training-dummy",
      targetId: "local",
      damage: 30,
      knockback: { x: 400, y: -300 },
      stun: 0.3,
      label: "RESPAWN TEST",
    });
    expect(applied.applied).toBe(true);
  });

  it("classifies hit locations and scales damage, stun, knockback, labels, and hit events", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const dummy = combat.spawnTrainingDummy({ x: 120, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });

    const head = combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      damage: 20,
      knockback: { x: 200, y: -80 },
      stun: 0.2,
      label: "REVOLVER",
      weaponId: "revolver",
      hitY: dummy.y + dummy.height * 0.1,
    });
    expect(head).toMatchObject({ applied: true, hitLocation: "head" });
    expect(head.remainingHp).toBe(64);
    expect(combat.getCombatant(dummy.id)?.hitstun).toBeGreaterThan(0.3);
    expect(combat.consumeEvents()[0]).toMatchObject({ hitLocation: "head", damage: 36 });
    expect(combat.getSnapshot().damageNumbers.at(-1)?.label).toContain("HEAD");

    const target = combat.getCombatant(dummy.id)!;
    target.hp = 100;
    target.invulnerable = 0;
    target.hitstun = 0;
    target.velocityX = 0;
    target.velocityY = 0;
    combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      damage: 20,
      knockback: { x: 200, y: -160 },
      stun: 0.2,
      label: "REVOLVER",
      weaponId: "revolver",
      hitY: dummy.y + dummy.height * 0.86,
    });
    expect(target.hp).toBe(87);
    expect(target.velocityY).toBeGreaterThan(-300);
    expect(target.statuses.some((status) => status.id === "legStagger")).toBe(true);
    expect(combat.getSnapshot().damageNumbers.at(-1)?.label).toContain("LEG");
  });

  it("adds pistol recoil to the shooter and boosts air recoil", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const airborne = {
      ...playerState,
      grounded: false,
      velocityX: 20,
      velocityY: -80,
    };

    combat.usePrimary({
      ownerId: "local",
      player: airborne,
      aim: { x: 1, y: 0 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });

    expect(airborne.velocityX).toBeLessThan(0);
    expect(airborne.velocityY).toBeLessThan(-80);
  });

  it("applies very visible self recoil to charged laser, revolver, minigun, and sniper shots", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());

    const laserShooter = { ...playerState, velocityX: 0, velocityY: 0 };
    combat.equip("laser-blaster");
    combat.getPlayerInventory().charge["laser-blaster"]!.charge = 22;
    combat.usePrimary({ ownerId: "local", player: laserShooter, aim: { x: 1, y: 0 }, now: 100, heldMs: 2200, isNewPress: true });
    expect(laserShooter.velocityX).toBeLessThan(-220);

    combat.getPlayerInventory().cooldowns["laser-blaster"] = 0;
    combat.equip("revolver");
    const revolverShooter = { ...playerState, velocityX: 0, velocityY: 0 };
    combat.usePrimary({ ownerId: "local", player: revolverShooter, aim: { x: 1, y: 0 }, now: 200, heldMs: 0, isNewPress: true });
    expect(revolverShooter.velocityX).toBeLessThan(-120);

    combat.equip("minigun");
    const minigunShooter = { ...playerState, velocityX: 0, velocityY: 0 };
    combat.getPlayerInventory().charge.minigun!.charge = 1;
    combat.usePrimary({ ownerId: "local", player: minigunShooter, aim: { x: 1, y: 0 }, now: 300, heldMs: 5000, isNewPress: false });
    expect(minigunShooter.velocityX).toBeLessThan(-55);

    combat.equip("sniper");
    const sniperShooter = { ...playerState, grounded: false, velocityX: 0, velocityY: 0 };
    combat.usePrimary({ ownerId: "local", player: sniperShooter, aim: { x: 1, y: 0 }, now: 400, heldMs: 0, isNewPress: true });
    expect(sniperShooter.velocityX).toBeLessThan(-360);
    expect(sniperShooter.velocityY).toBeLessThan(-120);
  });

  it("keeps projectiles above the floor and removes non-ricochet floor impacts", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const shooter = { ...playerState };

    combat.usePrimary({ ownerId: "local", player: shooter, aim: { x: 0.1, y: 1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.18, [shooter]);
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "pistol")).toHaveLength(0);

    combat.equip("teleport-ball");
    combat.usePrimary({ ownerId: "local", player: shooter, aim: { x: 0.2, y: 1 }, now: 300, heldMs: 0, isNewPress: true });
    combat.update(0.55, [shooter]);
    const marker = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "teleport-ball");
    expect(marker).toBeDefined();
    expect(marker!.y).toBeLessThanOrEqual(DEFAULT_PHYSICS.groundY - marker!.radius);
    combat.update(2.6, [shooter]);
    expect(shooter.y).toBeLessThanOrEqual(DEFAULT_PHYSICS.groundY - shooter.height);
  });

  it("throws Teleporting Ball in a higher farther arc and keeps it rolling after landing", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("teleport-ball");
    const shooter = { ...playerState, x: 0, velocityX: 0, velocityY: 0 };

    combat.usePrimary({ ownerId: "local", player: shooter, aim: { x: 1, y: -0.18 }, now: 100, heldMs: 0, isNewPress: true });
    const thrown = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "teleport-ball");
    expect(thrown).toBeDefined();
    expect(thrown!.vx).toBeGreaterThan(800);
    expect(thrown!.vy).toBeLessThan(-480);
    expect(thrown!.lifetime).toBeGreaterThan(3.9);

    combat.update(0.58, [shooter]);
    const airborne = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "teleport-ball");
    expect(airborne?.y).toBeLessThan(playerState.y - 100);
    combat.update(1.8, [shooter]);
    const rolling = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "teleport-ball");
    expect(rolling).toBeDefined();
    expect(rolling!.state).toBe("rolling");
    expect(Math.abs(rolling!.vx)).toBeGreaterThan(80);
    expect(rolling!.gravity).toBe(0);
  });

  it("registers remote players as real combat targets for projectiles and body attacks", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const shooter = { ...playerState, id: "peer-a", x: 0 };
    combat.syncLocalPlayer(shooter, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 120,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.usePrimary({ ownerId: "peer-a", player: shooter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.09, [shooter]);

    expect(combat.getCombatant("peer-b")?.hp).toBeLessThan(100);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", ownerId: "peer-a", targetId: "peer-b", damage: expect.any(Number) }),
    ]));
    const remoteAfterShot = combat.getCombatant("peer-b");
    if (remoteAfterShot) {
      remoteAfterShot.invulnerable = 0;
      remoteAfterShot.hp = 100;
      remoteAfterShot.x = 120;
      remoteAfterShot.y = DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height;
      remoteAfterShot.velocityX = 0;
      remoteAfterShot.velocityY = 0;
    }

    const slider = {
      ...shooter,
      x: 84,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      sliding: true,
      action: "slide" as const,
      velocityX: 620,
      facing: 1 as const,
    };
    combat.syncLocalPlayer(slider, "Host", "#18dff5");
    combat.update(1 / 60, [slider]);
    expect(combat.getCombatant("peer-b")?.statuses.some((status) => status.id === "tripped")).toBe(true);
  });

  it("applies remote hit packets to the local player without echoing a new hit packet", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const local = { ...playerState, id: "peer-b" };
    combat.syncLocalPlayer(local, "Guest", "#ff6f91");

    combat.applyRemoteEvent({
      t: "c",
      id: "hit-from-peer-a",
      ownerId: "peer-a",
      weaponId: "sniper",
      action: "hit",
      x: local.x + 10,
      y: local.y + 36,
      ax: 1,
      ay: 0,
      label: "Sniper",
      ts: 500,
      targetId: "peer-b",
      damage: 80,
      kx: 640,
      ky: -180,
      stun: 0.5,
      status: "legShotSlow",
    });

    expect(combat.getCombatant("peer-b")?.hp).toBe(20);
    expect(combat.getCombatant("peer-b")?.statuses.some((status) => status.id === "legShotSlow")).toBe(true);
    expect(combat.consumeEvents().some((event) => event.id === "hit-from-peer-a")).toBe(false);
  });

  it("only pulls with the whip after two quick hits on the same target", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("whip");
    combat.syncLocalPlayer(playerState, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 215, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });

    combat.usePrimary({
      ownerId: "local",
      player: playerState,
      aim: { x: 1, y: 0 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });
    combat.update(1 / 60, [playerState]);
    const afterSingleHit = combat.getCombatant(dummy.id);
    expect(afterSingleHit?.velocityX).toBeGreaterThanOrEqual(0);

    if (afterSingleHit) {
      afterSingleHit.invulnerable = 0;
    }
    combat.update(0.36, [playerState]);
    const beforeSecondHit = combat.getCombatant(dummy.id);
    if (beforeSecondHit) {
      beforeSecondHit.x = 215;
      beforeSecondHit.y = DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height;
      beforeSecondHit.velocityX = 0;
      beforeSecondHit.velocityY = 0;
      beforeSecondHit.invulnerable = 0;
    }
    combat.usePrimary({
      ownerId: "local",
      player: playerState,
      aim: { x: 1, y: 0 },
      now: 220,
      heldMs: 0,
      isNewPress: true,
    });
    combat.update(1 / 60, [playerState]);

    expect(combat.getCombatant(dummy.id)?.velocityX).toBeLessThan(0);
  });

  it("lets the active whip tip pick up a dropped weapon only when the hitbox touches it", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.syncLocalPlayer(playerState, "Tester", "#18dff5");

    combat.equip("revolver");
    combat.dropCurrentWeapon("local", playerState, { x: 1, y: 0 }, 100);
    const dropped = combat.getSnapshot().droppedWeapons[0];
    dropped.x = playerState.x + 190;
    dropped.y = playerState.y + 22;
    dropped.vx = 0;
    dropped.vy = 0;
    dropped.pickupable = true;

    combat.equip("whip");
    combat.usePrimary({
      ownerId: "local",
      player: playerState,
      aim: { x: 1, y: 0 },
      now: 200,
      heldMs: 0,
      isNewPress: true,
    });
    combat.update(1 / 60, [playerState]);

    expect(combat.getSnapshot().droppedWeapons).toHaveLength(0);
    expect(combat.getPlayerInventory().equippedWeapon).toBe("revolver");
    expect(combat.consumeSounds()).toContain("weapon-pickup");
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "pickup" && effect.label === "Revolver")).toBe(true);
  });

  it("teleports the player to the teleport ball after three seconds unless canceled", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("teleport-ball");
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    combat.usePrimary({
      ownerId: "local",
      player,
      aim: { x: 1, y: -0.15 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });
    combat.update(2.95, [player]);
    expect(player.x).toBeCloseTo(playerState.x, 1);
    combat.update(0.1, [player]);

    expect(player.x).toBeGreaterThan(playerState.x + 80);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "teleport" && effect.label === "Arrival")).toBe(true);
  });

  it("lets lightning empowered players shock touching targets with a cooldown", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("lightning-rod");
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: player.x + 18, y: player.y });

    combat.useSecondary({
      ownerId: "local",
      player,
      aim: { x: 0, y: -1 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });
    const touchingDummy = combat.getCombatant(dummy.id);
    if (touchingDummy) {
      touchingDummy.x = player.x + 18;
      touchingDummy.y = player.y;
      touchingDummy.velocityX = 0;
      touchingDummy.velocityY = 0;
      touchingDummy.invulnerable = 0;
    }
    combat.update(0.8, [player]);
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "empowered")).toBe(true);

    const hpAfterFirstShock = combat.getCombatant(dummy.id)?.hp ?? 0;
    expect(hpAfterFirstShock).toBeLessThan(100);
    combat.update(0.1, [player]);
    expect(combat.getCombatant(dummy.id)?.hp).toBe(hpAfterFirstShock);
    const shockedDummy = combat.getCombatant(dummy.id);
    if (shockedDummy) {
      shockedDummy.x = player.x + 18;
      shockedDummy.y = player.y;
      shockedDummy.velocityX = 0;
      shockedDummy.velocityY = 0;
      shockedDummy.invulnerable = 0;
    }
    combat.update(0.55, [player]);
    expect(combat.getCombatant(dummy.id)?.hp).toBeLessThan(hpAfterFirstShock);
  });

  it("applies slide, stomp, dive, and ground-slam body contact attacks", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, sliding: true, lowSliding: false, action: "slide" as const };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: player.x + 20, y: player.y });

    combat.update(1 / 60, [player]);
    expect(combat.getCombatant(dummy.id)?.statuses.some((status) => status.id === "tripped")).toBe(true);

    const lowSlideTarget = combat.getCombatant(dummy.id);
    if (lowSlideTarget) {
      lowSlideTarget.hp = 100;
      lowSlideTarget.invulnerable = 0;
      lowSlideTarget.x = player.x + 20;
      lowSlideTarget.y = player.y;
      lowSlideTarget.velocityX = 0;
      lowSlideTarget.velocityY = 0;
    }
    const lowSlider = { ...playerState, sliding: true, lowSliding: true, action: "lowSlide" as const };
    combat.syncLocalPlayer(lowSlider, "Tester", "#18dff5");
    combat.update(1 / 60, [lowSlider]);
    expect(combat.getCombatant(dummy.id)?.velocityX).toBeGreaterThan(500);
    expect(combat.getCombatant(dummy.id)?.velocityY).toBeLessThan(-320);

    const stompTarget = combat.getCombatant(dummy.id);
    if (stompTarget) {
      stompTarget.hp = 100;
      stompTarget.invulnerable = 0;
      stompTarget.x = 20;
      stompTarget.y = playerState.y;
      stompTarget.velocityX = 0;
      stompTarget.velocityY = 0;
    }
    const stomper = {
      ...playerState,
      x: 20,
      y: playerState.y - 30,
      grounded: false,
      velocityY: 520,
      jumpsUsed: 2,
      airDiving: true,
      airDiveTimer: 0.12,
      airDiveUsed: true,
    };
    combat.syncLocalPlayer(stomper, "Tester", "#18dff5");
    combat.update(1 / 60, [stomper]);
    expect(stomper.velocityY).toBeLessThan(0);
    expect(combat.getCombatant(dummy.id)?.hitstun).toBeGreaterThan(0);
    expect(stomper.jumpsUsed).toBe(1);
    expect(stomper.airDiving).toBe(false);
    expect(stomper.airDiveTimer).toBe(0);
    expect(stomper.airDiveUsed).toBe(false);
    const postStompJump = stepPlayer(stomper, {
      left: false,
      right: false,
      up: false,
      down: false,
      downPressed: false,
      jumpPressed: true,
      jumpHeld: true,
      dashPressed: false,
    }, 1 / 60);
    expect(postStompJump.velocityY).toBe(DEFAULT_PHYSICS.doubleJumpVelocity);
    expect(postStompJump.jumpsUsed).toBe(2);

    const diveTarget = combat.getCombatant(dummy.id);
    if (diveTarget) {
      diveTarget.hp = 100;
      diveTarget.invulnerable = 0;
      diveTarget.x = 20;
      diveTarget.y = playerState.y;
      diveTarget.velocityX = 0;
      diveTarget.velocityY = 0;
    }
    const diver = { ...playerState, x: 8, y: playerState.y, airDiving: true, action: "airDive" as const, velocityX: 600 };
    combat.syncLocalPlayer(diver, "Tester", "#18dff5");
    combat.update(1 / 60, [diver]);
    expect(combat.getCombatant(dummy.id)?.hitstun).toBeGreaterThanOrEqual(1);

    const slamTarget = combat.getCombatant(dummy.id);
    if (slamTarget) {
      slamTarget.hp = 100;
      slamTarget.invulnerable = 0;
      slamTarget.x = player.x + 30;
      slamTarget.y = player.y;
      slamTarget.velocityX = 0;
      slamTarget.velocityY = 0;
    }
    const slammer = { ...playerState, x: player.x, groundSlamming: false, justSlamLanded: true, action: "slamLanding" as const };
    combat.syncLocalPlayer(slammer, "Tester", "#18dff5");
    combat.update(1 / 60, [slammer]);
    expect(combat.getCombatant(dummy.id)?.hp).toBeLessThan(100);
  });

  it("fires five fast slingshot stones and five wider scatter pebbles with long ricochet life", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("slingshot");
    const player = { ...playerState };
    const startingAmmo = combat.getPlayerInventory().ammo.slingshot!.magazine;

    const charged = combat.usePrimary({
      ownerId: "local",
      player,
      aim: { x: 1, y: -0.1 },
      now: 100,
      heldMs: 850,
      isNewPress: true,
    });
    expect(charged.kind).toBe("fired");
    const volley = combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "slingshot");
    expect(volley).toHaveLength(5);
    expect(combat.getPlayerInventory().ammo.slingshot!.magazine).toBe(startingAmmo - 5);
    for (const shot of volley) {
      expect(Math.hypot(shot.vx, shot.vy)).toBeGreaterThanOrEqual(1200);
      expect(Math.hypot(shot.vx, shot.vy)).toBeLessThanOrEqual(1500);
      expect(shot.damage).toBeGreaterThanOrEqual(5);
      expect(shot.bounces).toBe(COMBAT_TUNING.projectiles.slingshotBounces);
      expect(shot.lifetime).toBeGreaterThan(2);
      expect(shot.gravity).toBeLessThanOrEqual(360);
    }
    expect(combat.consumeSounds()).toContain("slingshot-shot");
    combat.update(1.0, [player]);
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "slingshot").length).toBeGreaterThan(0);

    combat.update(0.32, [player]);
    combat.useSecondary({
      ownerId: "local",
      player,
      aim: { x: 1, y: 0 },
      now: 500,
      heldMs: 0,
      isNewPress: true,
    });
    const slingshotProjectiles = combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "slingshot");
    expect(slingshotProjectiles).toHaveLength(10);
    const scatter = slingshotProjectiles.slice(-5);
    const spread = Math.max(...scatter.map((projectile) => projectile.vy)) - Math.min(...scatter.map((projectile) => projectile.vy));
    expect(spread).toBeGreaterThan(800);
  });

  it("supports laser charge, venting, revolver last bullet, minigun spin, and sniper steady aim", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    combat.equip("laser-blaster");
    const laserCharge = combat.getPlayerInventory().charge["laser-blaster"]!;
    laserCharge.charge = 60;
    laserCharge.charging = true;
    const laser = combat.usePrimary({
      ownerId: "local",
      player,
      aim: { x: 1, y: 0 },
      now: 100,
      heldMs: 1200,
      isNewPress: true,
    });
    expect(laser.kind).toBe("fired");
    const laserShot = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "laser-blaster");
    expect(laserShot?.damage).toBeGreaterThan(35);
    expect(laserShot?.radius).toBeGreaterThan(12);
    expect(laserShot?.lifetime).toBeGreaterThan(1.2);
    expect(laserShot?.pierce).toBeGreaterThanOrEqual(2);
    expect(combat.getPlayerInventory().charge["laser-blaster"]?.heat).toBeGreaterThan(0);
    expect(combat.getPlayerInventory().charge["laser-blaster"]?.charge).toBe(0);
    expect(combat.consumeSounds()).toContain("laser-fire");
    combat.getPlayerInventory().cooldowns["laser-blaster"] = 0;
    combat.getPlayerInventory().charge["laser-blaster"]!.charge = 0.25;
    combat.getPlayerInventory().charge["laser-blaster"]!.charging = true;
    const weakLaser = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 160, heldMs: 20, isNewPress: true });
    expect(weakLaser.kind).toBe("fired");
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "laser-blaster")).toHaveLength(2);
    combat.getPlayerInventory().cooldowns["laser-blaster"] = 0;
    combat.getPlayerInventory().charge["laser-blaster"]!.heat = 0.8;
    combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 180, heldMs: 0, isNewPress: true });
    expect(combat.getPlayerInventory().charge["laser-blaster"]?.heat).toBeLessThan(0.8);

    combat.equip("revolver");
    combat.getPlayerInventory().ammo.revolver!.magazine = 1;
    combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 220, heldMs: 0, isNewPress: true });
    const revolverShot = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "revolver");
    expect(revolverShot?.damage).toBeGreaterThan(18);
    expect(revolverShot?.knockback.x).toBeGreaterThan(360);
    expect(player.velocityX).toBeLessThan(-300);

    combat.equip("minigun");
    combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 300, heldMs: 0, isNewPress: true });
    combat.update(4.9, [player]);
    expect(combat.getWeaponRuntimeState("minigun").spin).toBeLessThan(1);
    let minigun = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 5200, heldMs: 4900, isNewPress: false });
    expect(minigun.kind).not.toBe("fired");
    combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 5300, heldMs: 0, isNewPress: true });
    combat.update(0.2, [player]);
    expect(combat.getWeaponRuntimeState("minigun").spin).toBeGreaterThanOrEqual(1);
    minigun = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 5500, heldMs: 5100, isNewPress: false });
    expect(minigun.kind).toBe("fired");
    expect(combat.getWeaponRuntimeState("minigun").heat).toBeGreaterThan(0);

    combat.equip("sniper");
    combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 1200, heldMs: 0, isNewPress: true });
    combat.update(1.1, [player]);
    expect(combat.getWeaponRuntimeState("sniper").steady).toBeGreaterThan(0.9);
    expect(combat.getCombatant("local")?.statuses.find((status) => status.id === "steady")?.duration).toBeGreaterThan(28);
    const sniper = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 2400, heldMs: 0, isNewPress: true });
    expect(sniper.kind).toBe("fired");
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(false);
    const sniperShot = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "sniper");
    expect(sniperShot?.damage).toBeGreaterThan(50);
    expect(sniperShot?.pierce).toBeGreaterThanOrEqual(2);
  });

  it("slows lower-body sniper hits for ten seconds and shows pixel blood feedback", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("sniper");
    const shooter = { ...playerState, x: 0 };
    combat.syncLocalPlayer(shooter, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 220, y: playerState.y });

    combat.usePrimary({ ownerId: "local", player: shooter, aim: { x: 1, y: 0.1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.15, [shooter]);

    expect(combat.getCombatant(dummy.id)?.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legShotSlow", duration: expect.closeTo(10, 0) }),
    ]));
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "blood")).toBe(true);
    expect(combat.getSnapshot().damageNumbers.at(-1)?.label).toContain("LEG");
  });

  it("uses knife as an infinite throwing weapon with cooldown, recoil, hit cleanup, and close combo bleed", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("knife");
    const player = { ...playerState, x: 0 };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 52, y: playerState.y });

    for (let index = 0; index < 3; index += 1) {
      combat.getPlayerInventory().cooldowns.knife = 0;
      const target = combat.getCombatant(dummy.id)!;
      target.x = 52;
      target.y = playerState.y;
      target.invulnerable = 0;
      combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: index === 2 ? -0.05 : 0 }, now: 100 + index * 80, heldMs: 0, isNewPress: true });
      combat.update(1 / 60, [player]);
    }

    const target = combat.getCombatant(dummy.id)!;
    expect(target.statuses.some((status) => status.id === "bleed")).toBe(true);
    expect(target.hitstun).toBeGreaterThan(0.2);
    expect(combat.getSnapshot().damageNumbers.at(-1)?.label).toContain("Knife Stab");

    target.hp = 100;
    target.invulnerable = 0;
    target.x = 190;
    target.y = playerState.y;
    target.velocityX = 0;
    target.velocityY = 0;
    combat.getPlayerInventory().cooldowns.knife = 0;
    player.velocityX = 0;
    player.velocityY = 0;
    const thrown = combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 500, heldMs: 0, isNewPress: true });
    expect(thrown.kind).toBe("fired");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("knife");
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === "knife" && projectile.label === "Knife throw")).toBe(true);
    expect(combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "knife")?.lifetime).toBeGreaterThan(0.45);
    expect(player.velocityX).toBeLessThan(-120);
    expect(combat.getPlayerInventory().cooldowns.knife).toBeGreaterThan(0);
    const blocked = combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 510, heldMs: 0, isNewPress: true });
    expect(blocked.kind).toBe("blocked");
    expect(combat.consumeSounds()).toContain("knife-throw");
    combat.update(0.2, [player]);
    expect(target.statuses.some((status) => status.id === "bleed")).toBe(true);
    expect(combat.getSnapshot().droppedWeapons.some((dropped) => dropped.weaponId === "knife")).toBe(false);
    expect(combat.getPlayerInventory().equippedWeapon).toBe("knife");

    combat.getPlayerInventory().cooldowns.knife = 0;
    target.invulnerable = 0;
    target.x = 260;
    combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 900, heldMs: 0, isNewPress: true });
    expect(combat.getPlayerInventory().equippedWeapon).toBe("knife");
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "knife")).toHaveLength(1);
  });

  it("makes airborne knife throws kick much harder for movement tricks", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("knife");
    const grounded = { ...playerState, velocityX: 0, velocityY: 0 };
    const airborne = { ...playerState, grounded: false, velocityX: 0, velocityY: 0 };

    combat.useSecondary({ ownerId: "local", player: grounded, aim: { x: 1, y: 0.15 }, now: 100, heldMs: 0, isNewPress: true });
    combat.getPlayerInventory().cooldowns.knife = 0;
    combat.useSecondary({ ownerId: "local", player: airborne, aim: { x: 1, y: 0.15 }, now: 300, heldMs: 0, isNewPress: true });
    const firstAirKick = airborne.velocityX;
    combat.getPlayerInventory().cooldowns.knife = 0;
    combat.useSecondary({ ownerId: "local", player: airborne, aim: { x: 1, y: 0.15 }, now: 520, heldMs: 0, isNewPress: true });

    expect(Math.abs(airborne.velocityX)).toBeGreaterThan(Math.abs(grounded.velocityX) * 1.5);
    expect(airborne.velocityY).toBeLessThan(grounded.velocityY);
    expect(airborne.velocityX).toBeLessThan(firstAirKick);
    expect(combat.getPlayerInventory().equippedWeapon).toBe("knife");
    expect(combat.getSnapshot().droppedWeapons.some((dropped) => dropped.weaponId === "knife")).toBe(false);
  });

  it("aims close melee swings upward, downward, and diagonally with mouse direction", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, id: "peer-a", x: 0, y: playerState.y, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "above",
      name: "Above",
      color: "#ff6f91",
      x: 0,
      y: player.y - 46,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.equip("knife");
    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);
    const above = combat.getCombatant("above")!;
    expect(above.hp).toBeLessThan(100);
    expect(above.velocityY).toBeLessThan(-40);

    above.maxHp = 100;
    above.hp = 100;
    above.invulnerable = 0;
    above.x = 78;
    above.y = player.y - 62;
    above.velocityX = 0;
    above.velocityY = 0;
    combat.equip("machete");
    combat.getPlayerInventory().cooldowns.machete = 0;
    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 0.7, y: -0.7 }, now: 300, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);
    expect(above.hp).toBeLessThan(100);
    expect(above.velocityX).toBeGreaterThan(180);
    expect(above.velocityY).toBeLessThan(-70);

    above.maxHp = 100;
    above.hp = 100;
    above.invulnerable = 0;
    above.x = 0;
    above.y = player.y - 52;
    above.velocityX = 0;
    above.velocityY = 0;
    combat.equip("axe");
    combat.getPlayerInventory().cooldowns.axe = 0;
    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 0, y: -1 }, now: 500, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);
    expect(above.hp).toBeLessThan(100);
    expect(above.velocityY).toBeLessThan(-220);

    above.maxHp = 200;
    above.hp = 200;
    above.invulnerable = 0;
    above.x = 0;
    above.y = player.y + 74;
    above.velocityX = 0;
    above.velocityY = 0;
    const airborne = { ...player, y: player.y - 92, grounded: false };
    combat.syncLocalPlayer(airborne, "Host", "#18dff5");
    combat.equip("sledgehammer");
    combat.getPlayerInventory().cooldowns.sledgehammer = 0;
    combat.usePrimary({ ownerId: "peer-a", player: airborne, aim: { x: 0, y: 1 }, now: 700, heldMs: 900, isNewPress: true });
    combat.update(1 / 60, [airborne]);
    expect(above.hp).toBeLessThan(200);
    expect(above.velocityY).toBeGreaterThan(120);
  });

  it("damages overlapping targets with equipped knife contact on a short per-target cooldown", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("knife");
    const player = { ...playerState, id: "peer-a", x: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 24,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.update(1 / 60, [player]);
    const firstHp = combat.getCombatant("peer-b")!.hp;
    expect(firstHp).toBeGreaterThanOrEqual(95);
    expect(firstHp).toBeLessThan(100);
    expect(combat.consumeSounds()).toContain("knife-contact");
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "knife", targetId: "peer-b", label: "Knife Contact" }),
    ]));

    combat.update(0.1, [player]);
    expect(combat.getCombatant("peer-b")!.hp).toBe(firstHp);

    const target = combat.getCombatant("peer-b")!;
    target.x = 24;
    target.y = playerState.y;
    target.velocityX = 0;
    target.velocityY = 0;
    target.invulnerable = 0;
    combat.update(0.42, [player]);
    expect(target.hp).toBeLessThan(firstHp);
  });

  it("adds machete as a heavy close-range weapon with slash and overhead chop", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("machete");
    const player = { ...playerState, id: "peer-a", x: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 64,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const slash = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(slash.kind).toBe("hitbox");
    combat.update(1 / 60, [player]);
    expect(combat.getCombatant("peer-b")?.hp).toBeLessThan(100);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["machete-slash", "machete-hit"]));
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "machete", targetId: "peer-b", damage: expect.any(Number) }),
    ]));

    const target = combat.getCombatant("peer-b")!;
    target.hp = 100;
    target.invulnerable = 0;
    target.x = 70;
    target.y = playerState.y;
    target.velocityX = 0;
    target.velocityY = 0;
    player.grounded = false;
    player.velocityY = 0;
    combat.getPlayerInventory().cooldowns.machete = 0;
    const chop = combat.useSecondary({ ownerId: "peer-a", player, aim: { x: 1, y: 0.1 }, now: 600, heldMs: 0, isNewPress: true });
    expect(chop.kind).toBe("hitbox");
    expect(player.velocityY).toBeGreaterThan(120);
    combat.update(1 / 60, [player]);
    expect(target.hp).toBeLessThanOrEqual(75);
    expect(target.velocityX).toBeGreaterThan(450);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["machete-chop", "machete-hit"]));
  });

  it("grows machete length on every hit and grants permanent power plus extra growth on KO", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("machete");
    const player = { ...playerState, id: "peer-a", x: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 82,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
      hp: 100,
    });

    expect(combat.getMacheteState("peer-a")).toMatchObject({ rangeBonus: 0, damageBonus: 0 });
    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);
    const afterHit = combat.getMacheteState("peer-a");
    expect(afterHit.rangeBonus).toBeGreaterThanOrEqual(8);
    expect(afterHit.damageBonus).toBe(0);
    expect(afterHit.redness).toBeGreaterThan(0);

    const target = combat.getCombatant("peer-b")!;
    target.hp = 6;
    target.invulnerable = 0;
    target.x = 118;
    target.y = playerState.y;
    target.velocityX = 0;
    target.velocityY = 0;
    combat.getPlayerInventory().cooldowns.machete = 0;
    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 500, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);

    const afterKo = combat.getMacheteState("peer-a");
    expect(target.respawnTimer).toBeGreaterThan(0);
    expect(afterKo.rangeBonus).toBeGreaterThanOrEqual(afterHit.rangeBonus + 40);
    expect(afterKo.damageBonus).toBeGreaterThanOrEqual(2);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "Growth KO")).toBe(true);
  });

  it("adds axe as a heavy swing and throwing hybrid for online combatants", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 70,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const swing = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(swing.kind).toBe("hitbox");
    combat.update(1 / 60, [player]);
    const target = combat.getCombatant("peer-b")!;
    expect(target.hp).toBeLessThanOrEqual(80);
    expect(target.velocityX).toBeGreaterThan(500);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["axe-swing", "axe-hit"]));

    target.hp = 100;
    target.invulnerable = 0;
    target.x = 220;
    target.y = playerState.y;
    target.velocityX = 0;
    target.velocityY = 0;
    player.grounded = false;
    player.velocityX = 0;
    player.velocityY = 0;
    combat.getPlayerInventory().cooldowns.axe = 0;
    const thrown = combat.useSecondary({ ownerId: "peer-a", player, aim: { x: 1, y: 0.06 }, now: 500, heldMs: 0, isNewPress: true });
    expect(thrown.kind).toBe("fired");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("axe");
    expect(player.velocityX).toBeLessThan(-180);
    expect(player.velocityY).toBeLessThan(-40);
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === "axe" && projectile.label === "Axe throw")).toBe(true);

    combat.update(0.2, [player]);
    expect(target.hp).toBeLessThanOrEqual(80);
    expect(target.velocityX).toBeGreaterThan(550);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["axe-throw", "axe-hit"]));
    expect(combat.getSnapshot().droppedWeapons.filter((dropped) => dropped.weaponId === "axe")).toHaveLength(0);
  });

  it("rushes Axe users into nearby targets before swinging", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 360,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const rush = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(rush.kind).toBe("utility");
    expect(rush.label).toBe("Axe Rush");
    expect(combat.isMovementLocked("peer-a")).toBe(true);
    expect(player.velocityX).toBeGreaterThan(850);

    combat.update(0.28, [player]);
    const target = combat.getCombatant("peer-b")!;
    expect(combat.isMovementLocked("peer-a")).toBe(false);
    expect(player.x).toBeGreaterThan(220);
    expect(target.hp).toBeLessThanOrEqual(72);
    expect(target.velocityX).toBeGreaterThan(650);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["axe-rush", "axe-hit"]));
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "axe", targetId: "peer-b", label: expect.stringContaining("Axe Rush") }),
    ]));
  });

  it("rushes Axe users from a much farther target range without teleporting", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-far",
      name: "Far Guest",
      color: "#ff6f91",
      x: 860,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const rush = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(rush).toMatchObject({ kind: "utility", label: "Axe Rush" });
    expect(combat.isMovementLocked("peer-a")).toBe(true);
    expect(player.velocityX).toBeGreaterThan(1050);

    combat.update(0.34, [player]);
    expect(player.x).toBeGreaterThan(330);
    expect(player.x).toBeLessThan(760);
    expect(combat.getCombatant("peer-far")!.hp).toBe(100);

    combat.update(0.34, [player]);
    expect(combat.isMovementLocked("peer-a")).toBe(false);
    expect(combat.getCombatant("peer-far")!.hp).toBeLessThan(100);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "axe", targetId: "peer-far", label: expect.stringContaining("Axe Rush") }),
    ]));
  });

  it("uses an extended normal Axe swing when no rush target is close", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "local", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 128, y: playerState.y });

    const swing = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(swing.kind).toBe("hitbox");
    combat.update(1 / 60, [player]);

    expect(combat.getCombatant(dummy.id)?.hp).toBeLessThan(100);
  });

  it("throws and recalls Axe as a piercing returning weapon", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 210,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.syncRemotePlayer({
      id: "peer-c",
      name: "Guest 2",
      color: "#ffd84d",
      x: 118,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    expect(combat.useSecondary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true }).kind).toBe("fired");
    combat.update(0.18, [player]);
    const recall = combat.useSecondary({ ownerId: "peer-a", player, aim: { x: -1, y: 0 }, now: 400, heldMs: 0, isNewPress: true });

    expect(recall.kind).toBe("utility");
    expect(recall.label).toBe("Recall");
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === "axe" && projectile.label === "RETURNING AXE" && projectile.pierce >= 8)).toBe(true);

    combat.getCombatant("peer-b")!.invulnerable = 0;
    combat.getCombatant("peer-c")!.invulnerable = 0;
    combat.update(0.18, [player]);

    expect(combat.getCombatant("peer-b")!.hp).toBeLessThanOrEqual(66);
    expect(combat.getCombatant("peer-c")!.hp).toBeLessThanOrEqual(66);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["axe-recall", "axe-hit"]));
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "axe", targetId: "peer-b", label: "RETURNING AXE" }),
      expect.objectContaining({ action: "hit", weaponId: "axe", targetId: "peer-c", label: "RETURNING AXE" }),
    ]));
  });

  it("removes the held Axe from melee use while the thrown Axe is still out", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("axe");
    const player = { ...playerState, id: "local", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    combat.spawnTrainingDummy({ x: 118, y: playerState.y });

    expect(combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true }).kind).toBe("fired");
    expect(combat.getWeaponRuntimeState("axe", "local").axeThrown).toBe(true);

    combat.getPlayerInventory().cooldowns.axe = 0;
    const blockedSwing = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 180, heldMs: 0, isNewPress: true });

    expect(blockedSwing).toMatchObject({ kind: "blocked", weaponId: "axe", label: "Axe thrown" });
    expect(combat.getSnapshot().hitboxes.some((hitbox) => hitbox.weaponId === "axe")).toBe(false);

    const recall = combat.useSecondary({ ownerId: "local", player, aim: { x: -1, y: 0 }, now: 260, heldMs: 0, isNewPress: true });
    expect(recall).toMatchObject({ kind: "utility", weaponId: "axe", label: "Recall" });
  });

  it("activates Virgin Blood with left or right click, heals, buffs, and revives once with angel wings", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("virgin-blood");
    const player = { ...playerState, id: "peer-a", velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.applyDamage({ sourceId: "status", targetId: "peer-a", damage: 54, knockback: { x: 0, y: 0 }, stun: 0, label: "Setup" });
    const wounded = combat.getCombatant("peer-a")!;
    wounded.invulnerable = 0;

    const activated = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(activated.kind).toBe("utility");
    expect(activated.label).toBe("Blessed");
    expect(wounded.hp).toBe(100);
    expect(wounded.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "holyBuff", duration: expect.closeTo(25, 1) }),
      expect.objectContaining({ id: "blessed" }),
    ]));
    expect(combat.getVirginBloodState("peer-a")).toMatchObject({ reviveAvailable: true });
    expect(combat.getPlayerInventory().cooldowns["virgin-blood"]).toBeGreaterThanOrEqual(45);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["virgin-blood-activate"]));
    combat.update(0.2, [player]);
    expect(combat.getSnapshot().effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "aura", color: "#7cff6b", label: "BUFFED" }),
    ]));

    wounded.invulnerable = 0;
    combat.applyDamage({ sourceId: "peer-b", targetId: "peer-a", weaponId: "axe", damage: 180, knockback: { x: 600, y: -220 }, stun: 0.4, label: "Fatal" });

    expect(wounded.hp).toBeGreaterThan(0);
    expect(wounded.respawnTimer).toBe(0);
    expect(wounded.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "angelWings", duration: expect.closeTo(30, 1) }),
      expect.objectContaining({ id: "holyBuff" }),
    ]));
    expect(combat.getVirginBloodState("peer-a").reviveAvailable).toBe(false);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "REVIVED")).toBe(true);

    wounded.invulnerable = 0;
    combat.applyDamage({ sourceId: "peer-b", targetId: "peer-a", weaponId: "axe", damage: 180, knockback: { x: 600, y: -220 }, stun: 0.4, label: "Fatal Again" });
    expect(wounded.respawnTimer).toBeGreaterThan(0);

    const secondCombat = new CombatSystem({ mode: "offline" });
    secondCombat.start(createDefaultInventory());
    secondCombat.equip("virgin-blood");
    const secondPlayer = { ...playerState, velocityX: 0, velocityY: 0 };
    secondCombat.syncLocalPlayer(secondPlayer, "Tester", "#18dff5");
    secondCombat.applyDamage({ sourceId: "status", targetId: "local", damage: 35, knockback: { x: 0, y: 0 }, stun: 0, label: "Setup" });
    secondCombat.getCombatant("local")!.invulnerable = 0;
    const rightClick = secondCombat.useSecondary({ ownerId: "local", player: secondPlayer, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(rightClick).toMatchObject({ kind: "utility", weaponId: "virgin-blood", label: "Blessed" });
    expect(secondCombat.getCombatant("local")!.hp).toBe(100);
  });

  it("keeps Wings click inputs non-offensive and inventory-safe", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("wings");
    const player = { ...playerState, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    const primary = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    const secondary = combat.useSecondary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 200, heldMs: 0, isNewPress: true });

    expect(primary.kind).toBe("blocked");
    expect(secondary.kind).toBe("blocked");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("wings");
    expect(combat.getSnapshot().projectiles).toHaveLength(0);
    expect(combat.getSnapshot().hitboxes).toHaveLength(0);
    expect(combat.getSnapshot().droppedWeapons.some((dropped) => dropped.weaponId === "wings")).toBe(false);
  });

  it("pushes nearby combatants with Wings flap gust without meaningful damage", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("wings");
    const player = {
      ...playerState,
      id: "peer-a",
      x: 0,
      y: playerState.y - 48,
      grounded: false,
      velocityX: 0,
      velocityY: -80,
      wingFlapping: true,
      wingFlapHeldMs: 420,
    };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "peer-b",
      name: "Guest",
      color: "#ff6f91",
      x: 56,
      y: player.y + 8,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.update(1 / 60, [player]);
    const target = combat.getCombatant("peer-b")!;
    const firstHp = target.hp;
    expect(firstHp).toBeGreaterThanOrEqual(99);
    expect(target.velocityX).toBeGreaterThan(250);
    expect(target.velocityY).toBeLessThan(0);
    expect(combat.consumeSounds()).toContain("wing-gust");
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "wings", targetId: "peer-b", label: "Wing Gust" }),
    ]));

    combat.update(0.08, [player]);
    expect(target.hp).toBe(firstHp);

    target.invulnerable = 0;
    target.x = 56;
    target.y = player.y + 8;
    target.velocityX = 0;
    target.velocityY = 0;
    combat.update(0.16, [player]);
    expect(target.velocityX).toBeGreaterThan(250);
    expect(target.hp).toBeGreaterThanOrEqual(98);
  });

  it("fires a physical Grappling Hook rope that attaches, lightly damages, pulls, and releases", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("grappling-hook");
    const player = {
      ...playerState,
      id: "peer-a",
      x: 0,
      y: playerState.y - 40,
      grounded: false,
      velocityX: 0,
      velocityY: 0,
    };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 330, y: playerState.y - 35 });

    const fired = combat.usePrimary({
      ownerId: "peer-a",
      player,
      aim: { x: 1, y: 0.02 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });

    expect(fired).toMatchObject({ kind: "fired", weaponId: "grappling-hook", label: "Grapple Fire" });
    expect(combat.getSnapshot().grapples).toHaveLength(1);
    expect(combat.getSnapshot().grapples[0]).toMatchObject({ ownerId: "peer-a", state: "flying" });

    for (let index = 0; index < 36; index += 1) {
      combat.update(1 / 60, [player]);
    }

    const grapple = combat.getSnapshot().grapples[0];
    const attachedRopeLength = grapple.ropeLength;
    const target = combat.getCombatant(dummy.id)!;
    expect(grapple).toMatchObject({ ownerId: "peer-a", state: "attached", targetId: dummy.id });
    expect(grapple.points.length).toBeGreaterThanOrEqual(6);
    expect(target.hp).toBeGreaterThanOrEqual(92);
    expect(target.hp).toBeLessThan(100);
    expect(player.velocityX).toBeLessThan(80);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "grappling-hook", targetId: dummy.id, label: "Grapple Hook" }),
    ]));
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["grapple-fire", "grapple-attach"]));

    const pulling = combat.useSecondary({
      ownerId: "peer-a",
      player,
      aim: { x: 1, y: 0 },
      now: 800,
      heldMs: 0,
      isNewPress: true,
    });
    expect(pulling).toMatchObject({ kind: "utility", weaponId: "grappling-hook", label: "Grapple Pull" });
    expect(combat.getSnapshot().grapples).toHaveLength(1);
    combat.update(0.12, [player]);
    expect(player.velocityX).toBeGreaterThan(120);
    for (let index = 0; index < 10; index += 1) {
      combat.useSecondary({
        ownerId: "peer-a",
        player,
        aim: { x: 1, y: 0 },
        now: 820 + index * 16,
        heldMs: 16 + index * 16,
        isNewPress: false,
      });
      combat.update(1 / 60, [player]);
    }
    const pullingRuntime = combat.getWeaponRuntimeState("grappling-hook", "peer-a");
    expect(pullingRuntime.grapplePulling).toBe(true);
    expect(pullingRuntime.grappleRopeLength).toBeLessThan(attachedRopeLength);

    player.x = -1180;
    player.velocityX = 0;
    combat.update(0.16, [player]);
    expect(combat.getSnapshot().grapples).toHaveLength(1);
    expect(player.velocityX).toBeGreaterThan(0);

    const released = combat.usePrimary({
      ownerId: "peer-a",
      player,
      aim: { x: 1, y: 0 },
      now: 900,
      heldMs: 0,
      isNewPress: true,
    });
    expect(released).toMatchObject({ kind: "utility", weaponId: "grappling-hook", label: "Grapple Release" });
    expect(combat.getSnapshot().grapples).toHaveLength(0);
  });

  it("replays remote projectile weapon events as visual-only projectiles without local damage", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const local = { ...playerState, id: "peer-b", x: 95, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(local, "Guest", "#ff6f91");

    combat.applyRemoteEvent({
      t: "c",
      id: "remote-pistol-shot",
      ownerId: "peer-a",
      weaponId: "pistol",
      action: "primary",
      x: 0,
      y: local.y + 24,
      ax: 1,
      ay: 0,
      label: "Pistol",
      ts: 100,
    });

    const visual = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "pistol");
    expect(visual).toMatchObject({ ownerId: "peer-a", visualOnly: true });

    combat.update(0.16, [local]);
    expect(combat.getCombatant("peer-b")?.hp).toBe(100);
    expect(combat.consumeEvents().some((event) => event.action === "hit")).toBe(false);
  });

  it("replays remote Mars events with visual-only clones that do not apply local damage", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const local = { ...playerState, id: "peer-b", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(local, "Guest", "#ff6f91");
    combat.setPlayerLoadout("peer-b", { leftHand: "chainsaw" });

    combat.applyRemoteEvent({
      t: "c",
      id: "remote-mars-event",
      ownerId: "peer-a",
      weaponId: "mars" as never,
      action: "primary",
      x: 0,
      y: local.y,
      ax: 0,
      ay: -1,
      label: "Mars",
      ts: 100,
      range: 1234,
    });

    combat.update(3.7, [local]);
    const snapshot = combat.getSnapshot() as unknown as {
      marsEvents: Array<{ visualOnly?: boolean }>;
      marsClones: Array<{ id: string; targetId: string; visualOnly?: boolean; phase: string }>;
    };
    expect(snapshot.marsEvents[0]).toMatchObject({ visualOnly: true });
    const clone = snapshot.marsClones.find((item) => item.targetId === "peer-b")!;
    expect(clone).toMatchObject({ visualOnly: true, phase: "hunting" });

    const cloneBody = combat.getCombatant(clone.id)!;
    cloneBody.x = local.x + 20;
    cloneBody.y = local.y;
    cloneBody.invulnerable = 0;
    const target = combat.getCombatant("peer-b")!;
    target.invulnerable = 0;
    const hpBefore = target.hp;

    combat.update(0.25, [local]);

    expect(combat.getCombatant("peer-b")?.hp).toBe(hpBefore);
    expect(combat.consumeEvents().some((event) => event.action === "hit" && event.weaponId === "chainsaw")).toBe(false);
  });

  it("uses Super Legs kicks as leg equipment attacks with cooldown", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 76, y: playerState.y });

    const kick = combat.useSuperLegsKick({
      ownerId: "peer-a",
      player,
      aim: { x: 1, y: 0 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    }, "forward");
    expect(kick).toMatchObject({ kind: "hitbox", weaponId: "super-legs", label: "Flying Kick" });
    combat.update(1 / 60, [player]);
    const target = combat.getCombatant(dummy.id)!;
    const hpAfterKick = target.hp;
    expect(hpAfterKick).toBeLessThan(100);
    expect(target.velocityX).toBeGreaterThan(500);

    target.invulnerable = 0;
    const blocked = combat.useSuperLegsKick({
      ownerId: "peer-a",
      player,
      aim: { x: 1, y: 0 },
      now: 150,
      heldMs: 0,
      isNewPress: true,
    }, "forward");
    combat.update(1 / 60, [player]);
    expect(blocked).toMatchObject({ kind: "blocked", weaponId: "super-legs", label: "Kick cooldown" });
    expect(target.hp).toBe(hpAfterKick);
  });

  it("makes Super Legs slides and slam waves hit much harder with larger visuals", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, id: "local", sliding: true, lowSliding: true, action: "lowSlide" as const, facing: 1 as const };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");
    combat.setEquipmentStatus("local", "superLegs", true);
    const slideDummy = combat.spawnTrainingDummy({ x: player.x + 18, y: player.y });

    combat.update(1 / 60, [player]);

    const slideTarget = combat.getCombatant(slideDummy.id)!;
    expect(slideTarget.hp).toBeLessThanOrEqual(82);
    expect(slideTarget.velocityX).toBeGreaterThan(1050);
    expect(slideTarget.velocityY).toBeLessThan(-700);

    const centerDummy = combat.syncRemotePlayer({
      id: "center-dummy",
      name: "Center Dummy",
      color: "#ff6f91",
      x: player.x + 40,
      y: player.y,
      width: player.width,
      height: player.height,
      velocityX: 0,
      velocityY: 0,
      hp: 100,
      statuses: [],
    });
    const edgeDummy = combat.syncRemotePlayer({
      id: "edge-dummy",
      name: "Edge Dummy",
      color: "#ff6f91",
      x: player.x + 205,
      y: player.y,
      width: player.width,
      height: player.height,
      velocityX: 0,
      velocityY: 0,
      hp: 100,
      statuses: [],
    });
    for (const id of [centerDummy.id, edgeDummy.id]) {
      const target = combat.getCombatant(id)!;
      target.hp = 100;
      target.invulnerable = 0;
      target.velocityX = 0;
      target.velocityY = 0;
    }
    const slammer = {
      ...playerState,
      id: "local",
      x: player.x,
      y: player.y,
      velocityY: 1380,
      justSlamLanded: true,
      action: "slamLanding" as const,
    };
    combat.syncLocalPlayer(slammer, "Tester", "#18dff5");
    combat.setEquipmentStatus("local", "superLegs", true);

    combat.update(1 / 60, [slammer]);

    const center = combat.getCombatant(centerDummy.id)!;
    const edge = combat.getCombatant(edgeDummy.id)!;
    expect(center.hp).toBeLessThan(edge.hp);
    expect(center.hp).toBeLessThanOrEqual(65);
    expect(edge.hp).toBeLessThan(100);
    expect(Math.hypot(center.velocityX, center.velocityY)).toBeGreaterThan(1200);
    expect(Math.hypot(edge.velocityX, edge.velocityY)).toBeGreaterThan(600);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "shockwave" && effect.label === "SUPER LEG SLAM")).toBe(true);
  });

  it("keeps pistol right click and drop from throwing or removing the pistol", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("pistol");
    const player = { ...playerState, id: "local" };

    const secondary = combat.useSecondary({
      ownerId: "local",
      player,
      aim: { x: 1, y: -0.1 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });

    expect(secondary).toMatchObject({ kind: "blocked", weaponId: "pistol" });
    expect(secondary.label.toLowerCase()).toContain("no throw");
    expect(combat.getPlayerInventory().weaponInventory).toContain("pistol");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("pistol");
    expect(combat.getSnapshot().droppedWeapons.some((item) => item.weaponId === "pistol")).toBe(false);
    expect(combat.getSnapshot().projectiles.some((item) => item.weaponId === "pistol" && item.label.includes("throw"))).toBe(false);

    const drop = combat.dropCurrentWeapon("local", player, { x: 1, y: -0.1 }, 200);
    expect(drop).toMatchObject({ kind: "blocked", weaponId: "pistol" });
    expect(combat.getPlayerInventory().weaponInventory).toContain("pistol");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("pistol");
    expect(combat.getSnapshot().droppedWeapons.some((item) => item.weaponId === "pistol")).toBe(false);
  });

  it("removes dropped physical weapons from inventory until the ground pickup is collected", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("revolver");
    const player = { ...playerState, id: "local" };

    const thrown = combat.dropCurrentWeapon("local", player, { x: 1, y: -0.1 }, 100);

    expect(thrown).toMatchObject({ kind: "fired", weaponId: "revolver", label: "Throw" });
    expect(combat.getPlayerInventory().weaponInventory).not.toContain("revolver");
    expect(combat.getPlayerInventory().equippedWeapon).not.toBe("revolver");
    const dropped = combat.getSnapshot().droppedWeapons.find((item) => item.weaponId === "revolver")!;
    expect(dropped).toBeDefined();
    dropped.x = player.x + player.width / 2;
    dropped.y = player.y + player.height / 2;
    dropped.vx = 0;
    dropped.vy = 0;
    dropped.pickupable = true;

    expect(combat.pickUpNearest(player)).toBe("revolver");
    expect(combat.getPlayerInventory().weaponInventory).toContain("revolver");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("revolver");
    expect(combat.getSnapshot().droppedWeapons.some((item) => item.weaponId === "revolver")).toBe(false);
  });

  it("reduces leg-hit damage and leg slow while Super Legs are equipped", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const dummy = combat.spawnTrainingDummy({ x: 120, y: playerState.y });
    combat.setEquipmentStatus(dummy.id, "superLegs", true);

    const target = combat.getCombatant(dummy.id)!;
    const hit = combat.applyDamage({
      sourceId: "local",
      targetId: dummy.id,
      weaponId: "sniper",
      damage: 40,
      knockback: { x: 500, y: -120 },
      stun: 0.24,
      label: "Sniper",
      hitY: target.y + target.height * 0.86,
    });

    expect(hit.applied).toBe(true);
    expect(target.hp).toBeGreaterThan(80);
    expect(target.statuses.some((status) => status.id === "legShotSlow" || status.id === "legStagger")).toBe(false);
    expect(target.statuses.some((status) => status.id === "superLegs")).toBe(true);
  });

  it("casts directional lightning strikes and only empowers upward held self-charge", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    combat.equip("lightning-rod");
    const rodDummy = combat.spawnTrainingDummy({ x: player.x + 130, y: player.y });
    const sideways = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 900, isNewPress: true });
    const local = combat.getCombatant("local")!;
    expect(sideways.kind).toBe("utility");
    expect(local.hp).toBe(100);
    expect(local.statuses.some((status) => status.id === "empowered")).toBe(false);
    expect(combat.getLightningState("local").empoweredTimer).toBe(0);
    expect(combat.getCombatant(rodDummy.id)?.hp).toBeLessThan(100);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "lightning" && effect.tx > effect.x + 300)).toBe(true);
    expect(combat.consumeSounds()).toContain("lightning-strike");

    const shortCombat = new CombatSystem({ mode: "offline" });
    shortCombat.start(createDefaultInventory());
    shortCombat.equip("lightning-rod");
    const shortPlayer = { ...playerState };
    shortCombat.syncLocalPlayer(shortPlayer, "Tester", "#18dff5");
    shortCombat.usePrimary({ ownerId: "local", player: shortPlayer, aim: { x: 0, y: -1 }, now: 200, heldMs: 350, isNewPress: true });
    const shortLocal = shortCombat.getCombatant("local")!;
    const shortDamage = 100 - shortLocal.hp;
    const shortDuration = shortCombat.getLightningState("local").empoweredTimer;

    const longCombat = new CombatSystem({ mode: "offline" });
    longCombat.start(createDefaultInventory());
    longCombat.equip("lightning-rod");
    const longPlayer = { ...playerState };
    longCombat.syncLocalPlayer(longPlayer, "Tester", "#18dff5");
    longCombat.usePrimary({ ownerId: "local", player: longPlayer, aim: { x: 0, y: -1 }, now: 200, heldMs: 2400, isNewPress: true });
    const longLocal = longCombat.getCombatant("local")!;
    const longDamage = 100 - longLocal.hp;
    const longDuration = longCombat.getLightningState("local").empoweredTimer;

    expect(shortLocal.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "empowered", duration: expect.closeTo(shortDuration, 1) })]));
    expect(longDamage).toBeGreaterThan(shortDamage + 10);
    expect(longDuration).toBeGreaterThan(shortDuration + 10);
    expect(longDuration).toBeLessThan(60);
    expect(longCombat.getSnapshot().effects.some((effect) => effect.kind === "lightning" && effect.ty < effect.y - 300)).toBe(true);
    expect(lightningChargeColorFor(350)).toBe("#ffd84d");
    expect(lightningChargeColorFor(1600)).toBe("#5ad7ff");
    expect(lightningChargeColorFor(2800)).toBe("#ff5c5c");
    expect(lightningChargeColorFor(4200)).toBe("#b096ff");

    longCombat.update(longDuration + 0.1, [longPlayer]);
    expect(longCombat.getLightningState("local").empoweredTimer).toBe(0);
    expect(longCombat.getCombatant("local")?.statuses.some((status) => status.id === "empowered")).toBe(false);

    const target = combat.getCombatant(rodDummy.id);
    if (target) {
      target.hp = 100;
      target.invulnerable = 0;
      target.x = player.x + 150;
      target.y = player.y;
      target.velocityX = 0;
      target.velocityY = 0;
      target.statuses = [];
    }
    combat.equip("sledgehammer");
    combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 400, heldMs: 950, isNewPress: true });
    combat.update(1 / 60, [player]);
    expect(combat.getCombatant(rodDummy.id)?.hp).toBeLessThan(100);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "shockwave" || effect.kind === "slam")).toBe(true);
  });

  it("freezes and drains nearby targets with Death Aura scaling up at low HP", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("death-aura");
    const player = { ...playerState, id: "peer-a", velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "close",
      name: "Close",
      color: "#ff6f91",
      x: 76,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.syncRemotePlayer({
      id: "far",
      name: "Far",
      color: "#ffd84d",
      x: 246,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    expect(combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true })).toMatchObject({ kind: "utility", label: "Death Aura" });
    combat.update(0.5, [player]);
    expect(combat.getCombatant("close")!.hp).toBeLessThan(100);
    expect(combat.getCombatant("close")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "deathFrozen" })]));
    expect(combat.getCombatant("far")!.hp).toBe(100);

    const owner = combat.getCombatant("peer-a")!;
    owner.hp = 18;
    combat.getCombatant("far")!.invulnerable = 0;
    combat.update(0.55, [player]);
    expect(combat.getDeathAuraState("peer-a").radius).toBeGreaterThan(220);
    expect(combat.getCombatant("far")!.hp).toBeLessThan(100);
    expect(combat.getSnapshot().effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "DEATH AURA", color: "#08080c" }),
      expect.objectContaining({ label: "FROZEN" }),
    ]));
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "death-aura", targetId: "far", label: "Death Aura" }),
    ]));
  });

  it("keeps Death Aura active for sixty seconds, cools down for forty, and preserves stored suffering", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("death-aura");
    const player = { ...playerState, id: "peer-a", velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "attacker",
      name: "Attacker",
      color: "#ff6f91",
      x: 130,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.applyDamage({
      sourceId: "attacker",
      targetId: "peer-a",
      weaponId: "pistol",
      damage: 34,
      knockback: { x: 0, y: 0 },
      stun: 0,
      label: "Setup",
      skipHitLocationScaling: true,
    });

    const activated = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(activated).toMatchObject({ kind: "utility", label: "Death Aura" });
    const initialState = combat.getDeathAuraState("peer-a");
    expect(initialState).toMatchObject({
      active: true,
      activeTimer: expect.closeTo(60, 1),
      cooldownTimer: 0,
    });
    expect(initialState.suffering).toBeGreaterThanOrEqual(34);
    expect(initialState.power).toBeGreaterThan(0.3);
    expect(combat.getSnapshot().effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "DEATH RELEASE" }),
    ]));

    combat.update(0.5, [player]);
    const secondClick = combat.useSecondary({ ownerId: "peer-a", player, aim: { x: -1, y: 0 }, now: 600, heldMs: 0, isNewPress: true });
    expect(secondClick).toMatchObject({ kind: "blocked", label: "Aura active" });
    expect(combat.getDeathAuraState("peer-a").activeTimer).toBeLessThan(60);

    combat.update(59.6, [player]);
    const ended = combat.getDeathAuraState("peer-a");
    expect(ended.active).toBe(false);
    expect(ended.cooldownTimer).toBeGreaterThan(39);
    expect(ended.suffering).toBeGreaterThanOrEqual(34);
    expect(combat.getSnapshot().effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "DEATH RECALL" }),
    ]));

    const cooldownBlocked = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 61000, heldMs: 0, isNewPress: true });
    expect(cooldownBlocked).toMatchObject({ kind: "blocked", label: "Aura cooldown" });
    expect(combat.getDeathAuraState("peer-a").suffering).toBeGreaterThanOrEqual(34);

    combat.update(40.1, [player]);
    expect(combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 102000, heldMs: 0, isNewPress: true })).toMatchObject({ kind: "utility", label: "Death Aura" });
  });

  it("gives Death Aura frozen airborne targets a heavy fall without permanent lock", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("death-aura");
    const player = { ...playerState, id: "peer-a", velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "airborne",
      name: "Airborne",
      color: "#ff6f91",
      x: 66,
      y: 120,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: -60,
    });
    const owner = combat.getCombatant("peer-a")!;
    owner.hp = 15;

    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.25, [player]);
    const target = combat.getCombatant("airborne")!;
    expect(target.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "deathFrozen" })]));
    combat.update(0.05, [player]);
    expect(target.velocityY).toBeGreaterThan(DEFAULT_PHYSICS.gravity * 0.05 * 3);

    target.x = 640;
    target.invulnerable = 0;
    combat.update(1.2, [player]);
    expect(combat.getCombatant("airborne")!.statuses.some((status) => status.id === "deathFrozen")).toBe(false);
  });

  it("places, lights, rides, destabilizes, and explodes Rockets", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("rocket");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "target",
      name: "Target",
      color: "#ff6f91",
      x: 315,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const placed = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(placed).toMatchObject({ kind: "utility", label: "Rocket Placed" });
    expect(combat.getSnapshot().projectiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ weaponId: "rocket", label: "ROCKET RESTING" }),
    ]));

    const lit = combat.useSecondary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 300, heldMs: 0, isNewPress: true });
    expect(lit).toMatchObject({ kind: "utility", label: "Rocket Lit" });
    expect(combat.getRocketState("peer-a")).toMatchObject({ active: true, lit: true, riding: true });

    combat.setRocketGuidance("peer-a", { x: 0.15, y: -1 });
    combat.update(0.24, [player]);
    expect(player.x).toBeGreaterThan(50);
    const guidedRocket = combat.getSnapshot().projectiles[0];
    expect(guidedRocket).toMatchObject({ weaponId: "rocket", label: "ROCKET LIT" });
    expect(guidedRocket.vy).toBeLessThan(-50);

    expect(combat.jumpOffRocket("peer-a", player)).toBe(true);
    expect(combat.getRocketState("peer-a").riding).toBe(false);
    combat.update(0.7, [player]);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "Rocket Fire" || effect.label === "Chaotic")).toBe(true);

    combat.update(0.5, [player]);
    expect(combat.getCombatant("target")!.hp).toBeLessThan(100);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "BOOM")).toBe(true);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["rocket-light", "rocket-explode"]));
  });

  it("uses true giant radius falloff for Rocket explosions with top-tier knockback, self damage, and large visuals", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("rocket");
    const owner = { ...playerState, id: "peer-a", x: 204, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Host", "#18dff5");
    const centerDummy = combat.spawnTrainingDummy({ x: 300, y: playerState.y });
    combat.syncRemotePlayer({
      id: "edge",
      name: "Edge",
      color: "#ffd84d",
      x: 462,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.syncRemotePlayer({
      id: "outside",
      name: "Outside",
      color: "#b096ff",
      x: 620,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.usePrimary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.useSecondary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 300, heldMs: 0, isNewPress: true });
    const rocket = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "rocket")!;
    rocket.x = 320;
    rocket.y = DEFAULT_PHYSICS.groundY - rocket.radius;
    rocket.vx = 0;
    rocket.vy = 0;
    rocket.age = 0.2;
    rocket.riderId = "peer-a";

    combat.update(1 / 60, [owner]);

    const center = combat.getCombatant(centerDummy.id)!;
    const edge = combat.getCombatant("edge")!;
    const outside = combat.getCombatant("outside")!;
    const ownerCombatant = combat.getCombatant("peer-a")!;

    expect(center.hp).toBeLessThan(edge.hp);
    expect(center.hp).toBeLessThanOrEqual(25);
    expect(edge.hp).toBeLessThan(100);
    expect(edge.hp).toBeGreaterThan(center.hp);
    expect(outside.hp).toBe(100);
    expect(ownerCombatant.hp).toBeLessThan(100);
    expect(Math.hypot(center.velocityX, center.velocityY)).toBeGreaterThan(1300);
    expect(Math.hypot(edge.velocityX, edge.velocityY)).toBeGreaterThan(600);
    expect(Math.hypot(center.velocityX, center.velocityY)).toBeGreaterThan(Math.hypot(edge.velocityX, edge.velocityY));
    expect(center.velocityY).toBeLessThan(-800);
    expect(edge.velocityY).toBeLessThan(-380);
    const effects = combat.getSnapshot().effects;
    const explosion = effects.find((effect) => effect.label === "EXPLOSION")!;
    const fireball = effects.find((effect) => effect.label === "FIREBALL")!;
    const smoke = effects.find((effect) => effect.label === "SMOKE CLOUD")!;
    const shockwave = effects.find((effect) => effect.label === "BOOM")!;
    expect(explosion).toMatchObject({ kind: "explosion" });
    expect(explosion.tx - explosion.x).toBeGreaterThanOrEqual(260);
    expect(fireball).toMatchObject({ kind: "explosion" });
    expect(fireball.tx - fireball.x).toBeGreaterThanOrEqual(180);
    expect(smoke).toMatchObject({ kind: "aura" });
    expect(smoke.tx - smoke.x).toBeGreaterThanOrEqual(230);
    expect(shockwave).toMatchObject({ kind: "shockwave" });
    expect(shockwave.tx - shockwave.x).toBeGreaterThanOrEqual(260);
    expect(effects.filter((effect) => effect.label === "DEBRIS" && effect.kind === "spark").length).toBeGreaterThanOrEqual(12);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "rocket", targetId: centerDummy.id, label: "Rocket Explosion" }),
      expect.objectContaining({ action: "hit", weaponId: "rocket", targetId: "edge", label: "Rocket Explosion" }),
      expect.objectContaining({ action: "hit", weaponId: "rocket", targetId: "peer-a", label: "Rocket Explosion" }),
    ]));
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["rocket-light", "rocket-explode"]));
  });

  it("fires Holy Bazooka only with pickup ammo, homes, explodes hardest, and steals health capacity", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("holy-bazooka");
    const owner = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Host", "#18dff5");
    const ownerCombatant = combat.getCombatant("peer-a")!;
    ownerCombatant.hp = 70;
    ownerCombatant.maxHp = 100;
    const targetInfo = combat.spawnTrainingDummy({ x: 285, y: playerState.y });
    const target = combat.getCombatant(targetInfo.id)!;
    target.hp = 140;
    target.maxHp = 140;
    target.invulnerable = 0;

    const empty = combat.usePrimary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(empty.kind).toBe("dry-fire");
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === "holy-bazooka")).toBe(false);

    combat.update(10.1, [owner]);
    expect(combat.getSnapshot().ammoPickups.some((item) => item.weaponId === "holy-bazooka")).toBe(false);

    const spawnedAmmo = combat.useSecondary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 10_200, heldMs: 0, isNewPress: true });
    expect(spawnedAmmo).toMatchObject({ kind: "utility", weaponId: "holy-bazooka", label: "Holy Ammo" });
    const pickup = combat.getSnapshot().ammoPickups.find((item) => item.weaponId === "holy-bazooka");
    expect(pickup).toBeDefined();
    expect(Math.hypot(pickup!.x - (owner.x + owner.width / 2), pickup!.y - (owner.y + owner.height / 2))).toBeGreaterThan(120);
    const cooldownSpawn = combat.useSecondary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 10_300, heldMs: 0, isNewPress: true });
    expect(cooldownSpawn).toMatchObject({ kind: "blocked", weaponId: "holy-bazooka", label: "Ammo cooldown" });
    expect(combat.getSnapshot().ammoPickups.filter((item) => item.weaponId === "holy-bazooka")).toHaveLength(1);

    pickup!.x = owner.x + owner.width / 2;
    pickup!.y = owner.y + owner.height / 2;
    combat.update(1 / 60, [owner]);
    expect(combat.getPlayerInventory().ammo["holy-bazooka"]?.magazine).toBe(1);

    const fired = combat.usePrimary({ ownerId: "peer-a", player: owner, aim: { x: 1, y: 0 }, now: 10_500, heldMs: 0, isNewPress: true });
    expect(fired).toMatchObject({ kind: "fired", weaponId: "holy-bazooka", label: "Holy Bazooka" });
    expect(combat.getPlayerInventory().ammo["holy-bazooka"]?.magazine).toBe(0);
    expect(combat.getPlayerInventory().cooldowns["holy-bazooka"]).toBeGreaterThanOrEqual(6.9);
    expect(owner.velocityX).toBeLessThan(-900);

    const missile = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "holy-bazooka")!;
    expect(missile).toBeDefined();
    const initialVy = missile.vy;
    combat.update(0.4, [owner]);
    expect(Math.abs(missile.vy)).toBeGreaterThan(Math.abs(initialVy));

    missile.x = target.x + target.width / 2;
    missile.y = target.y + target.height / 2;
    missile.vx = 0;
    missile.vy = 0;
    target.invulnerable = 0;
    combat.update(1 / 60, [owner]);

    expect(target.hp).toBeLessThanOrEqual(25);
    expect(ownerCombatant.maxHp).toBeGreaterThan(100);
    expect(ownerCombatant.maxHp).toBeLessThanOrEqual(260);
    expect(ownerCombatant.hp).toBeGreaterThan(70);
    const explosion = combat.getSnapshot().effects.find((effect) => effect.label === "HOLY EXPLOSION")!;
    expect(explosion).toMatchObject({ kind: "explosion" });
    expect(explosion.tx - explosion.x).toBeGreaterThanOrEqual(420);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "hit", weaponId: "holy-bazooka", targetId: targetInfo.id, label: "Holy Bazooka Explosion" }),
    ]));
    expect(combat.consumeSounds()).toContain("holy-bazooka-explode");
  });

  it("places and launches Rockets in the aimed facing direction before chaos", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("rocket");
    const player = { ...playerState, id: "peer-a", x: 0, facing: 1 as const, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");

    expect(combat.usePrimary({ ownerId: "peer-a", player, aim: { x: -1, y: 0 }, now: 100, heldMs: 0, isNewPress: true })).toMatchObject({ kind: "utility", label: "Rocket Placed" });
    const placedRocket = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "rocket")!;
    expect(placedRocket.ownerFacing).toBe(-1);
    const startX = placedRocket.x;

    expect(combat.useSecondary({ ownerId: "peer-a", player, aim: { x: -1, y: 0 }, now: 300, heldMs: 0, isNewPress: true })).toMatchObject({ kind: "utility", label: "Rocket Lit" });
    expect(combat.getSnapshot().projectiles[0]).toMatchObject({ ownerFacing: -1, label: "ROCKET LIT" });
    expect(combat.getSnapshot().projectiles[0].vx).toBeLessThan(0);
    const fire = combat.getSnapshot().effects.find((effect) => effect.label === "Rocket Fire")!;
    expect(fire.tx).toBeGreaterThan(startX);

    combat.update(0.24, [player]);
    const straightRocket = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "rocket")!;
    expect(straightRocket.x).toBeLessThan(startX - 70);
    expect(straightRocket.state).toBe("lit");

    combat.update(0.315, [player]);
    expect(combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === "rocket")?.state).toBe("chaotic");
  });

  it("starts Chainsaw damage immediately, overheats, spawns rising contribution zombies, and applies poison bites", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("chainsaw");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const victim = combat.spawnTrainingDummy({ x: 46, y: playerState.y });

    const started = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "chainsaw", label: "Running" });
    const running = combat.getWeaponRuntimeState("chainsaw", "peer-a");
    expect(running.chainsawMode).toBe("running");
    expect(running.chainsawRev).toBe(0);
    expect(running.chainsawDps).toBeGreaterThanOrEqual(8);
    combat.update(0.25, [player]);
    expect(combat.getCombatant(victim.id)!.hp).toBeLessThan(100);

    for (let index = 0; index < 12; index += 1) {
      combat.getCombatant(victim.id)!.invulnerable = 0;
      combat.update(0.25, [player]);
    }
    const contributionBeforeKill = combat.getWeaponRuntimeState("chainsaw", "peer-a").chainsawDamageTotal;
    expect(contributionBeforeKill).toBeGreaterThan(20);

    const target = combat.getCombatant(victim.id)!;
    target.hp = 2;
    target.invulnerable = 0;
    combat.update(0.25, [player]);

    const zombie = combat.getSnapshot().zombies[0];
    expect(zombie).toBeDefined();
    expect(zombie.ownerId).toBe("peer-a");
    const zombieBody = combat.getCombatant(zombie.id)!;
    expect(zombieBody.hp).toBeGreaterThan(5);
    expect(zombieBody.hp).toBeLessThanOrEqual(150);
    expect(zombie.riseTimer).toBeGreaterThan(0);
    expect(zombie.riseDuration).toBeGreaterThanOrEqual(0.8);
    expect(zombieBody.invulnerable).toBeGreaterThan(0.5);
    const sounds = combat.consumeSounds();
    expect(sounds).toEqual(expect.arrayContaining(["chainsaw-run", "chainsaw-hit", "zombie-spawn"]));
    expect(sounds).not.toContain("chainsaw-rev");

    const prey = combat.syncRemotePlayer({
      id: "peer-b",
      name: "Prey",
      color: "#ff6f91",
      x: zombieBody.x + 26,
      y: zombieBody.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
      hp: 100,
      statuses: [],
    });
    for (let index = 0; index < 4; index += 1) {
      prey.invulnerable = 0;
      combat.update(0.12, [player]);
    }
    expect(combat.getCombatant("peer-b")!.statuses.some((status) => status.id === "poison")).toBe(false);
    for (let index = 0; index < 8; index += 1) {
      prey.invulnerable = 0;
      combat.update(0.12, [player]);
    }
    expect(combat.getCombatant("peer-b")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "poison" })]));
    const poisonedHp = combat.getCombatant("peer-b")!.hp;
    combat.getCombatant("peer-b")!.invulnerable = 0;
    combat.update(1.05, [player]);
    expect(combat.getCombatant("peer-b")!.hp).toBeLessThan(poisonedHp);

    const overheatCombat = new CombatSystem({ mode: "offline" });
    overheatCombat.start(createDefaultInventory());
    overheatCombat.equip("chainsaw");
    const overheatPlayer = { ...playerState, id: "local", x: 0, velocityX: 0, velocityY: 0 };
    overheatCombat.syncLocalPlayer(overheatPlayer, "Tester", "#18dff5");
    overheatCombat.usePrimary({ ownerId: "local", player: overheatPlayer, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    overheatCombat.update(17.4, [overheatPlayer]);
    expect(overheatCombat.getWeaponRuntimeState("chainsaw", "local").chainsawMode).toBe("overheated");
    expect(overheatCombat.usePrimary({ ownerId: "local", player: overheatPlayer, aim: { x: 1, y: 0 }, now: 18_000, heldMs: 0, isNewPress: true })).toMatchObject({
      kind: "blocked",
      weaponId: "chainsaw",
      label: "Overheated",
    });
  });

  it("removes killed Chainsaw zombies permanently instead of respawning dummy bodies", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("chainsaw");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const victim = combat.spawnTrainingDummy({ x: 46, y: playerState.y });

    combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    for (let index = 0; index < 14; index += 1) {
      combat.getCombatant(victim.id)!.invulnerable = 0;
      combat.update(0.25, [player]);
    }
    combat.getCombatant(victim.id)!.hp = 1;
    combat.getCombatant(victim.id)!.invulnerable = 0;
    combat.update(0.25, [player]);

    const zombie = combat.getSnapshot().zombies[0];
    expect(zombie).toBeDefined();
    combat.getCombatant(zombie.id)!.invulnerable = 0;
    combat.applyDamage({
      sourceId: "peer-a",
      targetId: zombie.id,
      weaponId: "pistol",
      damage: 999,
      knockback: { x: 120, y: -120 },
      stun: 0.2,
      label: "Zombie Cleanup Test",
      skipHitLocationScaling: true,
    });
    const deathEffectShown = combat.getSnapshot().effects.some((effect) => effect.label === "ZOMBIE DOWN");
    combat.update(3.5, [player]);

    expect(combat.getSnapshot().zombies.some((item) => item.id === zombie.id)).toBe(false);
    expect(combat.getCombatant(zombie.id)).toBeUndefined();
    expect(combat.getSnapshot().combatants.some((item) => item.id === zombie.id)).toBe(false);
    expect(deathEffectShown).toBe(true);
  });

  it("aims Spikes tips at clicks, poisons body contact including the owner, and impales only on the tip", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("spikes");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const dummy = combat.spawnTrainingDummy({ x: 860, y: playerState.y });

    const activated = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(activated).toMatchObject({ kind: "utility", weaponId: "spikes", label: "Spike Mode" });
    expect(combat.getWeaponRuntimeState("spikes", "peer-a")).toMatchObject({
      spikeModeActive: true,
      spikeModeTimer: expect.closeTo(30, 0.1),
      spikeCooldown: 0,
    });

    const spawnPoint = { x: 260, y: DEFAULT_PHYSICS.groundY - 260 };
    const placed = combat.placeSpikeAt("peer-a", player, spawnPoint, 120);
    expect(placed).toMatchObject({ kind: "utility", weaponId: "spikes", label: "Spike Spawn" });
    const spike = combat.getSnapshot().spikes[0];
    expect(spike).toMatchObject({ ownerId: "peer-a", disintegrating: false });
    expect(spike.tipX).toBeCloseTo(spawnPoint.x, 0);
    expect(spike.tipY).toBeCloseTo(spawnPoint.y, 0);
    expect(spike.length).toBeGreaterThan(120);
    expect(Math.hypot(spike.dirX, spike.dirY)).toBeCloseTo(1, 2);

    const target = combat.getCombatant(dummy.id)!;
    const shaftX = (spike.baseX + spike.tipX) / 2;
    const shaftY = (spike.baseY + spike.tipY) / 2;
    target.x = shaftX - target.width / 2;
    target.y = shaftY - target.height / 2;
    target.invulnerable = 0;
    combat.update(0.05, [player]);
    expect(target.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spikePoison" })]));
    expect(combat.isMovementLocked(dummy.id)).toBe(false);

    target.statuses = [];
    target.x = spike.tipX - target.width / 2;
    target.y = spike.tipY - target.height / 2;
    target.invulnerable = 0;
    combat.update(0.05, [player]);
    expect(combat.isMovementLocked(dummy.id)).toBe(true);
    const lockedX = target.x;
    target.velocityX = 900;
    target.invulnerable = 0;
    const hpAfterImpale = target.hp;
    combat.update(1.05, [player]);
    expect(Math.abs(target.x - lockedX)).toBeLessThan(6);
    expect(target.velocityX).toBe(0);
    expect(target.hp).toBeLessThan(hpAfterImpale);

    const ownerTouch = combat.placeSpikeAt("peer-a", player, {
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
    }, 180);
    expect(ownerTouch).toMatchObject({ kind: "utility", weaponId: "spikes", label: "Spike Spawn" });
    combat.update(0.2, [player]);
    expect(combat.getCombatant("peer-a")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spikePoison" })]));

    const second = combat.placeSpikeAt("peer-a", player, { x: spawnPoint.x + 50, y: spawnPoint.y }, 220);
    expect(second).toMatchObject({ kind: "utility", weaponId: "spikes", label: "Spike Spawn" });
    expect(combat.getSnapshot().spikes.filter((item) => !item.disintegrating)).toHaveLength(3);

    combat.update(30.2, [player]);
    expect(combat.getWeaponRuntimeState("spikes", "peer-a")).toMatchObject({
      spikeModeActive: false,
      spikeCooldown: expect.closeTo(60, 0.5),
    });
    expect(combat.getSnapshot().spikes.every((item) => item.disintegrating)).toBe(true);
    expect(combat.isMovementLocked(dummy.id)).toBe(false);
  });

  it("lets Teleporting Ball break a spike impale while normal movement stays locked", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const targetPlayer = { ...playerState, id: "target", x: 210, velocityX: 0, velocityY: 0 };
    const spiker = { ...playerState, id: "spiker", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(targetPlayer, "Target", "#18dff5");
    combat.syncRemotePlayer({
      id: "spiker",
      name: "Spiker",
      color: "#ff6f91",
      x: spiker.x,
      y: spiker.y,
      width: spiker.width,
      height: spiker.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.equip("spikes");
    combat.usePrimary({ ownerId: "spiker", player: spiker, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.placeSpikeAt("spiker", spiker, {
      x: targetPlayer.x + targetPlayer.width / 2,
      y: targetPlayer.y + targetPlayer.height / 2,
    }, 120);
    combat.update(0.2, [targetPlayer]);
    expect(combat.isMovementLocked("target")).toBe(true);
    const pinnedX = targetPlayer.x;
    targetPlayer.velocityX = 900;
    combat.update(0.08, [targetPlayer]);
    expect(targetPlayer.x).toBeCloseTo(pinnedX, 0);

    combat.equip("teleport-ball");
    combat.usePrimary({ ownerId: "target", player: targetPlayer, aim: { x: 1, y: -0.1 }, now: 200, heldMs: 0, isNewPress: true });
    combat.update(3.2, [targetPlayer]);
    expect(combat.isMovementLocked("target")).toBe(false);
    expect(targetPlayer.x).toBeGreaterThan(pinnedX + 80);
  });

  it("spawns a strap Van, lets anyone drive it, rams, honks, absorbs, refills gas, and explodes with splash", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("van");
    const owner = { ...playerState, id: "owner", x: 0, velocityX: 0, velocityY: 0 };
    const driver = { ...playerState, id: "driver", x: 70, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Owner", "#18dff5");
    combat.syncRemotePlayer({
      id: "driver",
      name: "Driver",
      color: "#ff6f91",
      x: driver.x,
      y: driver.y,
      width: driver.width,
      height: driver.height,
      velocityX: 0,
      velocityY: 0,
    });

    const spawned = combat.usePrimary({ ownerId: "owner", player: owner, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(spawned).toMatchObject({ kind: "utility", weaponId: "van", label: "Van Spawn" });
    combat.update(0.6, [owner, driver]);
    const van = combat.getSnapshot().vans[0];
    expect(van).toMatchObject({ ownerId: "owner", state: "active", health: van.maxHealth, gas: van.maxGas });

    const entered = combat.tryEnterVan("driver", driver, { x: van.x, y: van.y }, 140);
    expect(entered).toMatchObject({ kind: "utility", weaponId: "van", label: "Enter Van" });
    expect(van.occupantId).toBe("driver");

    combat.handleVanDriverInput("driver", {
      left: false,
      right: true,
      shiftPressed: true,
      jumpPressed: false,
      honkPressed: false,
    }, driver, 160);
    combat.update(0.55, [owner, driver]);
    expect(van.speedLevel).toBe(1);
    expect(van.gas).toBeLessThan(van.maxGas);
    expect(van.velocityX).toBeGreaterThan(0);

    const hornTarget = combat.spawnTrainingDummy({ x: van.x + van.width + 95, y: playerState.y });
    combat.handleVanDriverInput("driver", {
      left: false,
      right: false,
      shiftPressed: false,
      jumpPressed: false,
      honkPressed: true,
    }, driver, 800);
    expect(combat.getCombatant(hornTarget.id)!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "daze" })]));

    const ramTarget = combat.spawnTrainingDummy({ x: van.x + van.width + 4, y: playerState.y });
    van.velocityX = 960;
    van.speedLevel = 5;
    combat.getCombatant(ramTarget.id)!.invulnerable = 0;
    combat.update(0.06, [owner, driver]);
    expect(combat.getCombatant(ramTarget.id)!.hp).toBeLessThan(100);
    expect(combat.getCombatant(ramTarget.id)!.velocityX).toBeGreaterThan(200);

    const absorbed = combat.usePrimary({ ownerId: "owner", player: owner, aim: { x: 1, y: 0 }, now: 1000, heldMs: 0, isNewPress: true });
    expect(absorbed).toMatchObject({ kind: "utility", weaponId: "van", label: "Van Absorb" });
    expect(van.occupantId).toBeUndefined();
    combat.update(2, [owner, driver]);
    expect(van.state).toBe("stored");
    van.gas = 40;
    van.health = 77;
    combat.update(1, [owner, driver]);
    expect(van.gas).toBeGreaterThan(40);
    expect(van.health).toBe(77);

    van.state = "active";
    van.x = owner.x + 60;
    van.y = DEFAULT_PHYSICS.groundY - van.height;
    van.health = 1;
    const ownerHp = combat.getCombatant("owner")!.hp;
    combat.damageVan(van.id, 999, "driver", 4000);
    expect(van.state).toBe("destroyed");
    expect(combat.getCombatant("owner")!.hp).toBeLessThan(ownerHp);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "VAN EXPLOSION")).toBe(true);
  });

  it("balances Van gas, speed, Space entry, airborne spawn, landing damage, and driver explosion damage", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("van");
    const owner = { ...playerState, id: "owner", x: 0, y: 112, grounded: false, velocityX: 0, velocityY: 0 };
    const driver = { ...playerState, id: "driver", x: 42, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Owner", "#18dff5");
    combat.syncRemotePlayer({
      id: "driver",
      name: "Driver",
      color: "#ff6f91",
      x: driver.x,
      y: driver.y,
      width: driver.width,
      height: driver.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.usePrimary({ ownerId: "owner", player: owner, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    const van = combat.getSnapshot().vans[0];
    const floorY = DEFAULT_PHYSICS.groundY - van.height;
    expect(van.y).toBeLessThan(floorY - 120);
    expect(van.velocityY).toBeGreaterThanOrEqual(owner.velocityY);
    combat.update(1.15, [owner, driver]);
    expect(van.y).toBe(floorY);
    expect(van.health).toBeLessThan(van.maxHealth);

    driver.x = van.x - driver.width - 18;
    driver.y = van.y + van.height - driver.height;
    const entered = combat.tryEnterVan("driver", driver, {
      x: driver.x + driver.width / 2,
      y: driver.y + driver.height / 2,
    }, 1400);
    expect(entered).toMatchObject({ kind: "utility", label: "Enter Van" });

    for (let step = 0; step < 5; step += 1) {
      combat.handleVanDriverInput("driver", { left: false, right: false, shiftPressed: true, jumpPressed: false, honkPressed: false }, driver, 1500 + step);
    }
    expect(van.speedLevel).toBe(5);
    let maxObservedSpeed = 0;
    for (let frame = 0; frame < 50 * 60; frame += 1) {
      combat.handleVanDriverInput("driver", { left: false, right: true, shiftPressed: false, jumpPressed: false, honkPressed: false }, driver, 1600 + frame * 16);
      combat.update(1 / 60, [owner, driver]);
      maxObservedSpeed = Math.max(maxObservedSpeed, Math.abs(van.velocityX));
    }
    expect(van.gas).toBeGreaterThan(0.5);
    expect(maxObservedSpeed).toBeGreaterThan(DEFAULT_PHYSICS.maxRunSpeed);

    const driverHp = combat.getCombatant("driver")!.hp;
    van.health = 1;
    combat.damageVan(van.id, 999, "owner", 55_000);
    expect(van.state).toBe("destroyed");
    expect(combat.getCombatant("driver")!.hp).toBeLessThan(driverHp);
    expect(combat.getCombatant("driver")!.velocityY).toBeLessThan(-100);
  });

  it("lets normal weapon and effect systems damage and shove the heavy Van", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const attacker = { ...playerState, id: "attacker", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(attacker, "Attacker", "#18dff5");
    combat.equip("van");
    combat.usePrimary({ ownerId: "attacker", player: attacker, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.6, [attacker]);
    const van = combat.getSnapshot().vans[0];
    const startHealth = van.health;

    combat.equip("machete");
    attacker.x = van.x - attacker.width - 20;
    attacker.y = DEFAULT_PHYSICS.groundY - attacker.height;
    attacker.facing = 1;
    combat.syncLocalPlayer(attacker, "Attacker", "#18dff5");
    combat.usePrimary({ ownerId: "attacker", player: attacker, aim: { x: 1, y: 0 }, now: 900, heldMs: 0, isNewPress: true });
    combat.update(0.08, [attacker]);
    expect(van.health).toBeLessThan(startHealth);

    const afterMachete = van.health;
    combat.equip("death-aura");
    combat.usePrimary({ ownerId: "attacker", player: attacker, aim: { x: 1, y: 0 }, now: 1300, heldMs: 0, isNewPress: true });
    combat.update(0.3, [attacker]);
    expect(van.health).toBeLessThan(afterMachete);

    const afterAura = van.health;
    attacker.justSlamLanded = true;
    attacker.x = van.x + van.width / 2 - attacker.width / 2;
    combat.syncLocalPlayer(attacker, "Attacker", "#18dff5");
    combat.update(0.05, [attacker]);
    expect(van.health).toBeLessThan(afterAura);
    expect(van.velocityY).toBeLessThan(0);

    const afterSlam = van.health;
    combat.equip("spikes");
    combat.usePrimary({ ownerId: "attacker", player: attacker, aim: { x: 1, y: 0 }, now: 2000, heldMs: 0, isNewPress: true });
    combat.placeSpikeAt("attacker", attacker, { x: van.x + van.width / 2, y: van.y + van.height / 2 }, 2100);
    combat.update(0.12, [attacker]);
    expect(van.health).toBeLessThan(afterSlam);
  });

  it("runs Spirit of a Fighter with three miss chances before Winded failure", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("spirit-fighter" as never);
    const fighter = { ...playerState, id: "fighter", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(fighter, "Fighter", "#18dff5");
    const target = combat.spawnTrainingDummy({ x: 70, y: playerState.y });

    const activated = combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(activated).toMatchObject({ kind: "utility", weaponId: "spirit-fighter", label: "Spirit Focus" });
    expect(combat.getCombatant("fighter")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spiritFocus" })]));
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter")).toMatchObject({
      spiritActive: true,
      spiritCombo: 0,
      spiritMissesRemaining: 3,
    });

    combat.update(0.72, [fighter]);
    const punch = combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 820, heldMs: 0, isNewPress: true });
    expect(punch.label).toMatch(/Spirit (Perfect|Good) Punch/);
    expect(combat.getCombatant(target.id)!.hp).toBeLessThan(100);
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter").spiritCombo).toBe(1);

    const offBeat = combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 900, heldMs: 0, isNewPress: true });
    expect(offBeat).toMatchObject({ kind: "blocked", weaponId: "spirit-fighter", label: "Spirit Miss" });
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter")).toMatchObject({
      spiritActive: true,
      spiritMissesRemaining: 2,
      spiritMissesUsed: 1,
    });
    expect(combat.getCombatant("fighter")!.statuses.some((status) => status.id === "winded")).toBe(false);

    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 920, heldMs: 0, isNewPress: true });
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter").spiritMissesRemaining).toBe(1);
    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 940, heldMs: 0, isNewPress: true });
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter").spiritActive).toBe(false);
    expect(combat.getCombatant("fighter")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "winded" })]));
    expect(combat.getPlayerInventory().cooldowns["spirit-fighter" as never]).toBeGreaterThan(50);
  });

  it("exposes Spirit heart beat-line UI state with varied left/right patterns", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("spirit-fighter" as never);
    const fighter = { ...playerState, id: "fighter", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(fighter, "Fighter", "#18dff5");

    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    const initialRuntime = combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter");
    expect(initialRuntime.spiritHeartAssembling).toBe(true);
    expect(initialRuntime.spiritBeatPattern).toMatch(/normal|split|fast|slow|double|burst|unsynced|fake/);
    expect(initialRuntime.spiritBeatLines.length).toBeGreaterThanOrEqual(2);
    expect(initialRuntime.spiritBeatLines.some((line) => line.side === "left")).toBe(true);
    expect(initialRuntime.spiritBeatLines.some((line) => line.side === "right")).toBe(true);
    expect(initialRuntime.spiritBeatLines.every((line) => line.progress >= 0 && line.progress <= 1)).toBe(true);

    combat.update(0.72, [fighter]);
    const activeRuntime = combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter");
    expect(activeRuntime.spiritBeatLines.some((line) => line.progress > 0.75)).toBe(true);
  });

  it("counts no-action beats and whiffs as Spirit misses before breaking", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("spirit-fighter" as never);
    const fighter = { ...playerState, id: "fighter", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(fighter, "Fighter", "#18dff5");

    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(1.1, [fighter]);
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter")).toMatchObject({
      spiritActive: true,
      spiritMissesRemaining: 2,
    });
    expect(combat.getCombatant("fighter")!.statuses.some((status) => status.id === "winded")).toBe(false);

    combat.update(1.1, [fighter]);
    combat.update(0.72, [fighter]);
    const whiff = combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 2720, heldMs: 0, isNewPress: true });
    expect(whiff).toMatchObject({ kind: "blocked", label: "Spirit Whiff" });
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter").spiritActive).toBe(false);

    combat.update(61, [fighter]);
    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 4000, heldMs: 0, isNewPress: true });
    combat.applyDamage({
      sourceId: "dummy",
      targetId: "fighter",
      damage: 5,
      knockback: { x: 0, y: -20 },
      stun: 0.1,
      label: "Test Hit",
    });
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter").spiritActive).toBe(false);
    expect(combat.getCombatant("fighter")!.statuses.some((status) => status.id === "winded")).toBe(true);
  });

  it("does not count passive Spirit movement as off-beat input", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("spirit-fighter" as never);
    const fighter = {
      ...playerState,
      id: "fighter",
      y: playerState.y - 140,
      grounded: false,
      velocityX: 280,
      velocityY: 640,
    };
    combat.syncLocalPlayer(fighter, "Fighter", "#18dff5");

    combat.usePrimary({ ownerId: "fighter", player: fighter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(0.24, [fighter]);

    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter")).toMatchObject({
      spiritActive: true,
      spiritMissesRemaining: 3,
      spiritMissesUsed: 0,
    });

    combat.update(0.92, [fighter]);
    expect(combat.getWeaponRuntimeState("spirit-fighter" as never, "fighter")).toMatchObject({
      spiritActive: true,
      spiritMissesRemaining: 2,
      spiritMissesUsed: 1,
    });
  });

  it("summons five Hands, disables the summoner's hand use, scrambles targets, and lets spam shake them off", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("hands");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.syncRemotePlayer({
      id: "target",
      name: "Target",
      color: "#ff6f91",
      x: 96,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });

    const spawned = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(spawned).toMatchObject({ kind: "utility", label: "Hands" });
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "hands" && projectile.label === "MINI HAND")).toHaveLength(5);
    expect(combat.getCombatant("peer-a")!.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "handsMissing", duration: expect.closeTo(40, 1) })]));

    combat.equip("pistol");
    const noHands = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 200, heldMs: 0, isNewPress: true });
    expect(noHands).toMatchObject({ kind: "blocked", label: "No hands" });

    combat.update(1.0, [player]);
    const target = combat.getCombatant("target")!;
    expect(target.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "scrambled" })]));
    expect(combat.getHandsState("target").attached).toBeGreaterThan(0);
    target.invulnerable = 0;
    combat.update(1.05, [player]);
    expect(target.hp).toBeLessThanOrEqual(99);

    expect(combat.resistAttachedHands("target", 6)).toBe(true);
    expect(combat.getHandsState("target").attached).toBe(0);
    expect(target.statuses.some((status) => status.id === "scrambled")).toBe(false);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["hand-spawn", "hand-attach", "hand-flick"]));

    combat.update(40.1, [player]);
    expect(combat.getCombatant("peer-a")!.statuses.some((status) => status.id === "handsMissing")).toBe(false);
  });

  it("uses Cross stopwatch shield scaling, projectile deflection, Judgment Day, and rest lockout", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("cross" as never);
    const player = { ...playerState, id: "cross-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Cross", "#fff4a8");
    const dummy = combat.spawnTrainingDummy({ x: 92, y: playerState.y });

    const small = combat.usePrimary({ ownerId: "cross-user", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(small).toMatchObject({ kind: "utility", weaponId: "cross", label: "Crescent Shield" });
    const smallShield = combat.getSnapshot().crossShields.at(-1)!;
    expect(smallShield.radius).toBeGreaterThanOrEqual(54);
    combat.update(0.1, [player]);
    expect(combat.getCombatant(dummy.id)!.velocityX).toBeGreaterThan(350);

    combat.update(9.0, [player]);
    combat.getPlayerInventory().cooldowns.cross = 0;
    const charged = combat.usePrimary({ ownerId: "cross-user", player, aim: { x: 1, y: -0.15 }, now: 9300, heldMs: 0, isNewPress: true });
    expect(charged.kind).toBe("utility");
    const largeShield = combat.getSnapshot().crossShields.at(-1)!;
    expect(largeShield.radius).toBeGreaterThan(smallShield.radius + 30);
    expect(largeShield.knockback).toBeGreaterThan(smallShield.knockback + 250);

    combat.equip("pistol");
    const hostile = { ...playerState, id: "hostile", x: 260, velocityX: 0, velocityY: 0 };
    combat.syncRemotePlayer({
      id: "hostile",
      name: "Hostile",
      color: "#ff6f91",
      x: 260,
      y: playerState.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.usePrimary({ ownerId: "hostile", player: hostile, aim: { x: -1, y: 0 }, now: 9400, heldMs: 0, isNewPress: true });
    combat.equip("cross" as never);
    combat.update(0.18, [player]);
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === "pistol" && projectile.ownerId === "cross-user")).toBe(true);

    combat.update(1.0, [player]);
    const judgment = combat.useSecondary({ ownerId: "cross-user", player, aim: { x: 0, y: -1 }, now: 11000, heldMs: 0, isNewPress: true });
    expect(judgment).toMatchObject({ kind: "utility", weaponId: "cross", label: "Judgment Day" });
    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "countdown", timer: expect.closeTo(60, 1), ownerId: "cross-user" });
    expect(combat.getSnapshot().judgmentBeams).toHaveLength(0);
    expect(combat.getWeaponRuntimeState("cross" as never, "cross-user")).toMatchObject({
      crossRestTimer: expect.closeTo(180, 1),
      crossJudgmentActive: true,
      crossJudgmentPhase: "countdown",
    });
    expect(combat.usePrimary({ ownerId: "cross-user", player, aim: { x: 1, y: 0 }, now: 11100, heldMs: 0, isNewPress: true })).toMatchObject({
      kind: "blocked",
      label: "Cross resting",
    });
    combat.update(59.4, [player]);
    expect(combat.getSnapshot().judgmentBeams).toHaveLength(0);
    expect(combat.getCombatant("cross-user")?.respawnTimer).toBe(0);

    combat.update(0.7, [player]);
    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "active" });
    const warningBeam = combat.getSnapshot().judgmentBeams.at(0);
    expect(warningBeam).toMatchObject({
      ownerId: "cross-user",
      warning: expect.closeTo(1, 2),
    });
    expect(warningBeam?.fired).not.toBe(true);

    const skyDummy = combat.spawnTrainingDummy({ x: player.x, y: playerState.y - 900 });
    skyDummy.invulnerable = 0;
    combat.update(1.05, [player]);
    expect(combat.getCombatant("cross-user")?.respawnTimer).toBeGreaterThan(0);
    expect(combat.getCombatant(skyDummy.id)?.respawnTimer).toBeGreaterThan(0);
    expect(combat.consumeEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ weaponId: "cross", action: "secondary", label: "Judgment Day" }),
    ]));
  });

  it("limits Cross shield contact to the faced crescent instead of a full bubble", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("cross" as never);
    const player = { ...playerState, id: "arc-cross-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Cross", "#fff4a8");
    const front = { ...playerState, id: "front-cross-target", x: 96, velocityX: 0, velocityY: 0 };
    const rear = { ...playerState, id: "rear-cross-target", x: 28, velocityX: 0, velocityY: 0 };
    combat.syncRemotePlayer({
      id: front.id,
      name: "Front",
      color: "#ff6f91",
      x: front.x,
      y: front.y,
      width: front.width,
      height: front.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.syncRemotePlayer({
      id: rear.id,
      name: "Rear",
      color: "#b096ff",
      x: rear.x,
      y: rear.y,
      width: rear.width,
      height: rear.height,
      velocityX: 0,
      velocityY: 0,
    });

    const result = combat.usePrimary({ ownerId: player.id, player, aim: { x: 1, y: 0 }, now: 120, heldMs: 0, isNewPress: true });
    expect(result).toMatchObject({ kind: "utility", weaponId: "cross", label: "Crescent Shield" });
    const shield = (combat.getSnapshot() as unknown as { crossShields: Array<{ arcRadians: number }> }).crossShields.at(-1)!;
    expect(shield.arcRadians).toBeLessThanOrEqual(Math.PI * 1.08);

    combat.update(0.1, [player]);

    expect(combat.getCombatant(front.id)!.velocityX).toBeGreaterThan(350);
    expect(combat.getCombatant(rear.id)!.hp).toBe(100);
    expect(Math.abs(combat.getCombatant(rear.id)!.velocityX)).toBeLessThan(20);
  });

  it("activates The Moon as an independent one-minute map event with reversible user side switching", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("moon" as never);
    const moonUser = { ...playerState, id: "moon-user", x: 0, velocityX: 0, velocityY: 0 };
    const otherPlayer = { ...playerState, id: "other-player", x: 92, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(moonUser, "Moon", "#d6f2ff");
    combat.syncRemotePlayer({
      id: "other-player",
      name: "Other",
      color: "#ff6f91",
      x: otherPlayer.x,
      y: otherPlayer.y,
      width: otherPlayer.width,
      height: otherPlayer.height,
      velocityX: otherPlayer.velocityX,
      velocityY: otherPlayer.velocityY,
    });

    const started = combat.usePrimary({ ownerId: "moon-user", player: moonUser, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "moon", label: "Moonfall" });
    expect(combat.getMoonEventState("moon-user")).toMatchObject({
      active: true,
      timer: expect.closeTo(60, 1),
      userSide: "bottom",
      ownerId: "moon-user",
    });
    expect(combat.getSnapshot().moonEvents).toHaveLength(1);

    combat.update(0.5, [moonUser, otherPlayer]);
    expect(combat.getCombatant("moon-user")!.y).toBeCloseTo(DEFAULT_PHYSICS.groundY - moonUser.height, 1);
    expect(combat.getCombatant("other-player")!.y).toBeLessThan(playerState.y - 120);

    const switching = combat.switchMoonSide("moon-user", 700);
    expect(switching).toMatchObject({ kind: "utility", weaponId: "moon", label: "Moon Switch" });
    combat.update(0.25, [moonUser, otherPlayer]);
    expect(combat.getMoonEventState("moon-user")).toMatchObject({ active: true, switching: true, targetSide: "top" });

    const reversed = combat.switchMoonSide("moon-user", 820);
    expect(reversed).toMatchObject({ kind: "utility", weaponId: "moon", label: "Moon Switch" });
    combat.update(0.9, [moonUser, otherPlayer]);
    expect(combat.getMoonEventState("moon-user")).toMatchObject({ active: true, userSide: "bottom", switching: false });

    combat.update(60.2, [moonUser, otherPlayer]);
    expect(combat.getMoonEventState("moon-user")).toMatchObject({ active: false, timer: 0 });
    expect(combat.getCombatant("other-player")!.y).toBeCloseTo(DEFAULT_PHYSICS.groundY - otherPlayer.height, 1);
  });

  it("moves The Moon top floor to the screen top band and exposes rise/hold/descent animation state", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("moon" as never);
    const moonUser = { ...playerState, id: "moon-anim-user", x: 0, velocityX: 0, velocityY: 0 };
    const otherPlayer = { ...playerState, id: "moon-anim-other", x: 92, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(moonUser, "Moon", "#d6f2ff");
    combat.syncRemotePlayer({
      id: "moon-anim-other",
      name: "Other",
      color: "#ff6f91",
      x: otherPlayer.x,
      y: otherPlayer.y,
      width: otherPlayer.width,
      height: otherPlayer.height,
      velocityX: otherPlayer.velocityX,
      velocityY: otherPlayer.velocityY,
    });

    combat.usePrimary({ ownerId: "moon-anim-user", player: moonUser, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    let moon = combat.getSnapshot().moonEvents[0] as unknown as {
      topFloorY: number;
      moonVisualPhase: "rising" | "holding" | "descending";
      moonRiseProgress: number;
      moonDescendProgress: number;
    };

    expect(moon.topFloorY).toBeLessThanOrEqual(DEFAULT_PHYSICS.groundY - 620);
    expect(moon.moonVisualPhase).toBe("rising");
    expect(moon.moonRiseProgress).toBeCloseTo(0, 1);

    combat.update(1.25, [moonUser, otherPlayer]);
    moon = combat.getSnapshot().moonEvents[0] as typeof moon;
    expect(moon.moonVisualPhase).toBe("holding");
    expect(moon.moonRiseProgress).toBe(1);
    expect(combat.getCombatant("moon-anim-other")!.y).toBeLessThanOrEqual(DEFAULT_PHYSICS.groundY - 610);

    combat.update(55.2, [moonUser, otherPlayer]);
    moon = combat.getSnapshot().moonEvents[0] as typeof moon;
    expect(moon.moonVisualPhase).toBe("descending");
    expect(moon.moonDescendProgress).toBeGreaterThan(0);
  });

  it("activates Jupiter with delayed footstep pressure bursts instead of map holes", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("jupiter" as never);
    const player = { ...playerState, id: "jupiter-user", x: -120, velocityX: 190, velocityY: 0 };
    combat.syncLocalPlayer(player, "Jupiter", "#ff9f3d");

    const started = combat.usePrimary({ ownerId: "jupiter-user", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "jupiter", label: "Jupiter" });

    let snapshot = combat.getSnapshot() as unknown as {
      jupiterEvents: Array<{ ownerId: string; timer: number; gasAlpha: number; tornado: { x: number; y: number; radius: number; coreRadius: number } }>;
      jupiterFootsteps: Array<{ id: string; ownerId: string; x: number; y: number; radius: number; age: number; delay: number; exploded: boolean }>;
      jupiterSharks: unknown[];
    } & Record<string, unknown>;
    expect(snapshot.jupiterEvents).toHaveLength(1);
    expect(snapshot.jupiterEvents[0]).toMatchObject({ ownerId: "jupiter-user", timer: expect.closeTo(60, 1) });
    expect(snapshot.jupiterEvents[0].gasAlpha).toBeGreaterThan(0);
    expect("jupiterHoles" in snapshot).toBe(false);
    expect(snapshot.jupiterFootsteps).toHaveLength(0);
    expect(snapshot.jupiterSharks).toHaveLength(0);

    combat.update(0.36, [player]);
    expect(combat.getCombatant("jupiter-user")!.velocityY).toBeLessThan(0);

    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.jupiterFootsteps).toHaveLength(1);
    const marker = snapshot.jupiterFootsteps[0];
    expect(marker).toMatchObject({
      ownerId: "jupiter-user",
      delay: expect.closeTo(1, 1),
      exploded: false,
    });
    expect(marker.radius).toBeGreaterThanOrEqual(70);
    expect(marker.radius).toBeLessThanOrEqual(120);
    player.x = marker.x - DEFAULT_PHYSICS.width / 2;
    player.velocityX = 0;
    player.velocityY = 0;
    combat.syncLocalPlayer(player, "Jupiter", "#ff9f3d");
    combat.syncRemotePlayer({
      id: "jupiter-footstep-victim",
      name: "Footstep",
      color: "#ff6f91",
      x: marker.x - DEFAULT_PHYSICS.width / 2,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.8, [player]);
    const victim = combat.getCombatant("jupiter-footstep-victim")!;
    expect(victim.hp).toBeLessThan(100);
    expect(victim.velocityY).toBeLessThan(-1400);
    expect(combat.getCombatant("jupiter-user")!.hp).toBeLessThan(100);
    expect(combat.consumeSounds()).toContain("jupiter-burst");
  });

  it("runs Jupiter tornado suction and killable homing sharks with cleanup", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("jupiter" as never);
    const owner = { ...playerState, id: "jupiter-owner", x: -180, velocityX: 0, velocityY: 0 };
    const target = { ...playerState, id: "jupiter-target", x: 260, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Jupiter", "#ff9f3d");
    combat.syncRemotePlayer({
      id: "jupiter-target",
      name: "Target",
      color: "#ff6f91",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      velocityX: 0,
      velocityY: 0,
    });

    combat.usePrimary({ ownerId: "jupiter-owner", player: owner, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(3.2, [owner, target]);
    let snapshot = combat.getSnapshot() as unknown as {
      jupiterEvents: Array<{ tornado: { x: number; y: number; radius: number; coreRadius: number } }>;
      jupiterSharks: Array<{ id: string; targetId?: string; x: number; y: number; hp: number }>;
    };
    expect(snapshot.jupiterSharks.length).toBeGreaterThan(0);
    const shark = snapshot.jupiterSharks[0];
    expect(shark).toMatchObject({ targetId: "jupiter-target", hp: expect.any(Number) });
    expect(combat.getCombatant(shark.id)).toBeDefined();

    const targetBody = combat.getCombatant("jupiter-target")!;
    const beforeDistance = Math.hypot(shark.x - targetBody.x, shark.y - targetBody.y);
    combat.update(0.5, [owner, target]);
    snapshot = combat.getSnapshot() as typeof snapshot;
    const movedShark = snapshot.jupiterSharks.find((item) => item.id === shark.id)!;
    const afterDistance = Math.hypot(movedShark.x - targetBody.x, movedShark.y - targetBody.y);
    expect(afterDistance).toBeLessThan(beforeDistance);

    combat.applyDamage({ sourceId: "jupiter-owner", targetId: shark.id, weaponId: "pistol", damage: 999, knockback: { x: 0, y: -100 }, stun: 0.1, label: "Shark Hit" });
    combat.update(0.1, [owner, target]);
    expect((combat.getSnapshot() as typeof snapshot).jupiterSharks.find((item) => item.id === shark.id)).toBeUndefined();
    expect(combat.getCombatant(shark.id)).toBeUndefined();

    const tornado = (combat.getSnapshot() as typeof snapshot).jupiterEvents[0].tornado;
    combat.syncRemotePlayer({
      id: "jupiter-core-victim",
      name: "Core",
      color: "#ff6f91",
      x: tornado.x - DEFAULT_PHYSICS.width / 2,
      y: tornado.y - DEFAULT_PHYSICS.height / 2,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.1, [owner, target]);
    expect(combat.getCombatant("jupiter-core-victim")!.respawnTimer).toBeGreaterThan(0);
  });

  it("lets Moon and Judgment Day timers stack without cleaning each other up", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, id: "event-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Events", "#fff4a8");

    combat.equip("cross" as never);
    combat.useSecondary({ ownerId: "event-user", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.equip("moon" as never);
    combat.usePrimary({ ownerId: "event-user", player, aim: { x: 0, y: -1 }, now: 120, heldMs: 0, isNewPress: true });

    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "countdown" });
    expect(combat.getMoonEventState("event-user")).toMatchObject({ active: true });

    combat.update(60.2, [player]);

    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "active" });
    expect(combat.getMoonEventState("event-user")).toMatchObject({ active: false });
    expect(combat.getSnapshot().judgmentBeams.length).toBeGreaterThan(0);
  });

  it("activates Uranus as a one-use Space event with fall, flash, and moving ring state", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("uranus" as never);
    const player = { ...playerState, id: "uranus-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Uranus", "#ffd86a");

    const started = combat.usePrimary({ ownerId: "uranus-user", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "uranus", label: "Uranus" });

    let snapshot = combat.getSnapshot() as unknown as {
      uranusEvents: Array<{
        ownerId: string;
        timer: number;
        phase: "falling" | "flash" | "active";
        fallProgress: number;
        flashAlpha: number;
        ringSpeed: number;
        leftKillX: number;
        chomper: { x: number; y: number; radius: number; mouthOpen: number };
      }>;
    };
    expect(snapshot.uranusEvents).toHaveLength(1);
    expect(snapshot.uranusEvents[0]).toMatchObject({
      ownerId: "uranus-user",
      timer: expect.closeTo(60, 1),
      phase: "falling",
      fallProgress: 0,
    });
    expect(snapshot.uranusEvents[0].ringSpeed).toBeGreaterThan(80);

    combat.update(1.45, [player]);
    snapshot = combat.getSnapshot() as typeof snapshot;
    expect(snapshot.uranusEvents[0].phase).toBe("flash");
    expect(snapshot.uranusEvents[0].flashAlpha).toBeGreaterThan(0.1);

    combat.update(1.05, [player]);
    snapshot = combat.getSnapshot() as typeof snapshot;
    expect(snapshot.uranusEvents[0].phase).toBe("active");
    expect(snapshot.uranusEvents[0].flashAlpha).toBe(0);
    expect(snapshot.uranusEvents[0].leftKillX).toBeLessThan(player.x + player.width);
  });

  it("uses Uranus moving-ring and Ring Chomper hazards through normal respawn cleanup", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("uranus" as never);
    const player = { ...playerState, id: "uranus-owner", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Uranus", "#ffd86a");
    type UranusArenaSnapshot = {
      uranusEvents: Array<{
        phase: string;
        leftKillX: number;
        chomper: { x: number; y: number; radius: number; mouthOpen: number };
      }>;
    };

    combat.usePrimary({ ownerId: "uranus-owner", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(2.6, [player]);

    let event = (combat.getSnapshot() as unknown as UranusArenaSnapshot).uranusEvents[0];
    expect(event.phase).toBe("active");

    combat.syncRemotePlayer({
      id: "uranus-left-victim",
      name: "Behind",
      color: "#ff6f91",
      x: event.leftKillX - DEFAULT_PHYSICS.width - 8,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.1, [player]);
    expect(combat.getCombatant("uranus-left-victim")!.respawnTimer).toBeGreaterThan(0);

    event = (combat.getSnapshot() as unknown as UranusArenaSnapshot).uranusEvents[0];
    combat.syncRemotePlayer({
      id: "uranus-mouth-victim",
      name: "Mouth",
      color: "#ff6f91",
      x: event.chomper.x - DEFAULT_PHYSICS.width / 2,
      y: event.chomper.y - DEFAULT_PHYSICS.height / 2,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.1, [player]);
    expect(combat.getCombatant("uranus-mouth-victim")!.respawnTimer).toBeGreaterThan(0);

    combat.update(60.5, [player]);
    expect((combat.getSnapshot() as unknown as { uranusEvents: unknown[] }).uranusEvents).toHaveLength(0);
    expect(combat.getUranusEventState("uranus-owner")).toMatchObject({ active: false, timer: 0 });
  });

  it("respawns Uranus victims safely ahead of the Ring Chomper while the arena is scrolling", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("uranus" as never);
    const player = { ...playerState, id: "uranus-respawn-owner", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Uranus", "#ffd86a");

    combat.usePrimary({ ownerId: "uranus-respawn-owner", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(2.6, [player]);
    let event = (combat.getSnapshot() as unknown as {
      uranusEvents: Array<{ leftKillX: number; chomper: { x: number; y: number; radius: number } }>;
    }).uranusEvents[0];

    combat.syncRemotePlayer({
      id: "uranus-respawn-victim",
      name: "Victim",
      color: "#ff6f91",
      x: event.chomper.x - DEFAULT_PHYSICS.width / 2,
      y: event.chomper.y - DEFAULT_PHYSICS.height / 2,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.1, [player]);
    expect(combat.getCombatant("uranus-respawn-victim")!.respawnTimer).toBeGreaterThan(0);

    combat.update(2.1, [player]);
    event = (combat.getSnapshot() as unknown as {
      uranusEvents: Array<{ leftKillX: number; chomper: { x: number; y: number; radius: number } }>;
    }).uranusEvents[0];
    const respawned = combat.getCombatant("uranus-respawn-victim")!;
    expect(respawned.respawnTimer).toBe(0);
    expect(respawned.hp).toBe(respawned.maxHp);
    expect(respawned.invulnerable).toBeGreaterThan(0);
    expect(respawned.x).toBeGreaterThan(event.leftKillX + 220);
    expect(respawned.x).toBeGreaterThan(event.chomper.x + event.chomper.radius + 120);
  });

  it("activates Mars as a one-use Space event that extracts, releases, reforms, and cleans up AI clones", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("mars" as never);
    const owner = { ...playerState, id: "mars-user", x: -160, velocityX: 0, velocityY: 0 };
    const target = { ...playerState, id: "mars-target", x: 260, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Mars", "#ff7045");
    combat.syncRemotePlayer({
      id: "mars-target",
      name: "Target",
      color: "#ff6f91",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.setPlayerLoadout("mars-user", { frontStrap: "mars" as never, leftHand: "chainsaw" });
    combat.setPlayerLoadout("mars-target", { leftHand: "pistol", backStrap: "jupiter" as never });

    const started = combat.usePrimary({ ownerId: "mars-user", player: owner, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "mars", label: "Mars" });
    expect(combat.getMarsEventState("mars-user")).toMatchObject({
      active: true,
      phase: "rising",
      timer: expect.closeTo(60, 1),
    });

    let snapshot = combat.getSnapshot() as unknown as {
      marsEvents: Array<{ phase: string; beams: Array<{ targetId: string; progress: number }> }>;
      marsClones: Array<{
        id: string;
        targetId: string;
        color: string;
        phase: string;
        loadout: { leftHand?: string; backStrap?: string };
        strategyId: string;
      }>;
    };
    expect(snapshot.marsEvents).toHaveLength(1);
    expect(snapshot.marsClones).toHaveLength(0);

    combat.update(1.35, [owner, target]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.marsEvents[0].phase).toBe("beaming");
    expect(snapshot.marsEvents[0].beams.map((beam) => beam.targetId)).toEqual(expect.arrayContaining(["mars-user", "mars-target"]));

    combat.update(2.2, [owner, target]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.marsEvents[0].phase).toBe("active");
    expect(snapshot.marsClones).toHaveLength(2);
    const targetClone = snapshot.marsClones.find((clone) => clone.targetId === "mars-target")!;
    expect(targetClone).toMatchObject({
      color: "#ff6f91",
      phase: "hunting",
      loadout: { leftHand: "pistol", backStrap: "jupiter" },
      strategyId: "gun",
    });
    expect(combat.getCombatant(targetClone.id)).toBeDefined();

    const targetBody = combat.getCombatant("mars-target")!;
    const beforeDistance = Math.abs(combat.getCombatant(targetClone.id)!.x - targetBody.x);
    combat.update(0.6, [owner, target]);
    const afterDistance = Math.abs(combat.getCombatant(targetClone.id)!.x - targetBody.x);
    expect(afterDistance).toBeLessThan(beforeDistance);

    combat.applyDamage({
      sourceId: "mars-target",
      targetId: targetClone.id,
      weaponId: "pistol",
      damage: 999,
      knockback: { x: 0, y: -100 },
      stun: 0.1,
      label: "Clone Hit",
      skipHitLocationScaling: true,
      skipSourceScaling: true,
    });
    combat.update(0.1, [owner, target]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.marsClones.find((clone) => clone.id === targetClone.id)?.phase).toBe("reforming");
    expect(combat.getCombatant(targetClone.id)).toBeUndefined();

    combat.update(6.2, [owner, target]);
    expect(combat.getCombatant(targetClone.id)).toBeDefined();
    expect(((combat.getSnapshot() as unknown as typeof snapshot).marsClones.find((clone) => clone.id === targetClone.id)?.phase)).toBe("hunting");

    combat.update(60.5, [owner, target]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.marsEvents).toHaveLength(0);
    expect(snapshot.marsClones).toHaveLength(0);
    expect(combat.getCombatant(targetClone.id)).toBeUndefined();
  });

  it("activates Neptune as a one-use Space boss event with intro crush, flood, attacks, and killable creatures", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("neptune" as never);
    const owner = { ...playerState, id: "neptune-user", x: 0, velocityX: 0, velocityY: 0 };
    const victim = { ...playerState, id: "neptune-victim", x: 260, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Neptune", "#5ad7ff");
    combat.syncRemotePlayer({
      id: "neptune-victim",
      name: "Victim",
      color: "#ff6f91",
      x: victim.x,
      y: victim.y,
      width: victim.width,
      height: victim.height,
      velocityX: victim.velocityX,
      velocityY: victim.velocityY,
    });

    const started = combat.usePrimary({ ownerId: "neptune-user", player: owner, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    expect(started).toMatchObject({ kind: "utility", weaponId: "neptune", label: "Neptune" });

    type NeptuneSnapshot = {
      neptuneEvents: Array<{
        ownerId: string;
        phase: string;
        timer: number;
        currentAttack: string;
        attackHistory: string[];
        roarAlpha: number;
        body: { x: number; y: number; radius: number };
        leftHand: { x: number; y: number; radius: number; warningAlpha: number };
        flood: { active: boolean; level: number; alpha: number; suck: number };
        tilt: { active: boolean; amount: number; direction: -1 | 1; warningAlpha: number };
        laser: {
          active: boolean;
          warningAlpha: number;
          firing: boolean;
          fromX: number;
          fromY: number;
          leftFromX: number;
          leftFromY: number;
          rightFromX: number;
          rightFromY: number;
          toX: number;
          toY: number;
          width: number;
        };
      }>;
      neptuneCreatures: Array<{ id: string; kind: "urchin" | "octopus" | "giant-shark" | "clown-fish"; hp: number; maxHp: number; x: number; y: number; spawnProgress: number }>;
      neptunePellets: Array<{ id: string; radius: number; damage: number; source?: string }>;
    };
    let snapshot = combat.getSnapshot() as unknown as NeptuneSnapshot;
    expect(snapshot.neptuneEvents).toHaveLength(1);
    expect(snapshot.neptuneEvents[0]).toMatchObject({
      ownerId: "neptune-user",
      phase: "intro",
      timer: expect.closeTo(60, 1),
    });
    expect(snapshot.neptuneEvents[0].body.radius).toBeGreaterThan(220);
    expect(snapshot.neptuneEvents[0].leftHand.radius).toBeGreaterThan(90);

    combat.syncRemotePlayer({
      id: "neptune-hand-victim",
      name: "Hand",
      color: "#ff6f91",
      x: snapshot.neptuneEvents[0].leftHand.x - DEFAULT_PHYSICS.width / 2,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.update(0.9, [owner, victim]);
    expect(combat.getCombatant("neptune-hand-victim")!.respawnTimer).toBeGreaterThan(0);

    combat.update(3.25, [owner, victim]);
    snapshot = combat.getSnapshot() as unknown as NeptuneSnapshot;
    expect(snapshot.neptuneEvents[0].phase).toBe("active");
    expect(snapshot.neptuneEvents[0].currentAttack).toBe("flood");
    expect(snapshot.neptuneEvents[0].flood.active).toBe(true);
    expect(snapshot.neptuneEvents[0].flood.level).toBeLessThan(DEFAULT_PHYSICS.groundY - 500);
    expect(combat.getCombatant("neptune-victim")!.velocityY).toBeLessThan(0);

    for (let index = 0; index < 34; index += 1) {
      combat.update(0.5, [owner, victim]);
    }
    snapshot = combat.getSnapshot() as unknown as NeptuneSnapshot;
    expect(snapshot.neptuneEvents[0].attackHistory).toEqual(expect.arrayContaining(["flood", "slam", "laser", "summon", "rain"]));
    expect(snapshot.neptuneEvents[0].tilt.direction).toBeDefined();
    expect(snapshot.neptuneEvents[0].laser.width).toBeGreaterThanOrEqual(22);
    expect(snapshot.neptuneEvents[0].laser.leftFromX).toBeLessThan(snapshot.neptuneEvents[0].body.x);
    expect(snapshot.neptuneEvents[0].laser.rightFromX).toBeGreaterThan(snapshot.neptuneEvents[0].body.x);
    expect(snapshot.neptuneEvents[0].laser.fromX).toBeCloseTo((snapshot.neptuneEvents[0].laser.leftFromX + snapshot.neptuneEvents[0].laser.rightFromX) / 2, 1);
    expect(snapshot.neptuneCreatures.map((creature) => creature.kind)).toEqual(expect.arrayContaining(["urchin", "octopus", "giant-shark", "clown-fish"]));
    expect(snapshot.neptuneCreatures.every((creature) => creature.spawnProgress >= 0 && creature.spawnProgress <= 1)).toBe(true);
    expect(snapshot.neptunePellets.some((pellet) => pellet.radius >= 8 && pellet.damage > 0)).toBe(true);
    expect(snapshot.neptunePellets.some((pellet) => pellet.source === "rain" && pellet.radius >= 18 && pellet.damage >= 14)).toBe(true);

    const creature = snapshot.neptuneCreatures[0];
    expect(combat.getCombatant(creature.id)).toBeDefined();
    combat.applyDamage({ sourceId: "neptune-victim", targetId: creature.id, weaponId: "pistol", damage: 999, knockback: { x: 0, y: -100 }, stun: 0.1, label: "Sea Hit" });
    combat.update(0.1, [owner, victim]);
    expect((combat.getSnapshot() as unknown as NeptuneSnapshot).neptuneCreatures.find((item) => item.id === creature.id)).toBeUndefined();
    expect(combat.getCombatant(creature.id)).toBeUndefined();
  });

  it("keeps Neptune readable with a flood opener but varies the later attack order by event seed", () => {
    const histories = [100, 333, 777].map((now, index) => {
      const combat = new CombatSystem({ mode: "network" });
      combat.start(createDefaultInventory());
      combat.equip("neptune" as never);
      const owner = { ...playerState, id: `neptune-seed-${index}`, x: index * 120, velocityX: 0, velocityY: 0 };
      combat.syncLocalPlayer(owner, "Neptune", "#5ad7ff");
      combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now, heldMs: 0, isNewPress: true });
      combat.update(4.05, [owner]);
      for (let tick = 0; tick < 40; tick += 1) {
        combat.update(0.5, [owner]);
      }
      const [event] = (combat.getSnapshot() as unknown as { neptuneEvents: Array<{ attackHistory: string[] }> }).neptuneEvents;
      return event.attackHistory.slice(0, 4);
    });

    expect(histories.every((history) => history[0] === "flood")).toBe(true);
    expect(histories.every((history) => new Set(history).size >= 4)).toBe(true);
    expect(new Set(histories.map((history) => history.slice(1).join(","))).size).toBeGreaterThan(1);
  });

  it("summons Neptune sea creatures from seeded random playable positions with pop-up progress", () => {
    const spawnPositionsFor = (now: number) => {
      const combat = new CombatSystem({ mode: "network" });
      combat.start(createDefaultInventory());
      combat.equip("neptune" as never);
      const owner = { ...playerState, id: `neptune-summon-${now}`, x: 0, velocityX: 0, velocityY: 0 };
      combat.syncLocalPlayer(owner, "Neptune", "#5ad7ff");
      combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now, heldMs: 0, isNewPress: true });
      combat.update(4.05, [owner]);
      let creatures: Array<{ kind: string; x: number; y: number; spawnProgress: number }> = [];
      for (let tick = 0; tick < 180 && creatures.length < 4; tick += 1) {
        combat.update(0.1, [owner]);
        creatures = (combat.getSnapshot() as unknown as { neptuneCreatures: typeof creatures }).neptuneCreatures;
      }
      return creatures
        .map((creature) => ({
          kind: creature.kind,
          x: Math.round(creature.x),
          y: Math.round(creature.y),
          spawnProgress: creature.spawnProgress,
        }))
        .sort((left, right) => left.kind.localeCompare(right.kind));
    };

    const first = spawnPositionsFor(501);
    const second = spawnPositionsFor(902);

    expect(first.map((creature) => creature.kind)).toEqual(["clown-fish", "giant-shark", "octopus", "urchin"]);
    expect(first.map((creature) => creature.x)).not.toEqual(second.map((creature) => creature.x));
    expect(new Set(first.map((creature) => Math.round(creature.x / 120))).size).toBeGreaterThanOrEqual(3);
    expect(first.every((creature) => creature.x > DEFAULT_PHYSICS.platformLeft && creature.x < DEFAULT_PHYSICS.platformRight)).toBe(true);
    expect(first.every((creature) => creature.spawnProgress >= 0 && creature.spawnProgress <= 1)).toBe(true);
  });

  it("starts Neptune laser behind its target and chases forward before it becomes lethal", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("neptune" as never);
    const owner = { ...playerState, id: "laser-owner", x: 120, velocityX: 260, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Laser Owner", "#5ad7ff");
    combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now: 444, heldMs: 0, isNewPress: true });
    combat.update(4.05, [owner]);

    type LaserSnapshot = {
      neptuneEvents: Array<{
        currentAttack: string;
        body: { x: number; y: number; radius: number };
        laser: {
          fromX: number;
          fromY: number;
          leftFromX: number;
          leftFromY: number;
          rightFromX: number;
          rightFromY: number;
          toX: number;
          toY: number;
          warningAlpha: number;
          firing: boolean;
        };
      }>;
    };
    let snapshot = combat.getSnapshot() as unknown as LaserSnapshot;
    for (let tick = 0; tick < 90 && snapshot.neptuneEvents[0]?.currentAttack !== "laser"; tick += 1) {
      combat.update(0.1, [owner]);
      snapshot = combat.getSnapshot() as unknown as LaserSnapshot;
    }

    expect(snapshot.neptuneEvents[0].currentAttack).toBe("laser");
    const targetCenterX = owner.x + owner.width / 2;
    const firstX = snapshot.neptuneEvents[0].laser.toX;
    expect(snapshot.neptuneEvents[0].laser.warningAlpha).toBeGreaterThan(0);
    expect(snapshot.neptuneEvents[0].laser.firing).toBe(false);
    expect(firstX).toBeLessThan(targetCenterX - 80);
    expect(snapshot.neptuneEvents[0].laser.leftFromX).toBeLessThan(snapshot.neptuneEvents[0].body.x);
    expect(snapshot.neptuneEvents[0].laser.rightFromX).toBeGreaterThan(snapshot.neptuneEvents[0].body.x);
    expect(snapshot.neptuneEvents[0].laser.leftFromY).toBeLessThan(snapshot.neptuneEvents[0].body.y);
    expect(snapshot.neptuneEvents[0].laser.rightFromY).toBeLessThan(snapshot.neptuneEvents[0].body.y);
    expect(snapshot.neptuneEvents[0].laser.fromX).toBeCloseTo((snapshot.neptuneEvents[0].laser.leftFromX + snapshot.neptuneEvents[0].laser.rightFromX) / 2, 1);

    combat.update(0.55, [owner]);
    snapshot = combat.getSnapshot() as unknown as LaserSnapshot;
    expect(snapshot.neptuneEvents[0].laser.toX).toBeGreaterThan(firstX);
    expect(Math.abs(snapshot.neptuneEvents[0].laser.toX - targetCenterX)).toBeLessThan(Math.abs(firstX - targetCenterX));
    expect(combat.getCombatant(owner.id)?.respawnTimer ?? 0).toBe(0);
  });

  it("holds Neptune hand-slam tilt dramatically and keeps applying slope force", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("neptune" as never);
    const owner = { ...playerState, id: "slam-owner", x: -40, velocityX: 0, velocityY: 0 };
    const victim = { ...playerState, id: "slam-victim", x: 180, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Slam", "#5ad7ff");
    combat.syncRemotePlayer({
      id: victim.id,
      name: "Victim",
      color: "#ff6f91",
      x: victim.x,
      y: victim.y,
      width: victim.width,
      height: victim.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now: 660, heldMs: 0, isNewPress: true });
    combat.update(4.05, [owner, victim]);
    let snapshot = combat.getSnapshot() as unknown as { neptuneEvents: Array<{ currentAttack: string; attackTimer: number; tilt: { active: boolean; amount: number; direction: -1 | 1 } }> };
    for (let tick = 0; tick < 120 && snapshot.neptuneEvents[0]?.currentAttack !== "slam"; tick += 1) {
      combat.update(0.1, [owner, victim]);
      snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    }

    expect(snapshot.neptuneEvents[0].currentAttack).toBe("slam");
    combat.update(2.45, [owner, victim]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.neptuneEvents[0].currentAttack).toBe("slam");
    expect(snapshot.neptuneEvents[0].tilt.active).toBe(true);
    expect(Math.abs(snapshot.neptuneEvents[0].tilt.amount)).toBeGreaterThan(1.45);
    const leftGround = neptuneTiltedGroundY(DEFAULT_PHYSICS.groundY, DEFAULT_PHYSICS.platformLeft + 220, snapshot.neptuneEvents[0].tilt.direction, snapshot.neptuneEvents[0].tilt.amount);
    const rightGround = neptuneTiltedGroundY(DEFAULT_PHYSICS.groundY, DEFAULT_PHYSICS.platformRight - 220, snapshot.neptuneEvents[0].tilt.direction, snapshot.neptuneEvents[0].tilt.amount);
    expect(Math.abs(leftGround - DEFAULT_PHYSICS.groundY)).toBeGreaterThan(24);
    expect(Math.abs(rightGround - DEFAULT_PHYSICS.groundY)).toBeGreaterThan(24);
    expect(Math.sign(rightGround - leftGround)).toBe(snapshot.neptuneEvents[0].tilt.direction);
    expect(Math.sign(combat.getCombatant(victim.id)!.velocityX)).toBe(snapshot.neptuneEvents[0].tilt.direction);
    expect(Math.abs(combat.getCombatant(victim.id)!.velocityX)).toBeGreaterThan(250);
  });

  it("lets an empty Grabber strap autonomously punch nearby valid targets without a new input", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "grabber-user", x: 0, velocityX: 0, velocityY: 0 };
    const target = { ...playerState, id: "grabber-target", x: 74, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Grabber", "#18dff5");
    combat.syncRemotePlayer({
      id: target.id,
      name: "Target",
      color: "#ff6f91",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.setPlayerLoadout(owner.id, { frontStrap: "grabber" as never });

    combat.update(0.05, [owner, target]);

    const windupTarget = combat.getCombatant(target.id)!;
    const runtime = combat.getWeaponRuntimeState("grabber" as never, owner.id) as unknown as {
      grabberEquipped: boolean;
      grabberHolding?: string;
      grabberCooldown: number;
      grabberReachActive: boolean;
      grabberPunchPhase?: string;
      grabberPunchProgress?: number;
      grabberPunchTargetX?: number;
      grabberPunchTargetY?: number;
    };
    expect(windupTarget.hp).toBe(100);
    expect(runtime).toMatchObject({
      grabberEquipped: true,
      grabberHolding: undefined,
      grabberReachActive: true,
      grabberPunchPhase: "windup",
    });
    expect(runtime.grabberPunchProgress).toBeGreaterThan(0);
    expect(runtime.grabberPunchTargetX).toBeGreaterThan(owner.x);

    combat.update(0.18, [owner, target]);

    const hitTarget = combat.getCombatant(target.id)!;
    const hitRuntime = combat.getWeaponRuntimeState("grabber" as never, owner.id) as unknown as typeof runtime;
    expect(hitTarget.hp).toBeLessThan(100);
    expect(hitTarget.velocityX).toBeGreaterThan(400);
    expect(hitRuntime.grabberCooldown).toBeGreaterThan(0.5);
    expect(["hit", "retract", "cooldown"]).toContain(hitRuntime.grabberPunchPhase);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "GRABBER PUNCH")).toBe(true);
  });

  it("uses Trident as a mouse-aimed melee weapon that transforms targets for forty seconds", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("trident" as never);
    const owner = { ...playerState, id: "trident-user", x: 0, velocityX: 0, velocityY: 0 };
    const target = { ...playerState, id: "trident-target", x: 88, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Trident", "#5ad7ff");
    combat.syncRemotePlayer({
      id: target.id,
      name: "Target",
      color: "#ff6f91",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      velocityX: 0,
      velocityY: 0,
    });

    const result = combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 120, heldMs: 0, isNewPress: true });
    expect(result).toMatchObject({ kind: "hitbox", weaponId: "trident" });
    combat.update(0.08, [owner, target]);

    const hitTarget = combat.getCombatant(target.id)!;
    const formStatus = hitTarget.statuses.find((status) => ["pufferForm", "octopusForm", "goldfishForm"].includes(status.id));
    expect(hitTarget.hp).toBeLessThan(100);
    expect(formStatus?.duration).toBeCloseTo(40, 0);
    expect((combat as unknown as { getTridentTransformationState(id: string): { form: string; timer: number } | undefined }).getTridentTransformationState(target.id)?.form).toBeDefined();

    combat.update(40.2, [owner, target]);
    expect((combat as unknown as { getTridentTransformationState(id: string): unknown | undefined }).getTridentTransformationState(target.id)).toBeUndefined();
    expect(combat.getCombatant(target.id)?.statuses.some((status) => ["pufferForm", "octopusForm", "goldfishForm"].includes(status.id))).toBe(false);
  });

  it("throws Trident as one physical item that must be picked back up manually", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("trident" as never);
    const owner = { ...playerState, id: "trident-thrower", x: -120, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Thrower", "#5ad7ff");

    const thrown = combat.useSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: -0.08 }, now: 240, heldMs: 0, isNewPress: true });
    expect(thrown).toMatchObject({ kind: "fired", weaponId: "trident", label: "Throw" });
    expect(combat.getPlayerInventory().weaponInventory).not.toContain("trident");
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === ("trident" as never))).toHaveLength(1);
    expect(combat.getSnapshot().droppedWeapons.filter((weapon) => weapon.weaponId === ("trident" as never))).toHaveLength(0);

    for (let tick = 0; tick < 24; tick += 1) {
      combat.update(0.1, [owner]);
    }

    const dropped = combat.getSnapshot().droppedWeapons.find((weapon) => weapon.weaponId === ("trident" as never));
    expect(dropped).toMatchObject({ weaponId: "trident", pickupable: true });
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === ("trident" as never))).toHaveLength(0);

    owner.x = dropped!.x - owner.width / 2;
    owner.y = dropped!.y - owner.height / 2;
    expect(combat.pickUpNearest(owner, 90)).toBe("trident");
    expect(combat.getPlayerInventory().weaponInventory).toContain("trident");
    expect(combat.getPlayerInventory().equippedWeapon).toBe("trident");
  });

  it("runs Trident flood super separately from normal attacks and supports transformed creature abilities", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("trident" as never);
    const owner = { ...playerState, id: "trident-flood-user", x: 0, velocityX: 0, velocityY: 0 };
    const victim = { ...playerState, id: "trident-flood-victim", x: 90, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Flood", "#5ad7ff");
    combat.syncRemotePlayer({
      id: victim.id,
      name: "Victim",
      color: "#ff6f91",
      x: victim.x,
      y: victim.y,
      width: victim.width,
      height: victim.height,
      velocityX: 0,
      velocityY: 0,
    });
    const tridentApi = combat as unknown as {
      useTridentFlood(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
      transformWithTrident(targetId: string, sourceId: string, form: "puffer" | "goldfish" | "octopus"): boolean;
      getTridentTransformationState(id: string): { form: "puffer" | "goldfish" | "octopus"; timer: number; heldTargetIds?: string[] } | undefined;
    };

    const flood = tridentApi.useTridentFlood({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now: 300, heldMs: 0, isNewPress: true });
    expect(flood).toMatchObject({ kind: "utility", weaponId: "trident", label: "Trident Flood" });
    let snapshot = combat.getSnapshot() as unknown as { tridentFloods: Array<{ ownerId: string; timer: number; duration: number; level: number; alpha: number; shark: { x: number; y: number; hp: number } }> };
    expect(snapshot.tridentFloods).toHaveLength(1);
    expect(snapshot.tridentFloods[0]).toMatchObject({ ownerId: owner.id, duration: 60, timer: expect.closeTo(60, 1) });
    combat.update(1.2, [owner, victim]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.tridentFloods[0].level).toBeLessThan(DEFAULT_PHYSICS.groundY - 500);
    expect(snapshot.tridentFloods[0].shark.hp).toBeGreaterThan(0);
    expect(Math.abs(combat.getCombatant(victim.id)!.velocityY)).toBeGreaterThan(0);
    expect(tridentApi.useTridentFlood({ ownerId: owner.id, player: owner, aim: { x: 0, y: -1 }, now: 302, heldMs: 0, isNewPress: true }).kind).toBe("blocked");

    expect(tridentApi.transformWithTrident(owner.id, victim.id, "puffer")).toBe(true);
    const puffer = combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 310, heldMs: 0, isNewPress: true });
    expect(puffer.label).toBe("Puffer Inflate");
    expect(combat.getCombatant(victim.id)!.statuses.some((status) => status.id === "poison" || status.id === "spikePoison")).toBe(true);

    combat.getPlayerInventory().cooldowns.trident = 0;
    expect(tridentApi.transformWithTrident(owner.id, victim.id, "goldfish")).toBe(true);
    const spray = combat.useSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: -0.2 }, now: 320, heldMs: 0, isNewPress: true });
    expect(spray.label).toBe("Goldfish Droplets");
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === ("trident" as never) && projectile.label.includes("Droplet")).length).toBeGreaterThanOrEqual(5);

    combat.getPlayerInventory().cooldowns.trident = 0;
    expect(tridentApi.transformWithTrident(owner.id, victim.id, "octopus")).toBe(true);
    const grab = combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 330, heldMs: 0, isNewPress: true });
    expect(grab.label).toBe("Octopus Grab");
    expect(tridentApi.getTridentTransformationState(owner.id)?.heldTargetIds).toContain(victim.id);
    combat.getPlayerInventory().cooldowns.trident = 0;
    const throwAll = combat.useSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: -0.5 }, now: 331, heldMs: 0, isNewPress: true });
    expect(throwAll.label).toBe("Octopus Throw");
    expect(Math.abs(combat.getCombatant(victim.id)!.velocityX)).toBeGreaterThan(700);
    expect(tridentApi.getTridentTransformationState(owner.id)?.heldTargetIds).toHaveLength(0);
  });

  it("exposes Trident creature form state for real transformed player rendering", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "trident-visual-owner", x: 0, velocityX: 0, velocityY: 0 };
    const target = { ...playerState, id: "trident-visual-target", x: 82, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Owner", "#5ad7ff");
    combat.syncRemotePlayer({
      id: target.id,
      name: "Target",
      color: "#ff6f91",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      velocityX: 0,
      velocityY: 0,
    });

    expect(combat.transformWithTrident(target.id, owner.id, "puffer")).toBe(true);

    let snapshot = combat.getSnapshot() as unknown as {
      tridentTransformations: Array<{
        ownerId: string;
        sourceId: string;
        form: "puffer" | "goldfish" | "octopus";
        timer: number;
        duration: number;
        inflateTimer: number;
        heldTargetIds: string[];
      }>;
    };
    expect(snapshot.tridentTransformations).toEqual([
      expect.objectContaining({
        ownerId: target.id,
        sourceId: owner.id,
        form: "puffer",
        duration: 40,
      }),
    ]);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "TRANSFORM")).toBe(true);

    combat.usePrimary({ ownerId: target.id, player: target, aim: { x: 1, y: 0 }, now: 420, heldMs: 0, isNewPress: true });
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.tridentTransformations[0].inflateTimer).toBeGreaterThan(0);

    combat.update(40.2, [owner, target]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.tridentTransformations).toHaveLength(0);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "REVERT")).toBe(true);
  });

  it("makes SUPER BOMB a strap ability that only works with an empty hand and detonates the mouse point", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "bomb-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Bomb", "#18dff5");
    combat.setPlayerLoadout(owner.id, { frontStrap: "super-bomb" as never });
    const near = combat.spawnTrainingDummy({ x: 120, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });
    const far = combat.syncRemotePlayer({
      id: "far-bomb-target",
      name: "Far",
      color: "#ff6f91",
      x: 400,
      y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      velocityX: 0,
      velocityY: 0,
    });
    const api = combat as unknown as {
      useSuperBombPrimary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }, target: { x: number; y: number }): { kind: string; weaponId: string; label: string };
      getSuperBombRuntime(ownerId: string): { usable: boolean; disabledReason?: string; superCooldown: number; weaknessStacks: number; missingLimbs: unknown[] };
    };

    expect(api.getSuperBombRuntime(owner.id)).toMatchObject({ usable: true, superCooldown: 0, weaknessStacks: 0 });
    const result = api.useSuperBombPrimary({
      ownerId: owner.id,
      player: owner,
      aim: { x: 1, y: -0.15 },
      now: 500,
      heldMs: 0,
      isNewPress: true,
    }, { x: near.x + near.width / 2, y: near.y + near.height / 2 });

    expect(result).toMatchObject({ kind: "utility", weaponId: "super-bomb", label: "SUPER BOMB" });
    expect(combat.getCombatant(near.id)!.hp).toBeLessThan(combat.getCombatant(far.id)!.hp);
    expect(combat.getCombatant(near.id)!.velocityY).toBeLessThan(-200);
    expect(Math.abs(owner.velocityX) + Math.abs(owner.velocityY)).toBeGreaterThan(100);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "explosion" && effect.label === "SUPER BOMB")).toBe(true);

    combat.setPlayerLoadout(owner.id, { frontStrap: "super-bomb" as never, rightHand: "pistol" });
    expect(api.getSuperBombRuntime(owner.id)).toMatchObject({ usable: false, disabledReason: "hand occupied" });
    const blocked = api.useSuperBombPrimary({
      ownerId: owner.id,
      player: owner,
      aim: { x: 1, y: 0 },
      now: 600,
      heldMs: 0,
      isNewPress: true,
    }, { x: near.x, y: near.y });
    expect(blocked).toMatchObject({ kind: "blocked", label: "Empty hand required" });
  });

  it("throws SUPER BOMB limb bombs and regrows missing limbs procedurally", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "limb-bomb-user", x: 0, velocityX: 0, velocityY: 0 };
    const target = combat.spawnTrainingDummy({ x: 260, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });
    combat.syncLocalPlayer(owner, "Bomb", "#18dff5");
    combat.setPlayerLoadout(owner.id, { backStrap: "super-bomb" as never });
    const api = combat as unknown as {
      useSuperBombSecondary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
      getSuperBombRuntime(ownerId: string): { missingLimbs: Array<{ limb: "rightArm" | "leftLeg" | "rightLeg"; timer: number; duration: number; progress: number }>; limbBombCooldown: number };
    };

    const result = api.useSuperBombSecondary({
      ownerId: owner.id,
      player: owner,
      aim: { x: 1, y: -0.05 },
      now: 700,
      heldMs: 0,
      isNewPress: true,
    });

    expect(result).toMatchObject({ kind: "fired", weaponId: "super-bomb", label: "Limb Bomb" });
    const runtime = api.getSuperBombRuntime(owner.id);
    expect(runtime.missingLimbs).toHaveLength(1);
    expect(["rightArm", "leftLeg", "rightLeg"]).toContain(runtime.missingLimbs[0].limb);
    expect(runtime.missingLimbs[0].progress).toBe(0);
    expect(combat.getSnapshot().projectiles.some((projectile) => projectile.weaponId === ("super-bomb" as never) && projectile.label === "Limb Bomb")).toBe(true);

    for (let tick = 0; tick < 10; tick += 1) {
      combat.update(0.12, [owner]);
    }
    expect(combat.getCombatant(target.id)!.hp).toBeLessThan(100);
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "LIMB BOMB")).toBe(true);

    combat.update(6, [owner]);
    expect(api.getSuperBombRuntime(owner.id).missingLimbs[0]?.progress ?? 1).toBeGreaterThan(0.4);
    combat.update(10, [owner]);
    expect(api.getSuperBombRuntime(owner.id).missingLimbs).toHaveLength(0);
  });

  it("runs SUPER BOMB full-body explosion, poison splatters, reformation, cooldown, and weakening", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "super-bomb-user", x: 0, velocityX: 0, velocityY: 0 };
    const victim = combat.spawnTrainingDummy({ x: 190, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });
    combat.syncLocalPlayer(owner, "Bomb", "#18dff5");
    combat.setPlayerLoadout(owner.id, { frontStrap: "super-bomb" as never });
    const api = combat as unknown as {
      useSuperBombSuper(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
      getSuperBombRuntime(ownerId: string): { superCooldown: number; weaknessStacks: number; reforming: boolean; reformTimer: number };
    };

    const result = api.useSuperBombSuper({
      ownerId: owner.id,
      player: owner,
      aim: { x: 0, y: -1 },
      now: 900,
      heldMs: 0,
      isNewPress: true,
    });

    expect(result).toMatchObject({ kind: "utility", weaponId: "super-bomb", label: "FULL BODY EXPLOSION" });
    expect(combat.getCombatant(victim.id)!.hp).toBeLessThan(50);
    let snapshot = combat.getSnapshot() as unknown as {
      superBombSplatters: Array<{ ownerId: string; x: number; y: number; returning: boolean; age: number }>;
      superBombReformations: Array<{ ownerId: string; timer: number; duration: number; progress: number }>;
    };
    expect(snapshot.superBombSplatters.length).toBeGreaterThanOrEqual(18);
    expect(snapshot.superBombReformations).toHaveLength(1);
    expect(api.getSuperBombRuntime(owner.id)).toMatchObject({ superCooldown: 90, weaknessStacks: 1, reforming: true });
    expect(combat.getCombatant(owner.id)?.statuses.some((status) => status.id === ("superBombReforming" as never))).toBe(true);

    victim.x = snapshot.superBombSplatters[0].x - victim.width / 2;
    victim.y = snapshot.superBombSplatters[0].y - victim.height / 2;
    const splatterHpBefore = combat.getCombatant(victim.id)!.hp;
    combat.update(0.25, [owner]);
    expect(combat.getCombatant(victim.id)?.statuses.some((status) => status.id === ("superBombPatchPoison" as never))).toBe(true);
    combat.update(0.6, [owner]);
    expect(combat.getCombatant(victim.id)!.hp).toBeLessThan(splatterHpBefore);

    combat.update(10.2, [owner]);
    snapshot = combat.getSnapshot() as unknown as typeof snapshot;
    expect(snapshot.superBombSplatters).toHaveLength(0);
    expect(snapshot.superBombReformations).toHaveLength(0);
    expect(api.getSuperBombRuntime(owner.id).reforming).toBe(false);
    expect(api.getSuperBombRuntime(owner.id).superCooldown).toBeLessThan(90);
    expect(api.getSuperBombRuntime(owner.id).weaknessStacks).toBe(1);
  });

  it("uses Clown Kit as a head item with one open hand for finger-gun knockback", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "clown-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Clown", "#18dff5");
    combat.setPlayerLoadout(owner.id, { head: "clown-kit" as never } as never);
    const api = combat as unknown as {
      getClownKitRuntime(ownerId: string): { equipped: boolean; usable: boolean; disabledReason?: string; backBalloon: boolean; glideGravityScale: number; balloonCount: number };
      useClownKitPrimary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
    };

    combat.setPlayerLoadout(owner.id, { head: "clown-kit" as never, rightHand: "pistol" } as never);
    expect(api.getClownKitRuntime(owner.id)).toMatchObject({ equipped: true, usable: true, backBalloon: true, balloonCount: 0 });
    expect(api.getClownKitRuntime(owner.id).glideGravityScale).toBeLessThan(1);
    const fired = api.useClownKitPrimary({
      ownerId: owner.id,
      player: owner,
      aim: { x: 1, y: -0.16 },
      now: 100,
      heldMs: 0,
      isNewPress: true,
    });

    expect(fired).toMatchObject({ kind: "fired", weaponId: "clown-kit", label: "Finger Gun" });
    const bullet = combat.getSnapshot().projectiles.find((projectile) => projectile.weaponId === ("clown-kit" as never))!;
    expect(bullet.damage).toBe(2);
    expect(Math.abs(bullet.knockback.x)).toBeGreaterThanOrEqual(1200);
    expect(bullet.knockback.y).toBeLessThanOrEqual(-850);
    expect(bullet.radius).toBeLessThanOrEqual(8);

    combat.setPlayerLoadout(owner.id, { head: "clown-kit" as never, leftHand: "pistol", rightHand: "knife" } as never);
    expect(api.getClownKitRuntime(owner.id)).toMatchObject({ usable: false, disabledReason: "hand occupied" });
    expect(api.useClownKitPrimary({
      ownerId: owner.id,
      player: owner,
      aim: { x: 1, y: 0 },
      now: 120,
      heldMs: 0,
      isNewPress: true,
    })).toMatchObject({ kind: "blocked", label: "Empty hand required" });
  });

  it("morphs Clown Kit balloons into flower, dog, and monkey tools with cleanup", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "clown-balloon-user", x: 0, velocityX: 0, velocityY: 0 };
    const victim = { ...playerState, id: "clown-balloon-victim", x: 92, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Clown", "#18dff5");
    combat.syncRemotePlayer({
      id: victim.id,
      name: "Target",
      color: "#ff6f91",
      x: victim.x,
      y: victim.y,
      width: victim.width,
      height: victim.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.setPlayerLoadout(owner.id, { head: "clown-kit" as never } as never);
    const api = combat as unknown as {
      getPlayerLoadout(id: string): { rightHand?: string } | undefined;
      useClownKitSecondary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
    };
    type ClownSnapshot = {
      clownBalloons: Array<{ id: string; ownerId: string; form: "flower" | "dog"; timer: number; duration: number; targetId?: string }>;
      clownMonkeys: Array<{ id: string; ownerId: string; timer: number; duration: number; stolenItem?: string; targetId?: string }>;
      droppedWeapons: Array<{ weaponId: string }>;
    };

    expect(api.useClownKitSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 200, heldMs: 350, isNewPress: true })).toMatchObject({
      kind: "utility",
      weaponId: "clown-kit",
      label: "Balloon Flower",
    });
    let snapshot = combat.getSnapshot() as unknown as ClownSnapshot;
    expect(snapshot.clownBalloons).toEqual([expect.objectContaining({ ownerId: owner.id, form: "flower", duration: 30 })]);
    combat.update(0.45, [owner, victim]);
    expect(combat.getCombatant(victim.id)?.statuses.some((status) => status.id === ("clownStun" as never))).toBe(true);

    combat.getPlayerInventory().cooldowns["clown-kit"] = 0;
    const dogHpBefore = combat.getCombatant(victim.id)!.hp;
    expect(api.useClownKitSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 900, heldMs: 350, isNewPress: true })).toMatchObject({
      label: "Balloon Dog",
    });
    for (let tick = 0; tick < 12; tick += 1) {
      combat.update(0.18, [owner, victim]);
    }
    expect(combat.getCombatant(victim.id)!.hp).toBeLessThan(dogHpBefore);
    expect(combat.getCombatant(victim.id)?.statuses.some((status) => status.id === ("clownDistortion" as never))).toBe(true);

    combat.getPlayerInventory().cooldowns["clown-kit"] = 0;
    combat.setPlayerLoadout(victim.id, { rightHand: "pistol" } as never);
    expect(api.useClownKitSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 1500, heldMs: 350, isNewPress: true })).toMatchObject({
      label: "Mini Monkeys",
    });
    for (let tick = 0; tick < 22; tick += 1) {
      combat.update(0.14, [owner, victim]);
    }
    snapshot = combat.getSnapshot() as unknown as ClownSnapshot;
    expect(snapshot.clownMonkeys.some((monkey) => monkey.stolenItem === "pistol" && monkey.targetId === victim.id)).toBe(true);
    expect(api.getPlayerLoadout(victim.id)?.rightHand).toBeUndefined();

    combat.update(30.5, [owner, victim]);
    snapshot = combat.getSnapshot() as unknown as ClownSnapshot;
    expect(snapshot.clownMonkeys).toHaveLength(0);
    expect(snapshot.clownBalloons).toHaveLength(0);
    expect(snapshot.droppedWeapons.some((weapon) => weapon.weaponId === "pistol")).toBe(true);
  });

  it("does not build a Clown Kit comedy stage or lock movement when both mouse buttons are held", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "clown-no-stage-user", x: 0, velocityX: 0, velocityY: 0 };
    const victim = { ...playerState, id: "clown-no-stage-victim", x: 132, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(owner, "Clown", "#18dff5");
    combat.syncRemotePlayer({
      id: victim.id,
      name: "Target",
      color: "#ff6f91",
      x: victim.x,
      y: victim.y,
      width: victim.width,
      height: victim.height,
      velocityX: 0,
      velocityY: 0,
    });
    combat.setPlayerLoadout(owner.id, { head: "clown-kit" as never } as never);
    const api = combat as unknown as {
      getClownKitRuntime(ownerId: string): { activeStage?: boolean; stageCooldown?: number; backBalloon: boolean };
      useClownKitPrimary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
      useClownKitSecondary(context: { ownerId: string; player: typeof owner; aim: { x: number; y: number }; now: number; heldMs: number; isNewPress: boolean }): { kind: string; weaponId: string; label: string };
    };

    expect(api.getClownKitRuntime(owner.id)).toMatchObject({ backBalloon: true });
    expect("useClownKitSuper" in api).toBe(false);
    expect(api.getClownKitRuntime(owner.id).stageCooldown).toBeUndefined();
    expect(api.getClownKitRuntime(owner.id).activeStage).toBeUndefined();
    api.useClownKitPrimary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 3000, heldMs: 0, isNewPress: true });
    combat.getPlayerInventory().cooldowns["clown-kit"] = 0;
    api.useClownKitSecondary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 3020, heldMs: 0, isNewPress: true });
    const snapshot = combat.getSnapshot() as unknown as { clownStages?: unknown[] };
    expect(snapshot.clownStages).toBeUndefined();
    expect(combat.getCombatant(victim.id)?.statuses.some((status) => status.id === ("clownLaugh" as never))).toBe(false);
    expect(combat.isMovementLocked(owner.id)).toBe(false);
  });

  it("summons, recalls, damages, and cleans up strap pets without duplicates", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "pet-owner", x: 0, velocityX: 0, velocityY: 0 };
    const target = combat.spawnTrainingDummy({ x: 86, y: playerState.y });
    combat.syncLocalPlayer(owner, "Pet Owner", "#18dff5");
    combat.setPlayerLoadout(owner.id, { frontStrap: "pet-bear" });
    const api = combat as unknown as {
      usePetItem(ownerId: string, slot: "frontStrap" | "backStrap", weaponId: "pet-bear", player: typeof owner, now: number): { kind: string; weaponId: string; label: string };
      getPetRuntime(ownerId: string, slot: "frontStrap" | "backStrap", weaponId: "pet-bear"): { active: boolean; hp: number; maxHp: number; cooldown: number };
    };

    expect(api.usePetItem(owner.id, "frontStrap", "pet-bear", owner, 100)).toMatchObject({ kind: "utility", label: "Bear Summon" });
    expect(api.usePetItem(owner.id, "frontStrap", "pet-bear", owner, 110)).toMatchObject({ kind: "utility", label: "Bear Recall" });
    expect(api.usePetItem(owner.id, "frontStrap", "pet-bear", owner, 5200)).toMatchObject({ kind: "utility", label: "Bear Summon" });
    expect((combat.getSnapshot() as unknown as { pets: Array<{ ownerId: string; kind: string; hp: number; maxHp: number }> }).pets).toEqual([
      expect.objectContaining({ ownerId: owner.id, kind: "bear", maxHp: expect.any(Number) }),
    ]);
    for (let tick = 0; tick < 12; tick += 1) {
      combat.update(0.18, [owner]);
    }
    expect(combat.getCombatant(target.id)!.hp).toBeLessThan(target.maxHp);
    const pet = (combat.getSnapshot() as unknown as { pets: Array<{ id: string; hp: number }> }).pets[0];
    combat.applyDamage({ sourceId: target.id, targetId: pet.id, weaponId: "pistol", damage: 999, knockback: { x: 0, y: -120 }, stun: 0.1, label: "Pet Test", skipHitLocationScaling: true });
    expect((combat.getSnapshot() as unknown as { pets: unknown[] }).pets).toHaveLength(0);
    expect(api.getPetRuntime(owner.id, "frontStrap", "pet-bear")).toMatchObject({ active: false, cooldown: expect.any(Number) });
    expect(api.getPetRuntime(owner.id, "frontStrap", "pet-bear").cooldown).toBeGreaterThan(20);
  });

  it("gives each pet a simple distinct support or attack behavior", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const owner = { ...playerState, id: "pet-suite-owner", x: 0, velocityX: 0, velocityY: 0 };
    const target = combat.spawnTrainingDummy({ x: 104, y: playerState.y });
    combat.syncLocalPlayer(owner, "Pet Suite", "#18dff5");
    const api = combat as unknown as {
      usePetItem(ownerId: string, slot: "frontStrap" | "backStrap", weaponId: "pet-cat" | "pet-dog" | "pet-deer" | "pet-parrot" | "pet-chipmunk", player: typeof owner, now: number): { kind: string; label: string };
    };

    combat.setPlayerLoadout(owner.id, { frontStrap: "pet-cat", backStrap: "pet-dog" });
    api.usePetItem(owner.id, "frontStrap", "pet-cat", owner, 100);
    api.usePetItem(owner.id, "backStrap", "pet-dog", owner, 120);
    for (let tick = 0; tick < 14; tick += 1) {
      combat.update(0.16, [owner]);
    }
    expect(combat.getCombatant(target.id)?.statuses.some((status) => status.id === ("petMarked" as never))).toBe(true);
    const ownerHpBefore = combat.getCombatant(owner.id)!.hp;
    combat.applyDamage({ sourceId: target.id, targetId: owner.id, weaponId: "pistol", damage: 20, knockback: { x: 0, y: 0 }, stun: 0.1, label: "Dog Share", skipHitLocationScaling: true });
    expect(combat.getCombatant(owner.id)!.hp).toBeGreaterThan(ownerHpBefore - 20);

    combat.setPlayerLoadout(owner.id, { frontStrap: "pet-deer", backStrap: "pet-parrot" });
    api.usePetItem(owner.id, "frontStrap", "pet-deer", owner, 5200);
    api.usePetItem(owner.id, "backStrap", "pet-parrot", owner, 5220);
    combat.update(0.2, [owner]);
    expect(combat.getCombatant(owner.id)?.statuses.some((status) => status.id === ("petDeerAura" as never))).toBe(true);
    const projectileCount = combat.getSnapshot().projectiles.length;
    combat.equip("pistol");
    combat.usePrimary({ ownerId: owner.id, player: owner, aim: { x: 1, y: 0 }, now: 5600, heldMs: 0, isNewPress: true });
    for (let tick = 0; tick < 12; tick += 1) {
      combat.update(0.12, [owner]);
    }
    expect(combat.getSnapshot().projectiles.length).toBeGreaterThan(projectileCount + 1);

    combat.setPlayerLoadout(owner.id, { frontStrap: "pet-chipmunk" });
    api.usePetItem(owner.id, "frontStrap", "pet-chipmunk", owner, 9000);
    for (let tick = 0; tick < 18; tick += 1) {
      combat.update(0.12, [owner]);
    }
    expect(combat.getCombatant(target.id)?.statuses.some((status) => status.id === ("petStumble" as never))).toBe(true);
  });

  it("lets Neptune, Mars, Uranus, Jupiter, Moon, and Judgment Day stack while cleaning only each event's own state", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    const player = { ...playerState, id: "space-stack-user", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Space", "#d6f2ff");

    combat.equip("moon" as never);
    combat.usePrimary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 100, heldMs: 0, isNewPress: true });
    combat.equip("jupiter" as never);
    combat.usePrimary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 120, heldMs: 0, isNewPress: true });
    combat.equip("uranus" as never);
    combat.usePrimary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 130, heldMs: 0, isNewPress: true });
    combat.equip("mars" as never);
    combat.usePrimary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 135, heldMs: 0, isNewPress: true });
    combat.equip("neptune" as never);
    combat.usePrimary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 138, heldMs: 0, isNewPress: true });
    combat.equip("cross" as never);
    combat.useSecondary({ ownerId: "space-stack-user", player, aim: { x: 0, y: -1 }, now: 140, heldMs: 0, isNewPress: true });

    expect(combat.getMoonEventState("space-stack-user")).toMatchObject({ active: true });
    expect((combat.getSnapshot() as unknown as { jupiterEvents: unknown[] }).jupiterEvents).toHaveLength(1);
    expect((combat.getSnapshot() as unknown as { uranusEvents: unknown[] }).uranusEvents).toHaveLength(1);
    expect((combat.getSnapshot() as unknown as { marsEvents: unknown[] }).marsEvents).toHaveLength(1);
    expect((combat.getSnapshot() as unknown as { neptuneEvents: unknown[] }).neptuneEvents).toHaveLength(1);
    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "countdown" });

    combat.update(60.2, [player]);

    const snapshot = combat.getSnapshot() as unknown as { jupiterEvents: unknown[]; jupiterFootsteps: unknown[]; jupiterSharks: unknown[]; uranusEvents: unknown[]; marsEvents: unknown[]; marsClones: unknown[]; neptuneEvents: unknown[]; neptuneCreatures: unknown[]; neptunePellets: unknown[] };
    expect(snapshot.jupiterEvents).toHaveLength(0);
    expect(snapshot.jupiterFootsteps).toHaveLength(0);
    expect(snapshot.jupiterSharks).toHaveLength(0);
    expect(snapshot.uranusEvents).toHaveLength(0);
    expect(snapshot.marsEvents).toHaveLength(0);
    expect(snapshot.marsClones).toHaveLength(0);
    expect(snapshot.neptuneEvents).toHaveLength(0);
    expect(snapshot.neptuneCreatures).toHaveLength(0);
    expect(snapshot.neptunePellets).toHaveLength(0);
    expect(combat.getMoonEventState("space-stack-user")).toMatchObject({ active: false });
    expect(combat.getJudgmentDayState()).toMatchObject({ active: true, phase: "active" });
    expect(combat.getSnapshot().judgmentBeams.length).toBeGreaterThan(0);
  });

  it("auto-reveals sniper steady after thirty seconds and reveals immediately on shots", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("sniper");
    const shooter = { ...playerState };
    combat.syncLocalPlayer(shooter, "Tester", "#18dff5");

    combat.useSecondary({ ownerId: "local", player: shooter, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(combat.getCombatant("local")?.statuses.find((status) => status.id === "steady")?.duration).toBeCloseTo(30, 0);

    combat.update(29.8, [shooter]);
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(true);
    combat.update(0.3, [shooter]);
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(false);
    expect(combat.consumeSounds()).toContain("sniper-reveal");
    expect(combat.getSnapshot().effects.some((effect) => effect.label === "Reveal")).toBe(true);

    combat.getPlayerInventory().cooldowns.sniper = 0;
    combat.getPlayerInventory().ammo.sniper!.magazine = 1;
    combat.useSecondary({ ownerId: "local", player: shooter, aim: { x: 1, y: 0 }, now: 40000, heldMs: 0, isNewPress: true });
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(true);
    combat.usePrimary({ ownerId: "local", player: shooter, aim: { x: 1, y: 0 }, now: 40200, heldMs: 0, isNewPress: true });
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(false);
    expect(combat.consumeSounds()).toContain("sniper-reveal");
  });
});
