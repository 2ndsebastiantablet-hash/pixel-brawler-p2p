import type { WeaponDefinition, WeaponId } from "../Weapon";

const petDefinition = (
  id: WeaponId,
  name: string,
  description: string,
  mastery: string[],
): WeaponDefinition => ({
  id,
  name,
  kind: "utility",
  description,
  primary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0, radius: 0 },
  secondary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0, radius: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.02, accelerationMultiplier: 1.05, airAccelerationMultiplier: 1.04, jumpMultiplier: 1, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery,
});

export const petBear = petDefinition(
  "pet-bear",
  "Bear",
  "Strap pet. Strongest pet, but attacks anyone nearby, including you. Q/E summons or recalls it.",
  ["Pet", "Strap item", "High HP", "Attacks anyone"],
);

export const petCat = petDefinition(
  "pet-cat",
  "Cat",
  "Strap pet. Very fast pouncing pet that marks enemies. Q/E summons or recalls it.",
  ["Pet", "Fast pounce", "Marks enemies"],
);

export const petDog = petDefinition(
  "pet-dog",
  "Dog",
  "Strap pet. Loyal pet that protects you and shares some damage. Q/E summons or recalls it.",
  ["Pet", "Protects owner", "Damage bond", "Tiny heal"],
);

export const petDeer = petDefinition(
  "pet-deer",
  "Deer",
  "Strap pet. Support pet that boosts movement nearby and rams enemies. Q/E summons or recalls it.",
  ["Pet", "Movement aura", "Antler ram"],
);

export const petParrot = petDefinition(
  "pet-parrot",
  "Parrot",
  "Strap pet. Flying mimic pet that repeats weaker versions of your simple attacks. Q/E summons or recalls it.",
  ["Pet", "Flying", "Mimics simple attacks"],
);

export const petChipmunk = petDefinition(
  "pet-chipmunk",
  "Chipmunk",
  "Strap pet. Fastest pet. Fetches pickups and trips enemies. Q/E summons or recalls it.",
  ["Pet", "Fastest", "Fetches pickups", "Trips enemies"],
);
