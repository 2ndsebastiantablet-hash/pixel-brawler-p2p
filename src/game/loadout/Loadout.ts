import type { WeaponId } from "../combat/Weapon";
import { WEAPON_IDS, weaponRegistry } from "../combat/WeaponRegistry";

export type LoadoutSlotId = "frontStrap" | "backStrap" | "leftHand" | "rightHand" | "attachment";
export type LoadoutCategory =
  | "all"
  | "guns"
  | "blades"
  | "heavy"
  | "throwables"
  | "body"
  | "mobility"
  | "summons"
  | "consumables"
  | "utility";

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
  "virgin-blood",
]);

const strapWeapons = new Set<WeaponId>([
  "death-aura",
  "hands",
  "wings",
]);

const attachmentWeapons = new Set<WeaponId>([
  ...oneHandedWeapons,
  ...twoHandedWeapons,
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

export function assignHeldLoadoutItem(current: Partial<LoadoutState>, weaponId: WeaponId): LoadoutState {
  const next = normalizeLoadout(current);
  if (!isSlotCompatible(weaponId, "rightHand")) {
    return next;
  }
  next.leftHand = weaponId;
  next.rightHand = weaponId;
  return next;
}

export function swapAttachmentWithHand(
  current: Partial<LoadoutState>,
  preferredSlot: Extract<LoadoutSlotId, "leftHand" | "rightHand"> = "rightHand",
): { loadout: LoadoutState; swapped: boolean; reason?: string } {
  const next = normalizeLoadout(current);
  const attachment = next.attachment;
  if (!attachment) {
    return { loadout: next, swapped: false, reason: "No attachment" };
  }
  if (!isSlotCompatible(attachment, preferredSlot)) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(attachment)} cannot be held` };
  }

  const fallbackSlot = preferredSlot === "rightHand" ? "leftHand" : "rightHand";
  const handSlot = next[preferredSlot] ? preferredSlot : fallbackSlot;
  const held = next[handSlot];
  if (!held) {
    return { loadout: next, swapped: false, reason: "No held item" };
  }
  if (!isSlotCompatible(held, "attachment")) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(held)} cannot attach to ${LOADOUT_SLOT_LABELS.attachment}` };
  }

  const handsMatch = next.leftHand !== undefined && next.leftHand === next.rightHand;
  const attachmentNeedsBothHands = isTwoHandedWeapon(attachment);
  const heldUsesBothHands = isTwoHandedWeapon(held) || handsMatch;
  if (attachmentNeedsBothHands && !heldUsesBothHands) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(attachment)} needs both hands` };
  }

  if (heldUsesBothHands || attachmentNeedsBothHands) {
    next.leftHand = attachment;
    next.rightHand = attachment;
  } else {
    next[handSlot] = attachment;
  }
  next.attachment = held;
  return { loadout: next, swapped: true };
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
  if (id === "pistol" || id === "revolver" || id === "laser-blaster" || id === "minigun" || id === "sniper") {
    return "guns";
  }
  if (id === "knife" || id === "machete" || id === "axe" || id === "whip") {
    return "blades";
  }
  if (id === "sledgehammer" || id === "rocket") {
    return "heavy";
  }
  if (id === "slingshot" || id === "teleport-ball") {
    return "throwables";
  }
  if (id === "death-aura" || id === "lightning-rod") {
    return "body";
  }
  if (id === "wings") {
    return "mobility";
  }
  if (id === "hands") {
    return "summons";
  }
  if (id === "virgin-blood") {
    return "consumables";
  }
  return "utility";
}
