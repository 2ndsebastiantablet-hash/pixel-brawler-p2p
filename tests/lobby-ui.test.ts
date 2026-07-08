import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyUI } from "../src/ui/LobbyUI";
import type { PlayerProfile } from "../src/ui/Profile";
import { DEFAULT_LOADOUT } from "../src/game/loadout/Loadout";

function createProfile(): PlayerProfile {
  return {
    clientId: "client-test",
    name: "Tester",
    color: "#18dff5",
    showNames: true,
    loadout: DEFAULT_LOADOUT,
  };
}

describe("lobby loadout menu", () => {
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  it("renders equipment slots and commits edited loadout from setup", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), {
      hostPrivate: vi.fn(),
      hostPublic: vi.fn(),
      joinRoom: vi.fn(),
      refreshPublicRooms: vi.fn(),
      startOffline,
      leaveSession: vi.fn(),
      endServer: vi.fn(),
      kickPeer: vi.fn(),
      banPeer: vi.fn(),
    });

    ui.showSetup();

    expect(root.querySelector('[data-loadout-slot="frontStrap"]')?.textContent).toContain("Wings");
    expect(root.querySelector('[data-loadout-slot="backStrap"]')?.textContent).toContain("Death Aura");
    expect(root.querySelectorAll("[data-loadout-leg-slot]")).toHaveLength(2);
    expect(root.querySelector("[data-loadout-search]")).toBeInstanceOf(HTMLInputElement);

    root.querySelector<HTMLButtonElement>('[data-loadout-item="machete"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-loadout-slot="rightHand"]')?.click();
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        leftHand: "pistol",
        rightHand: "machete",
        frontStrap: "wings",
      }),
    }));
  });
});
