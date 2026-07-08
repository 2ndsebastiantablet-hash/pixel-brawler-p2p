import type { WeaponId } from "../combat/Weapon";
import { WEAPON_IDS, weaponRegistry } from "../combat/WeaponRegistry";

export type LoadoutSlotId = "frontStrap" | "backStrap" | "leftHand" | "rightHand" | "attachment";
export type LoadoutCategory = "all" | "hands" | "straps" | "attachments" | "melee" | "ranged" | "utility";

export interface LoadoutState {
  frontStrap?: WeaponId;
  backStrap?: WeaponId;
  leftHand?: WeaponId;
  rightHand?: WeaponId;
  attachment?: WeaponId;
}

export interface LoadoutItemDefinition {
  id: WeaponId;
  name: string;
  summary: string;
  category: LoadoutCategory;
  compatibleSlots: LoadoutSlotId[];
  handedness: "one-handed" | "two-handed" | "strap" | "attachment";
}

export const DEFAULT_LOADOUT: LoadoutState = {
  leftHand: "pistol",
  rightHand: "knife",
  frontStrap: "wings",
  backStrap: "death-aura",
  attachment: "virgin-blood",
};

export const LOADOUT_SLOT_LABELS: Record<LoadoutSlotId, string> = {
  frontStrap: "Q Front Strap",
  backStrap: "E Back Strap",
  leftHand: "Left Mouse",
  rightHand: "Right Mouse",
  attachment: "F Attachment",
};

const twoHandedWeapons = new Set<WeaponId>([
  "axe",
  "laser-blaster",
  "lightning-rod",
  "minigun",
  "rocket",
  "sledgehammer",
  "sniper",
  "whip",
]);

const oneHandedWeapons = new Set<WeaponId>([
  "knife",
  "machete",
  "pistol",
  "revolver",
  "slingshot",
  "teleport-ball",
]);

const strapWeapons = new Set<WeaponId>([
  "death-aura",
  "hands",
  "virgin-blood",
  "wings",
]);

const attachmentWeapons = new Set<WeaponId>([
  "hands",
  "teleport-ball",
  "virgin-blood",
]);

export const LOADOUT_ITEMS: LoadoutItemDefinition[] = WEAPON_IDS.map((id) => {
  const weapon = weaponRegistry.get(id);
  const compatibleSlots: LoadoutSlotId[] = [];
  if (oneHandedWeapons.has(id) || twoHandedWeapons.has(id)) {
    compatibleSlots.push("leftHand", "rightHand");
  }
  if (strapWeapons.has(id)) {
    compatibleSlots.push("frontStrap", "backStrap");
  }
  if (attachmentWeapons.has(id)) {
    compatibleSlots.push("attachment");
  }
  const handedness = twoHandedWeapons.has(id)
    ? "two-handed"
    : oneHandedWeapons.has(id)
      ? "one-handed"
      : attachmentWeapons.has(id)
        ? "attachment"
        : "strap";
  return {
    id,
    name: weapon.name,
    summary: weapon.description,
    category: categoryForWeapon(id),
    compatibleSlots,
    handedness,
  };
});

export function normalizeLoadout(input: Partial<LoadoutState> = {}): LoadoutState {
  const next: LoadoutState = {};

  normalizeHandSlots(input, next);
  normalizeSlot(input, next, "frontStrap");
  normalizeSlot(input, next, "backStrap");
  normalizeSlot(input, next, "attachment");

  return next;
}

export function assignLoadoutItem(current: Partial<LoadoutState>, slot: LoadoutSlotId, weaponId: WeaponId): LoadoutState {
  const next = normalizeLoadout(current);
  if (!isSlotCompatible(weaponId, slot)) {
    return next;
  }

  if (slot === "leftHand" || slot === "rightHand") {
    if (isTwoHandedWeapon(weaponId)) {
      next.leftHand = weaponId;
      next.rightHand = weaponId;
      return next;
    }
    const otherSlot = slot === "leftHand" ? "rightHand" : "leftHand";
    if (next[otherSlot] && next[otherSlot] === next[slot] && isTwoHandedWeapon(next[otherSlot])) {
      next[otherSlot] = undefined;
    }
    next[slot] = weaponId;
    return next;
  }

  next[slot] = weaponId;
  return next;
}

