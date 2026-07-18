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

function createActions(overrides: Partial<ConstructorParameters<typeof LobbyUI>[2]> = {}): ConstructorParameters<typeof LobbyUI>[2] {
  return {
    hostPrivate: vi.fn(),
    hostPublic: vi.fn(),
    joinRoom: vi.fn(),
    refreshPublicRooms: vi.fn(),
    startOffline: vi.fn(),
    leaveSession: vi.fn(),
    endServer: vi.fn(),
    kickPeer: vi.fn(),
    banPeer: vi.fn(),
    updateProfile: vi.fn(),
    ...overrides,
  };
}

function dataTransferWithItem(weaponId: string): DataTransfer {
  const data = new Map<string, string>();
  data.set("application/x-pixel-weapon", weaponId);
  data.set("text/plain", weaponId);
  return {
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: ["application/x-pixel-weapon", "text/plain"],
    clearData: (format?: string) => {
      if (format) {
        data.delete(format);
      } else {
        data.clear();
      }
    },
    getData: (format: string) => data.get(format) ?? "",
    setData: (format: string, value: string) => data.set(format, value),
    setDragImage: () => undefined,
  };
}

function dispatchDrop(target: Element, weaponId: string): void {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransferWithItem(weaponId) });
  target.dispatchEvent(event);
}

function dispatchContextMenu(target: Element): void {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

describe("lobby loadout menu", () => {
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  it("renders empty equipment slots and only fills starter gear through the explicit default button", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    expect(root.querySelector('[data-loadout-view="front"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[data-loadout-view="back"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Front");
    expect(root.querySelector('[data-loadout-drop-slot="backStrap"]')?.textContent).toContain("Back");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");
    expect(root.textContent).not.toContain("Virgin Blood cannot attach");
    expect(root.querySelectorAll('[data-loadout-view="front"] [data-loadout-drop-slot="leftHand"], [data-loadout-view="front"] [data-loadout-drop-slot="rightHand"]')).toHaveLength(1);
    expect(root.querySelector('[data-loadout-view="front"] [data-loadout-drop-slot="attachment"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[data-loadout-view="front"] .loadout-attachment-string')).toBeInstanceOf(HTMLElement);
    expect(root.querySelectorAll('[data-loadout-view="back"] [data-loadout-drop-slot]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-loadout-view="front"] [data-loadout-drop-slot="legs"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-loadout-view="back"] [data-loadout-drop-slot="legs"]')).toHaveLength(0);
    expect(root.querySelectorAll("[data-loadout-category]")).toHaveLength(0);
    expect(root.querySelector("[data-loadout-search]")).toBeInstanceOf(HTMLInputElement);
    expect(root.querySelector('[data-loadout-item="super-legs"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-loadout-item="cross"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-loadout-item="moon"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-loadout-item="jupiter"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-loadout-item="uranus"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-loadout-item="mars"]')).toBeInstanceOf(HTMLButtonElement);

    root.querySelector<HTMLButtonElement>("[data-loadout-default]")?.click();
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Wings");
    expect(root.querySelector('[data-loadout-drop-slot="backStrap"]')?.textContent).toContain("Death Aura");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Knife");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "machete");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        leftHand: "machete",
        rightHand: "machete",
        frontStrap: "wings",
      }),
    }));
  });

  it("equips every visible X only through valid drag and drop", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "death-aura");
    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "wings");
    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "rocket");
    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "virgin-blood");
    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "super-legs");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        frontStrap: "death-aura",
        backStrap: "wings",
        leftHand: "rocket",
        rightHand: "rocket",
        attachment: "virgin-blood",
        legs: "super-legs",
      }),
    }));
  });

  it("equips The Moon only on front or back strap slots", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "moon");
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("The Moon");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "moon");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("The Moon");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "moon");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("The Moon");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "moon");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("The Moon");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "moon");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        frontStrap: "moon",
        backStrap: "moon",
      }),
    }));
  });

  it("equips Jupiter only on front or back strap slots", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "jupiter");
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Jupiter");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "jupiter");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Jupiter");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "jupiter");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Jupiter");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "jupiter");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Jupiter");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "jupiter");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        frontStrap: "jupiter",
        backStrap: "jupiter",
      }),
    }));
  });

  it("equips Uranus only on front or back strap slots", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "uranus");
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Uranus");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "uranus");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Uranus");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "uranus");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Uranus");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "uranus");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Uranus");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "uranus");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        frontStrap: "uranus",
        backStrap: "uranus",
      }),
    }));
  });

  it("equips Mars only on front or back strap slots", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "mars");
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Mars");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "mars");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Mars");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "mars");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Mars");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "mars");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Mars");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "mars");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();

    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({
        frontStrap: "mars",
        backStrap: "mars",
      }),
    }));
  });

  it("rejects invalid item drops with visible feedback", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const ui = new LobbyUI(root, createProfile(), createActions());

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="backStrap"]'), "pistol");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Pistol");
    expect(root.querySelector('[data-loadout-drop-slot="backStrap"]')?.textContent).toContain("Back");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="attachment"]'), "wings");

    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Wings");
    expect(root.querySelector('[data-loadout-drop-slot="attachment"]')?.textContent).toContain("F");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "death-aura");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Death Aura");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="frontStrap"]'), "cross");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Cross");
    expect(root.querySelector('[data-loadout-drop-slot="frontStrap"]')?.textContent).toContain("Front");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "super-legs");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Super Legs");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="legs"]'), "rocket");
    expect(root.querySelector("[data-loadout-error]")?.textContent).toContain("Rocket");
    expect(root.querySelector('[data-loadout-drop-slot="legs"]')?.textContent).toContain("Legs");
  });

  it("clears equipped slots without restoring pre-filled defaults", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const startOffline = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ startOffline }));

    ui.showSetup();

    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "machete");
    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Machete");
    dispatchContextMenu(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'));

    expect(root.querySelector('[data-loadout-drop-slot="rightHand"]')?.textContent).toContain("Hand");
    root.querySelector<HTMLButtonElement>("[data-offline]")?.click();
    expect(startOffline).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.not.objectContaining({
        leftHand: expect.any(String),
        rightHand: expect.any(String),
      }),
    }));
  });

  it("opens character creator from pause and applies live profile edits back to the game", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const updateProfile = vi.fn();
    const ui = new LobbyUI(root, createProfile(), createActions({ updateProfile }));
    const session = {
      mode: "offline" as const,
      isHost: true,
      localPeerId: "local",
      hostName: "Tester",
      peers: [],
    };

    ui.showGame(session);
    ui.showPause(session, "client-test");
    root.querySelector<HTMLButtonElement>("[data-edit-character]")?.click();

    expect(root.querySelector('[data-loadout-view="front"]')).toBeInstanceOf(HTMLElement);
    dispatchDrop(requireTarget(root, '[data-loadout-drop-slot="rightHand"]'), "virgin-blood");
    root.querySelector<HTMLButtonElement>("[data-return-game]")?.click();

    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      loadout: expect.objectContaining({ leftHand: "virgin-blood", rightHand: "virgin-blood" }),
    }));
    expect(root.querySelector(".menu-overlay")?.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector(".game-hud")?.hasAttribute("hidden")).toBe(false);
  });
});

function requireTarget(root: ParentNode, selector: string): Element {
  const target = root.querySelector(selector);
  if (!target) {
    throw new Error(`Missing test target: ${selector}`);
  }
  return target;
}
