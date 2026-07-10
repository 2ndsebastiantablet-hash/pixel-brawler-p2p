import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICS, VOID_DEATH_Y, createPlayerState, stepPlayer } from "../src/game/Physics";
import { CombatSystem } from "../src/game/combat/CombatSystem";
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
    expect(fighter.weaponInventory).toHaveLength(22);
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

  it("revs Chainsaw into low DPS, overheats, spawns contribution zombies, and applies poison bites", () => {
    const combat = new CombatSystem({ mode: "network" });
    combat.start(createDefaultInventory());
    combat.equip("chainsaw");
    const player = { ...playerState, id: "peer-a", x: 0, velocityX: 0, velocityY: 0 };
    combat.syncLocalPlayer(player, "Host", "#18dff5");
    const victim = combat.spawnTrainingDummy({ x: 46, y: playerState.y });

    const rev = combat.usePrimary({ ownerId: "peer-a", player, aim: { x: 1, y: 0 }, now: 100, heldMs: 0, isNewPress: true });
    expect(rev).toMatchObject({ kind: "utility", weaponId: "chainsaw", label: "Revving" });
    expect(combat.getWeaponRuntimeState("chainsaw", "peer-a").chainsawMode).toBe("revving");
    combat.update(1.9, [player]);
    expect(combat.getCombatant(victim.id)!.hp).toBe(100);

    combat.update(0.25, [player]);
    const running = combat.getWeaponRuntimeState("chainsaw", "peer-a");
    expect(running.chainsawMode).toBe("running");
    expect(running.chainsawDps).toBeGreaterThanOrEqual(8);
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
    expect(combat.consumeSounds()).toEqual(expect.arrayContaining(["chainsaw-rev", "chainsaw-hit", "zombie-spawn"]));

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
