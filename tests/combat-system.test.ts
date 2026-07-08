import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICS, createPlayerState, stepPlayer } from "../src/game/Physics";
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
    expect(fighter.weaponInventory).toHaveLength(15);
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
    expect(combat.getPlayerInventory().equippedWeapon).toBe("pistol");
    expect(combat.consumeSounds()).toContain("weapon-pickup");
    expect(combat.getSnapshot().effects.some((effect) => effect.kind === "pickup" && effect.label === "Pistol")).toBe(true);
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

  it("activates Virgin Blood with F semantics, heals, buffs, and revives once with angel wings", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("virgin-blood");
    const player = { ...playerState, id: "peer-a", velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    combat.applyDamage({ sourceId: "status", targetId: "peer-a", damage: 54, knockback: { x: 0, y: 0 }, stun: 0, label: "Setup" });
    const wounded = combat.getCombatant("peer-a")!;
    wounded.invulnerable = 0;

    const activated = combat.activateVirginBlood("peer-a", player, 100);
    expect(activated.kind).toBe("utility");
    expect(wounded.hp).toBe(100);
    expect(wounded.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "holyBuff", duration: expect.closeTo(25, 1) }),
      expect.objectContaining({ id: "blessed" }),
    ]));
    expect(combat.getVirginBloodState("peer-a")).toMatchObject({ reviveAvailable: true });
    expect(combat.getPlayerInventory().cooldowns["virgin-blood"]).toBeGreaterThanOrEqual(45);
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["virgin-blood-activate"]));

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