export function isSlotCompatible(weaponId: WeaponId, slot: LoadoutSlotId): boolean {
  if (!isKnownWeaponId(weaponId)) {
    return false;
  }
  if (slot === "leftHand" || slot === "rightHand") {
    return oneHandedWeapons.has(weaponId) || twoHandedWeapons.has(weaponId);
  }
  if (slot === "frontStrap" || slot === "backStrap") {
    return strapWeapons.has(weaponId);
  }
  return attachmentWeapons.has(weaponId);
}

export function isTwoHandedWeapon(weaponId: WeaponId | undefined): boolean {
  return Boolean(weaponId && twoHandedWeapons.has(weaponId));
}

export function isKnownWeaponId(value: unknown): value is WeaponId {
  return typeof value === "string" && (WEAPON_IDS as readonly string[]).includes(value);
}

export function getLoadoutItem(weaponId: WeaponId | undefined): LoadoutItemDefinition | undefined {
  return weaponId ? LOADOUT_ITEMS.find((item) => item.id === weaponId) : undefined;
}

export function loadoutWeaponName(weaponId: WeaponId | undefined): string {
  return weaponId ? weaponRegistry.get(weaponId).name : "Empty";
}

export function loadoutHasWeapon(loadout: Partial<LoadoutState>, weaponId: WeaponId): boolean {
  return loadout.frontStrap === weaponId
    || loadout.backStrap === weaponId
    || loadout.leftHand === weaponId
    || loadout.rightHand === weaponId
    || loadout.attachment === weaponId;
}

function normalizeHandSlots(input: Partial<LoadoutState>, next: LoadoutState): void {
  const hasLeft = Object.prototype.hasOwnProperty.call(input, "leftHand");
  const hasRight = Object.prototype.hasOwnProperty.call(input, "rightHand");
  const left = hasLeft ? sanitizeSlotWeapon(input.leftHand, "leftHand") : DEFAULT_LOADOUT.leftHand;
  const right = hasRight ? sanitizeSlotWeapon(input.rightHand, "rightHand") : DEFAULT_LOADOUT.rightHand;

  if (left && isTwoHandedWeapon(left)) {
    next.leftHand = left;
    next.rightHand = left;
    return;
  }
  if (right && isTwoHandedWeapon(right)) {
    next.leftHand = right;
    next.rightHand = right;
    return;
  }

  next.leftHand = left;
  next.rightHand = right;
}

function normalizeSlot(input: Partial<LoadoutState>, next: LoadoutState, slot: Exclude<LoadoutSlotId, "leftHand" | "rightHand">): void {
  const hasSlot = Object.prototype.hasOwnProperty.call(input, slot);
  next[slot] = hasSlot ? sanitizeSlotWeapon(input[slot], slot) : DEFAULT_LOADOUT[slot];
}

function sanitizeSlotWeapon(value: unknown, slot: LoadoutSlotId): WeaponId | undefined {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LOADOUT[slot];
  }
  return isKnownWeaponId(value) && isSlotCompatible(value, slot) ? value : DEFAULT_LOADOUT[slot];
}

function categoryForWeapon(id: WeaponId): LoadoutCategory {
  if (id === "wings" || id === "death-aura" || id === "virgin-blood" || id === "hands") {
    return "utility";
  }
  if (strapWeapons.has(id)) {
    return "straps";
  }
  if (attachmentWeapons.has(id)) {
    return "attachments";
  }
  if (id === "knife" || id === "machete" || id === "axe" || id === "whip" || id === "sledgehammer" || id === "lightning-rod") {
    return "melee";
  }
  return "ranged";
}
