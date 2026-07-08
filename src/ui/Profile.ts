import { DEFAULT_LOADOUT, normalizeLoadout, type LoadoutState } from "../game/loadout/Loadout";

export interface PlayerPreferences {
  name: string;
  color: string;
  showNames: boolean;
  loadout?: LoadoutState;
}

export interface PlayerProfile extends PlayerPreferences {
  clientId: string;
}

export const PLAYER_COLORS = [
  "#18dff5",
  "#ff6f91",
  "#b096ff",
  "#7cff6b",
  "#ffd84d",
  "#ff8f3d",
  "#5ad7ff",
  "#f65bd8",
] as const;

const clientIdKey = "pixel-brawler-p2p.clientId";
const preferencesKey = "pixel-brawler-p2p.preferences";

export function getOrCreateClientId(storage: Storage = localStorage): string {
  const existing = storage.getItem(clientIdKey);
  if (existing) {
    return existing;
  }
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  const clientId = `client-${randomId}`;
  storage.setItem(clientIdKey, clientId);
  return clientId;
}

export function loadPlayerPreferences(storage: Storage = localStorage): PlayerPreferences {
  const fallback: PlayerPreferences = {
    name: `Player${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    color: PLAYER_COLORS[0],
    showNames: true,
    loadout: DEFAULT_LOADOUT,
  };

  const raw = storage.getItem(preferencesKey);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerPreferences>;
    return {
      name: sanitizeName(parsed.name) || fallback.name,
      color: sanitizeColor(parsed.color),
      showNames: typeof parsed.showNames === "boolean" ? parsed.showNames : fallback.showNames,
      loadout: normalizeLoadout(parsed.loadout),
    };
  } catch {
    return fallback;
  }
}

export function savePlayerPreferences(preferences: PlayerPreferences, storage: Storage = localStorage): PlayerPreferences {
  const saved = {
    name: sanitizeName(preferences.name) || `Player${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    color: sanitizeColor(preferences.color),
    showNames: preferences.showNames,
    loadout: normalizeLoadout(preferences.loadout),
  };
  storage.setItem(preferencesKey, JSON.stringify(saved));
  return saved;
}

export function loadPlayerProfile(storage: Storage = localStorage): PlayerProfile {
  return {
    clientId: getOrCreateClientId(storage),
    ...loadPlayerPreferences(storage),
  };
}

export function savePlayerProfile(profile: PlayerProfile, storage: Storage = localStorage): PlayerProfile {
  storage.setItem(clientIdKey, profile.clientId);
  return {
    clientId: profile.clientId,
    ...savePlayerPreferences(profile, storage),
  };
}

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 18);
}

function sanitizeColor(value: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return PLAYER_COLORS[0];
}
