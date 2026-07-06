import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICS, createPlayerState } from "../src/game/Physics";
import { CombatSystem } from "../src/game/combat/CombatSystem";
import { createCustomFighter } from "../src/game/combat/Fighter";
import { COMBAT_TUNING } from "../src/game/combat/CombatTuning";
import { createDefaultInventory } from "../src/game/combat/WeaponRegistry";

const playerState = createPlayerState("local", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, "Tester");

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
    expect(fighter.weaponInventory).toHaveLength(10);
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
    const stomper = { ...playerState, x: 20, y: playerState.y - 30, grounded: false, velocityY: 520 };
    combat.syncLocalPlayer(stomper, "Tester", "#18dff5");
    combat.update(1 / 60, [stomper]);
    expect(stomper.velocityY).toBeLessThan(0);
    expect(combat.getCombatant(dummy.id)?.hitstun).toBeGreaterThan(0);
    expect(stomper.jumpsUsed).toBe(1);
    expect(stomper.airDiveUsed).toBe(false);

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

  it("fires charged slingshot stones and scatter pebbles with ricochet feedback", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    combat.equip("slingshot");
    const player = { ...playerState };

    const charged = combat.usePrimary({
      ownerId: "local",
      player,
      aim: { x: 1, y: -0.1 },
      now: 100,
      heldMs: 850,
      isNewPress: true,
    });
    expect(charged.kind).toBe("fired");
    const shot = combat.getSnapshot().projectiles[0];
    expect(shot.weaponId).toBe("slingshot");
    expect(shot.damage).toBeGreaterThan(6);
    expect(shot.bounces).toBe(COMBAT_TUNING.projectiles.slingshotBounces);
    expect(combat.consumeSounds()).toContain("slingshot-shot");

    combat.update(0.32, [player]);
    combat.useSecondary({
      ownerId: "local",
      player,
      aim: { x: 1, y: 0 },
      now: 500,
      heldMs: 0,
      isNewPress: true,
    });
    expect(combat.getSnapshot().projectiles.filter((projectile) => projectile.weaponId === "slingshot")).toHaveLength(4);
  });

  it("supports laser charge, venting, revolver last bullet, minigun spin, and sniper steady aim", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    combat.equip("laser-blaster");
    const laserCharge = combat.getPlayerInventory().charge["laser-blaster"]!;
    laserCharge.charge = 8;
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
    expect(laserShot?.damage).toBeGreaterThan(15);
    expect(laserShot?.pierce).toBeGreaterThanOrEqual(2);
    expect(combat.getPlayerInventory().charge["laser-blaster"]?.heat).toBeGreaterThan(0);
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
    expect(combat.getCombatant("local")?.statuses.some((status) => status.id === "steady")).toBe(true);
    const sniper = combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 2400, heldMs: 0, isNewPress: true });
    expect(sniper.kind).toBe("fired");
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
  });

  it("electrocutes on lightning rod contact and carries a wider sledgehammer shockwave", () => {
    const combat = new CombatSystem({ mode: "offline" });
    combat.start(createDefaultInventory());
    const player = { ...playerState };
    combat.syncLocalPlayer(player, "Tester", "#18dff5");

    combat.equip("lightning-rod");
    const rodDummy = combat.spawnTrainingDummy({ x: player.x + 58, y: player.y });
    combat.usePrimary({ ownerId: "local", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    combat.update(1 / 60, [player]);
    expect(combat.getCombatant(rodDummy.id)?.statuses.some((status) => status.id === "shock")).toBe(true);
    expect(combat.getCombatant(rodDummy.id)?.hitstun).toBeGreaterThan(0.2);
    combat.update(0.1, [player]);
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "aura" && effect.label === "Shock Aura")).toBe(true);

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
});
