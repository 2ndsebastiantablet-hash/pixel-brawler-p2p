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

  it("loads and saves the real equipment loadout with defaults", () => {
    const profile = loadPlayerProfile();
    expect(profile.loadout).toEqual(DEFAULT_LOADOUT);

    const saved = savePlayerProfile({
      ...profile,
      loadout: {
        ...DEFAULT_LOADOUT,
        leftHand: "machete",
        rightHand: undefined,
        backStrap: "hands",
      },
    });

    expect(saved.loadout).toMatchObject({
      leftHand: "machete",
      frontStrap: "wings",
      backStrap: "hands",
      attachment: "virgin-blood",
    });
    expect(loadPlayerProfile()).toEqual(saved);
  });
});
