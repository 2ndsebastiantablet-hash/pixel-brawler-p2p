import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAYER_COLORS,
  getOrCreateClientId,
  loadPlayerPreferences,
  savePlayerPreferences,
} from "../src/ui/Profile";

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
});
