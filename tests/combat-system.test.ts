import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICS, createPlayerState } from "../src/game/Physics";
import { CombatSystem } from "../src/game/combat/CombatSystem";
import { createCustomFighter } from "../src/game/combat/Fighter";
import { createDefaultInventory } from "../src/game/combat/WeaponRegistry";

const playerState = createPlayerState("local", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, "Tester");

describe("combat system", () => {
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
    expect(fighter.weaponInventory).toHaveLength(5);
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
});
