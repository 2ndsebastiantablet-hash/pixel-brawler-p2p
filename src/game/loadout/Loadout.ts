import type { WeaponId } from "../combat/Weapon";
import { WEAPON_IDS, weaponRegistry } from "../combat/WeaponRegistry";

export type LoadoutSlotId = "frontStrap" | "backStrap" | "leftHand" | "rightHand" | "attachment" | "grabber" | "legs";
export type LoadoutCategory =
  | "all"
  | "guns"
  | "blades"
  | "heavy"
  | "throwables"
  | "body"
  | "mobility"
  | "space"
  | "summons"
  | "consumables"
  | "utility";

export interface LoadoutState {
  frontStrap?: WeaponId;
  backStrap?: WeaponId;
  leftHand?: WeaponId;
  rightHand?: WeaponId;
  attachment?: WeaponId;
  grabber?: WeaponId;
  legs?: WeaponId;
}

export interface LoadoutItemDefinition {
  id: WeaponId;
  name: string;
  summary: string;
  category: LoadoutCategory;
  compatibleSlots: LoadoutSlotId[];
  handedness: "one-handed" | "two-handed" | "strap" | "attachment" | "legs";
}

export const DEFAULT_LOADOUT: LoadoutState = {};

export const STARTER_LOADOUT: LoadoutState = {
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
  grabber: "Grabber",
  legs: "Legs",
};

const twoHandedWeapons = new Set<WeaponId>([
  "axe",
  "laser-blaster",
  "lightning-rod",
  "minigun",
  "holy-bazooka",
  "rocket",
  "sledgehammer",
  "sniper",
  "whip",
]);

const oneHandedWeapons = new Set<WeaponId>([
  "chainsaw",
  "cross",
  "knife",
  "machete",
  "pistol",
  "grappling-hook",
  "revolver",
  "slingshot",
  "teleport-ball",
  "virgin-blood",
]);

const strapWeapons = new Set<WeaponId>([
  "death-aura",
  "hands",
  "spikes",
  "spirit-fighter",
  "van",
  "wings",
  "grabber",
  "moon",
  "jupiter",
  "uranus",
  "mars",
  "neptune",
]);

