import { createDefaultInventory } from "./WeaponRegistry";
import type { WeaponId } from "./Weapon";

export interface CustomFighter {
  playerName: string;
  playerColor: string;
  headShape: "round" | "square" | "visor";
  torsoShape: "compact" | "wide" | "tall";
  armShape: "chunky" | "long" | "heavy";
  legShape: "athletic" | "spring" | "heavy";
  equippedWeapon: WeaponId;
  weaponInventory: WeaponId[];
}

export function createCustomFighter(input: {
  playerName: string;
  playerColor: string;
  headShape?: CustomFighter["headShape"];
  torsoShape?: CustomFighter["torsoShape"];
  armShape?: CustomFighter["armShape"];
  legShape?: CustomFighter["legShape"];
  equippedWeapon?: WeaponId;
  weaponInventory?: WeaponId[];
}): CustomFighter {
  const inventory = createDefaultInventory();
  return {
    playerName: input.playerName,
    playerColor: input.playerColor,
    headShape: input.headShape ?? "round",
    torsoShape: input.torsoShape ?? "compact",
    armShape: input.armShape ?? "chunky",
    legShape: input.legShape ?? "athletic",
    equippedWeapon: input.equippedWeapon ?? inventory.equippedWeapon,
    weaponInventory: input.weaponInventory ?? inventory.weaponInventory,
  };
}
