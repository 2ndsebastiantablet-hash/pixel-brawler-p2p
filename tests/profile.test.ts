import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAYER_COLORS,
  getOrCreateClientId,
  loadPlayerProfile,
  loadPlayerPreferences,
  savePlayerProfile,
  savePlayerPreferences,
} from "../src/ui/Profile";
import { DEFAULT_LOADOUT } from "../src/game/loadout/Loadout";

describe("player preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0.123);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and persists a stable client id", () => {
    const first = getOrCreateClientId();
    const second = getOrCreateClientId();

    expect(first).toMatch(/^client-/);
    expect(second).toBe(first);
  });

  it("generates a simple player name and default color when nothing is saved", () => {
    const prefs = loadPlayerPreferences();

    expect(prefs.name).toBe("Player123");
    expect(prefs.color).toBe(PLAYER_COLORS[0]);
    expect(prefs.showNames).toBe(true);
  });

  it("saves sanitized name, color, and name display preference", () => {
    savePlayerPreferences({ name: "  Rowan  ", color: "#ff77aa", showNames: false });

    expect(loadPlayerPreferences()).toMatchObject({
      name: "Rowan",
      color: "#ff77aa",
      showNames: false,
    });
  });

  it("loads and saves real equipment loadouts without auto-filling empty slots", () => {
    const profile = loadPlayerProfile();
    expect(profile.loadout).toEqual(DEFAULT_LOADOUT);

    const saved = savePlayerProfile({
      ...profile,
      loadout: {
        leftHand: "machete",
        rightHand: undefined,
        frontStrap: undefined,
        backStrap: "hands",
        attachment: undefined,
        legs: "super-legs",
      },
    });

    expect(saved.loadout).toEqual({
      leftHand: "machete",
      backStrap: "hands",
      legs: "super-legs",
    });
    expect(loadPlayerProfile()).toEqual(saved);
  });
});