const legWeapons = new Set<WeaponId>([
  "super-legs",
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
    compatibleSlots.push("grabber");
  }
  if (legWeapons.has(id)) {
    compatibleSlots.push("legs");
  }
  const handedness = twoHandedWeapons.has(id)
    ? "two-handed"
    : oneHandedWeapons.has(id)
      ? "one-handed"
      : legWeapons.has(id)
        ? "legs"
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
  if (hasGrabberEquipped(next)) {
    normalizeSlot(input, next, "grabber");
  }
  normalizeSlot(input, next, "legs");

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

  if (slot === "grabber" && !hasGrabberEquipped(next)) {
    return next;
  }

  next[slot] = weaponId;
  return normalizeLoadout(next);
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

export function clearLoadoutSlot(current: Partial<LoadoutState>, slot: LoadoutSlotId): LoadoutState {
  const next = normalizeLoadout(current);
  if (slot === "leftHand" || slot === "rightHand") {
    const weapon = next[slot];
    if (weapon && next.leftHand === weapon && next.rightHand === weapon) {
      next.leftHand = undefined;
      next.rightHand = undefined;
    } else {
      next[slot] = undefined;
    }
    return normalizeLoadout(next);
  }

  next[slot] = undefined;
  return normalizeLoadout(next);
}

export function swapAttachmentWithHand(
  current: Partial<LoadoutState>,
  preferredSlot: Extract<LoadoutSlotId, "leftHand" | "rightHand"> = "rightHand",
): { loadout: LoadoutState; swapped: boolean; reason?: string } {
  const next = normalizeLoadout(current);
  if (hasGrabberEquipped(next)) {
    return swapAttachmentGrabberWithHand(next, preferredSlot);
  }
  const attachment = next.attachment;
  const fallbackSlot = preferredSlot === "rightHand" ? "leftHand" : "rightHand";
  const handSlot = next[preferredSlot] ? preferredSlot : fallbackSlot;
  const held = next[handSlot];

  if (!attachment && !held) {
    return { loadout: next, swapped: false, reason: "Nothing to swap" };
  }

  if (attachment && !isSlotCompatible(attachment, preferredSlot)) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(attachment)} cannot be held` };
  }

  if (!held) {
    next.attachment = undefined;
    if (attachment && isTwoHandedWeapon(attachment)) {
      next.leftHand = attachment;
      next.rightHand = attachment;
    } else if (attachment) {
      next[preferredSlot] = attachment;
    }
    return { loadout: normalizeLoadout(next), swapped: true };
  }

  if (!isSlotCompatible(held, "attachment")) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(held)} cannot attach to ${LOADOUT_SLOT_LABELS.attachment}` };
  }

  const handsMatch = next.leftHand !== undefined && next.leftHand === next.rightHand;
  const attachmentNeedsBothHands = isTwoHandedWeapon(attachment);
  const heldUsesBothHands = isTwoHandedWeapon(held) || handsMatch;
  const otherSlot = handSlot === "rightHand" ? "leftHand" : "rightHand";
  const otherHeld = next[otherSlot];
  if (!attachment) {
    if (heldUsesBothHands) {
      next.leftHand = undefined;
      next.rightHand = undefined;
    } else {
      next[handSlot] = undefined;
    }
    next.attachment = held;
    return { loadout: normalizeLoadout(next), swapped: true };
  }

  if (attachmentNeedsBothHands && !heldUsesBothHands && otherHeld) {
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

function swapAttachmentGrabberWithHand(
  current: LoadoutState,
  preferredSlot: Extract<LoadoutSlotId, "leftHand" | "rightHand">,
): { loadout: LoadoutState; swapped: boolean; reason?: string } {
  const next = { ...current };
  const fallbackSlot = preferredSlot === "rightHand" ? "leftHand" : "rightHand";
  const handSlot = next[preferredSlot] ? preferredSlot : next[fallbackSlot] ? fallbackSlot : preferredSlot;
  const otherSlot = handSlot === "rightHand" ? "leftHand" : "rightHand";
  const held = next[handSlot];
  const attachment = next.attachment;
  const grabberHeld = next.grabber;

  if (!held && !attachment && !grabberHeld) {
    return { loadout: next, swapped: false, reason: "Nothing to swap" };
  }

  const nextHand = attachment;
  const nextAttachment = grabberHeld;
  const nextGrabber = held;
  if (nextHand && !isSlotCompatible(nextHand, handSlot)) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(nextHand)} cannot be held` };
  }
  if (nextAttachment && !isSlotCompatible(nextAttachment, "attachment")) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(nextAttachment)} cannot attach to ${LOADOUT_SLOT_LABELS.attachment}` };
  }
  if (nextGrabber && !isSlotCompatible(nextGrabber, "grabber")) {
    return { loadout: next, swapped: false, reason: `${loadoutWeaponName(nextGrabber)} cannot attach to ${LOADOUT_SLOT_LABELS.grabber}` };
  }
  if (nextHand && isTwoHandedWeapon(nextHand)) {
    const otherHeld = next[otherSlot];
    const heldUsesBothHands = held && next.leftHand === held && next.rightHand === held;
    if (otherHeld && otherHeld !== held && !heldUsesBothHands) {
      return { loadout: next, swapped: false, reason: `${loadoutWeaponName(nextHand)} needs both hands` };
    }
  }

  if (held && next.leftHand === held && next.rightHand === held) {
    next.leftHand = undefined;
    next.rightHand = undefined;
  } else {
    next[handSlot] = undefined;
  }

  if (nextHand) {
    if (isTwoHandedWeapon(nextHand)) {
      next.leftHand = nextHand;
      next.rightHand = nextHand;
    } else {
      next[handSlot] = nextHand;
    }
  }
  next.attachment = nextAttachment;
  next.grabber = nextGrabber;
  return { loadout: normalizeLoadout(next), swapped: true };
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
  if (slot === "legs") {
    return legWeapons.has(weaponId);
  }
  if (slot === "grabber") {
    return attachmentWeapons.has(weaponId);
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
    || loadout.attachment === weaponId
    || loadout.grabber === weaponId
    || loadout.legs === weaponId;
}

function hasGrabberEquipped(loadout: Partial<LoadoutState>): boolean {
  return loadout.frontStrap === "grabber" || loadout.backStrap === "grabber";
}

function normalizeHandSlots(input: Partial<LoadoutState>, next: LoadoutState): void {
  const left = sanitizeSlotWeapon(input.leftHand, "leftHand");
  const right = sanitizeSlotWeapon(input.rightHand, "rightHand");

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

  if (left) {
    next.leftHand = left;
  }
  if (right) {
    next.rightHand = right;
  }
}

function normalizeSlot(input: Partial<LoadoutState>, next: LoadoutState, slot: Exclude<LoadoutSlotId, "leftHand" | "rightHand">): void {
  const value = sanitizeSlotWeapon(input[slot], slot);
  if (value) {
    next[slot] = value;
  }
}

function sanitizeSlotWeapon(value: unknown, slot: LoadoutSlotId): WeaponId | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return isKnownWeaponId(value) && isSlotCompatible(value, slot) ? value : undefined;
}

function categoryForWeapon(id: WeaponId): LoadoutCategory {
  if (id === "pistol" || id === "revolver" || id === "laser-blaster" || id === "minigun" || id === "sniper") {
    return "guns";
  }
  if (id === "knife" || id === "machete" || id === "axe" || id === "whip" || id === "chainsaw") {
    return "blades";
  }
  if (id === "sledgehammer" || id === "rocket" || id === "holy-bazooka") {
    return "heavy";
  }
  if (id === "slingshot" || id === "teleport-ball") {
    return "throwables";
  }
  if (id === "grappling-hook") {
    return "mobility";
  }
  if (id === "death-aura" || id === "lightning-rod") {
    return "body";
  }
  if (id === "grabber") {
    return "utility";
  }
  if (id === "spikes" || id === "van" || id === "spirit-fighter") {
    return "body";
  }
  if (id === "moon" || id === "jupiter" || id === "uranus" || id === "mars" || id === "neptune") {
    return "space";
  }
  if (id === "wings") {
    return "mobility";
  }
  if (id === "super-legs") {
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
