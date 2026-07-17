import type { WeaponDefinition, WeaponId, WeaponInventoryState } from "./Weapon";
import { axe } from "./weapons/Axe";
import { chainsaw } from "./weapons/Chainsaw";
import { cross } from "./weapons/Cross";
import { deathAura } from "./weapons/DeathAura";
import { grapplingHook } from "./weapons/GrapplingHook";
import { hands } from "./weapons/Hands";
import { holyBazooka } from "./weapons/HolyBazooka";
import { knife } from "./weapons/Knife";
import { laserBlaster } from "./weapons/LaserBlaster";
import { lightningRod } from "./weapons/LightningRod";
import { machete } from "./weapons/Machete";
import { minigun } from "./weapons/Minigun";
import { moon } from "./weapons/Moon";
import { jupiter } from "./weapons/Jupiter";
import { uranus } from "./weapons/Uranus";
import { pistol } from "./weapons/Pistol";
import { revolver } from "./weapons/Revolver";
import { rocket } from "./weapons/Rocket";
import { sledgeHammer } from "./weapons/SledgeHammer";
import { slingshot } from "./weapons/Slingshot";
import { sniper } from "./weapons/Sniper";
import { spikes } from "./weapons/Spikes";
import { spiritFighter } from "./weapons/SpiritFighter";
import { superLegs } from "./weapons/SuperLegs";
import { teleportBall } from "./weapons/TeleportBall";
import { van } from "./weapons/Van";
import { virginBlood } from "./weapons/VirginBlood";
import { whip } from "./weapons/Whip";
import { wings } from "./weapons/Wings";
import { COMBAT_TUNING } from "./CombatTuning";

export const WEAPON_IDS = [
  "pistol",
  "whip",
  "teleport-ball",
  "lightning-rod",
  "sledgehammer",
  "slingshot",
  "laser-blaster",
  "revolver",
  "minigun",
  "sniper",
  "knife",
  "machete",
  "axe",
  "wings",
  "virgin-blood",
  "death-aura",
  "rocket",
  "hands",
  "super-legs",
  "holy-bazooka",
  "grappling-hook",
  "chainsaw",
  "spikes",
  "van",
  "spirit-fighter",
  "cross",
  "moon",
  "jupiter",
  "uranus",
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
  "axe",
  "wings",
  "virgin-blood",
  "death-aura",
  "rocket",
  "hands",
  "super-legs",
  "holy-bazooka",
  "teleport-ball",
  "lightning-rod",
  "sledgehammer",
  "grappling-hook",
  "chainsaw",
  "spikes",
  "van",
  "spirit-fighter",
  "cross",
  "moon",
  "jupiter",
  "uranus",
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
  axe,
  wings,
  virginBlood,
  deathAura,
  rocket,
  holyBazooka,
  grapplingHook,
  chainsaw,
  spikes,
  van,
  spiritFighter,
  cross,
  moon,
  jupiter,
  uranus,
  hands,
  superLegs,
  teleportBall,
  lightningRod,
  sledgeHammer,
];

class WeaponRegistry {
  private readonly definitions = new Map<WeaponId, WeaponDefinition>();

  constructor(definitions: WeaponDefinition[]) {
    for (const definition of definitions) {
      this.definitions.set(definition.id, {
        ...definition,
        weight: COMBAT_TUNING.weaponWeights[definition.id],
      });
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
        magazine: id === "holy-bazooka" ? 0 : weapon.ammo.magazineSize,
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
