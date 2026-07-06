import type { WeaponDefinition, WeaponId, WeaponInventoryState } from "./Weapon";
import { knife } from "./weapons/Knife";
import { laserBlaster } from "./weapons/LaserBlaster";
import { lightningRod } from "./weapons/LightningRod";
import { machete } from "./weapons/Machete";
import { minigun } from "./weapons/Minigun";
import { pistol } from "./weapons/Pistol";
import { revolver } from "./weapons/Revolver";
import { sledgeHammer } from "./weapons/SledgeHammer";
import { slingshot } from "./weapons/Slingshot";
import { sniper } from "./weapons/Sniper";
import { teleportBall } from "./weapons/TeleportBall";
import { whip } from "./weapons/Whip";

export const WEAPON_IDS = [
  "pistol",
  "whip",
  "teleport-ball",
  "lightning-rod",
  "sledgehammer",
] as const satisfies readonly WeaponId[];

const ALL_WEAPON_IDS = [
  "pistol",
  "whip",
  "slingshot",
  "laser-blaster",
  "revolver",
  "minigun",
  "sniper",
  "knife",
  "machete",
  "teleport-ball",
  "lightning-rod",
  "sledgehammer",
] as const satisfies readonly WeaponId[];

const weaponDefinitions: WeaponDefinition[] = [
  pistol,
  whip,
  slingshot,
  laserBlaster,
  revolver,
  minigun,
  sniper,
  knife,
  machete,
  teleportBall,
  lightningRod,
  sledgeHammer,
];

class WeaponRegistry {
  private readonly definitions = new Map<WeaponId, WeaponDefinition>();

  constructor(definitions: WeaponDefinition[]) {
    for (const definition of definitions) {
      this.definitions.set(definition.id, definition);
    }
  }

  get(id: WeaponId): WeaponDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Unknown weapon: ${id}`);
    }
    return definition;
  }

  all(): WeaponDefinition[] {
    return ALL_WEAPON_IDS.map((id) => this.get(id));
  }
}

export const weaponRegistry = new WeaponRegistry(weaponDefinitions);

export function createDefaultInventory(): WeaponInventoryState {
  const ammo: WeaponInventoryState["ammo"] = {};
  const charge: WeaponInventoryState["charge"] = {};
  const cooldowns: WeaponInventoryState["cooldowns"] = {};

  for (const id of WEAPON_IDS) {
    const weapon = weaponRegistry.get(id);
    cooldowns[id] = 0;
    if (weapon.ammo) {
      ammo[id] = {
        magazine: weapon.ammo.magazineSize,
        reserve: weapon.ammo.reserve,
        reloadTimer: 0,
        perfectWindow: 0,
        perfectShots: 0,
        perfectQueued: false,
      };
    }
    if (weapon.charge) {
      charge[id] = {
        charge: 0,
        charging: false,
        heat: 0,
        maxCharge: weapon.charge.maxCharge,
      };
    }
  }

  return {
    equippedWeapon: "pistol",
    weaponInventory: [...WEAPON_IDS],
    ammo,
    charge,
    cooldowns,
    combo: {},
  };
}
