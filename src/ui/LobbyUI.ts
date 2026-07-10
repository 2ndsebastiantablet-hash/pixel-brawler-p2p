import type { PeerInfo, RoomSummary } from "../net/NetTypes";
import { MAX_ROOM_PLAYERS } from "../net/RoomConfig";
import type { ConnectionStatus } from "../net/WebRTCClient";
import {
  PLAYER_COLORS,
  savePlayerProfile,
  type PlayerProfile,
} from "./Profile";
import { playSound } from "../audio/SoundSystem";
import {
  LOADOUT_ITEMS,
  LOADOUT_SLOT_LABELS,
  STARTER_LOADOUT,
  assignHeldLoadoutItem,
  assignLoadoutItem,
  clearLoadoutSlot,
  isSlotCompatible,
  loadoutWeaponName,
  normalizeLoadout,
  type LoadoutCategory,
  type LoadoutSlotId,
} from "../game/loadout/Loadout";
import type { WeaponId } from "../game/combat/Weapon";

export interface SessionView {
  mode: "offline" | "private" | "public";
  isHost: boolean;
  localPeerId: string;
  roomCode?: string;
  serverName?: string;
  hostName?: string;
  peers: PeerInfo[];
}

interface LobbyActions {
  hostPrivate: (profile: PlayerProfile) => void;
  hostPublic: (profile: PlayerProfile, serverName: string) => void;
  joinRoom: (profile: PlayerProfile, code: string) => void;
  refreshPublicRooms: () => void;
  startOffline: (profile: PlayerProfile) => void;
  leaveSession: () => void;
  endServer: () => void;
  kickPeer: (peer: PeerInfo) => void;
  banPeer: (peer: PeerInfo) => void;
  updateProfile: (profile: PlayerProfile) => void;
}

type MenuScreen = "controls" | "main" | "setup" | "host" | "join" | "game";
type SetupMode = "lobby" | "game";

export class LobbyUI {
  private readonly menu = document.createElement("section");
  private readonly hud = document.createElement("section");
  private readonly pause = document.createElement("section");
  private screen: MenuScreen = "main";
  private publicRooms: RoomSummary[] = [];
  private selectedColor: string;
  private selectedLoadoutItem: WeaponId = "pistol";
  private selectedLoadoutCategory: LoadoutCategory = "all";
  private cancelLoadoutPointerDrag: (() => void) | null = null;
  private status: ConnectionStatus | string = "Offline";
  private session: SessionView | null = null;
  private pauseOpen = false;
  private localClientId = "";

  constructor(
    parent: HTMLElement,
    private profile: PlayerProfile,
    private readonly actions: LobbyActions,
  ) {
    const initialLoadout = normalizeLoadout(profile.loadout);
    this.profile = { ...profile, loadout: initialLoadout };
    this.selectedColor = profile.color;
    this.selectedLoadoutItem = initialLoadout.leftHand ?? "pistol";
    this.menu.className = "menu-overlay";
    this.hud.className = "game-hud";
    this.pause.className = "pause-overlay";
    this.hud.hidden = true;
    this.pause.hidden = true;
    parent.append(this.menu, this.hud, this.pause);
    this.menu.addEventListener("pointerover", this.handleMenuHover);
    this.menu.addEventListener("click", this.handleMenuClick);
    this.showControls();
  }

  getProfile(): PlayerProfile {
    return this.profile;
  }

  showMain(message?: string): void {
    this.screen = "main";
    this.session = null;
    this.pauseOpen = false;
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.pause.hidden = true;
    if (message) {
      this.status = message;
    }

    const panel = document.createElement("div");
    panel.className = "menu-panel menu-main";
    panel.innerHTML = `
      <div class="game-title">pixel-brawler-p2p</div>
      <p class="game-subtitle">Fast pixel platform brawler prototype</p>
      <button type="button" class="primary-action" data-play>Play</button>
      <p class="menu-status" data-status></p>
    `;
    requireElement(panel, "[data-play]").addEventListener("click", () => this.showSetup());
    requireElement(panel, "[data-status]").textContent = this.status;
    this.menu.replaceChildren(panel);
  }

  showSetup(mode: SetupMode = "lobby"): void {
    this.renderCharacterSetup(mode);
  }

  showHost(): void {
    this.screen = "host";
    const panel = document.createElement("div");
    panel.className = "menu-panel setup-panel";
    panel.innerHTML = `
      <div class="panel-heading">
        <h1>Host Server</h1>
        <button type="button" class="ghost-action" data-back>Back</button>
      </div>
      <label class="field-label" for="server-name">Public server name</label>
      <input id="server-name" class="text-input" data-server-name maxlength="28" autocomplete="off" />
      <div class="menu-actions">
        <button type="button" data-host-private>Host Private Server</button>
        <button type="button" data-host-public>Host Public Server</button>
      </div>
      <p class="menu-status" data-status></p>
    `;

    this.menu.replaceChildren(panel);
    const serverName = requireElement<HTMLInputElement>(panel, "[data-server-name]");
    serverName.value = defaultServerName(this.profile.name);
    requireElement(panel, "[data-back]").addEventListener("click", () => this.showSetup());
    requireElement(panel, "[data-host-private]").addEventListener("click", () => {
      this.actions.hostPrivate(this.profile);
    });
    requireElement(panel, "[data-host-public]").addEventListener("click", () => {
      this.actions.hostPublic(this.profile, serverName.value);
    });
    requireElement(panel, "[data-status]").textContent = this.status;
  }

  showJoin(refresh = false): void {
    this.screen = "join";
    const panel = document.createElement("div");
    panel.className = "menu-panel join-panel";
    panel.innerHTML = `
      <div class="panel-heading">
        <h1>Join Server</h1>
        <button type="button" class="ghost-action" data-back>Back</button>
      </div>
      <form class="join-code-row" data-join-form>
        <input class="text-input" data-join-code maxlength="8" placeholder="Room code" autocomplete="off" />
        <button type="submit">Join</button>
      </form>
      <div class="public-header">
        <span>Public Servers</span>
        <button type="button" class="ghost-action" data-refresh>Refresh</button>
      </div>
      <div class="public-list" data-public-list></div>
      <p class="menu-status" data-status></p>
    `;

    this.menu.replaceChildren(panel);
    const joinInput = requireElement<HTMLInputElement>(panel, "[data-join-code]");
    requireElement(panel, "[data-back]").addEventListener("click", () => this.showSetup());
    requireElement(panel, "[data-refresh]").addEventListener("click", () => this.actions.refreshPublicRooms());
    requireElement(panel, "[data-join-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const code = joinInput.value.trim().toUpperCase();
      if (code) {
        this.actions.joinRoom(this.profile, code);
      }
    });
    requireElement(panel, "[data-status]").textContent = this.status;
    this.renderPublicRooms(requireElement(panel, "[data-public-list]"));
    if (refresh) {
      this.actions.refreshPublicRooms();
    }
  }

  showGame(session: SessionView): void {
    this.screen = "game";
    this.session = session;
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.pause.hidden = !this.pauseOpen;
    this.renderHud();
    if (this.pauseOpen && this.localClientId) {
      this.renderPause();
    }
  }

  updateSession(session: SessionView): void {
    this.session = session;
    if (this.screen === "game") {
      this.renderHud();
      if (this.pauseOpen) {
        this.renderPause();
      }
    }
  }

  setStatus(status: ConnectionStatus | string): void {
    this.status = status;
    const statusElement = this.menu.querySelector("[data-status]");
    if (statusElement) {
      statusElement.textContent = status;
    }
    this.renderHud();
  }

  setPublicRooms(rooms: RoomSummary[]): void {
    this.publicRooms = rooms;
    if (this.screen === "join") {
      this.showJoin(false);
    }
  }

  setShowNames(show: boolean): PlayerProfile {
    this.profile = savePlayerProfile({ ...this.profile, showNames: show });
    return this.profile;
  }

  showControls(): void {
    this.screen = "controls";
    this.session = null;
    this.pauseOpen = false;
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.pause.hidden = true;

    const panel = document.createElement("div");
    panel.className = "menu-panel controls-panel";
    panel.innerHTML = `
      <div class="game-title">pixel-brawler-p2p</div>
      <p class="game-subtitle">Controls</p>
      <div class="keyboard-map" aria-label="Keyboard controls">
        ${controlKey("A", "Move left")}
        ${controlKey("D", "Move right")}
        ${controlKey("Space", "Jump / Double Jump", "wide-key")}
        ${controlKey("Shift", "Dash / Slide / Air Dive", "wide-key")}
        ${controlKey("S", "Duck / Low Slide / Ground Slam")}
        ${controlKey("R", "Reload / Recall / Cancel")}
        ${controlKey("Q", "Front Strap")}
        ${controlKey("E", "Back Strap")}
        ${controlKey("F", "Attachment / Pick Up")}
        ${controlKey("G", "Drop Active")}
        ${controlKey("N", "Toggle Names")}
        ${controlKey("Esc", "Server Info / Leave", "wide-key")}
      </div>
      <div class="mouse-map">
        <div><span class="mouse-icon">Mouse</span><strong>Aim</strong></div>
        <div><span class="mouse-icon">Left</span><strong>Left Hand</strong></div>
        <div><span class="mouse-icon">Right</span><strong>Right Hand / Two-Hand Special</strong></div>
      </div>
      <button type="button" class="primary-action" data-continue>Continue</button>
      <p class="menu-status">Press any key or click to continue.</p>
    `;
    this.menu.replaceChildren(panel);
    const continueToMenu = (): void => {
      window.removeEventListener("keydown", handleAnyKey);
      playSound("loading-continue");
      this.showMain();
    };
    const handleAnyKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      continueToMenu();
    };
    requireElement(panel, "[data-continue]").addEventListener("click", continueToMenu, { once: true });
    window.addEventListener("keydown", handleAnyKey, { once: true });
  }

  private readonly handleMenuHover = (event: Event): void => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      playSound("menu-hover");
    }
  };

  private readonly handleMenuClick = (event: Event): void => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      playSound("menu-click");
    }
  };

  togglePause(session: SessionView, localClientId: string): void {
    if (this.pauseOpen) {
      this.hidePause();
    } else {
      this.showPause(session, localClientId);
    }
  }

  showPause(session: SessionView, localClientId: string): void {
    this.session = session;
    this.localClientId = localClientId;
    this.pauseOpen = true;
    this.pause.hidden = false;
    this.renderPause();
  }

  hidePause(): void {
    this.pauseOpen = false;
    this.pause.hidden = true;
    this.pause.replaceChildren();
  }

  showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(message);
    this.setStatus(message || "Disconnected / failed");
  }

  private renderCharacterSetup(mode: SetupMode): void {
    this.screen = "setup";
    this.menu.hidden = false;
    this.hud.hidden = mode === "lobby";
    this.pause.hidden = true;
    this.pauseOpen = false;

    const panel = document.createElement("div");
    panel.className = "menu-panel setup-panel";
    panel.innerHTML = `
      <div class="panel-heading">
        <h1>Player Setup</h1>
        <button type="button" class="ghost-action" ${mode === "game" ? "data-return-game" : "data-back"}>${mode === "game" ? "Return to Game" : "Back"}</button>
      </div>
      <div class="setup-layout">
        <div class="setup-profile-column">
          <label class="field-label" for="player-name">Name</label>
          <input id="player-name" class="text-input" data-player-name maxlength="18" autocomplete="off" />
          <div class="field-label">Color</div>
          <div class="color-grid" data-color-grid></div>
        </div>
        <aside class="loadout-panel" data-loadout-panel>
          <div class="loadout-stage" data-loadout-preview></div>
          <p class="loadout-error" data-loadout-error aria-live="polite"></p>
          <div class="loadout-filters">
            <input class="text-input" data-loadout-search placeholder="Search items" autocomplete="off" />
            <button type="button" class="ghost-action" data-loadout-default>Use Default Loadout</button>
          </div>
          <div class="loadout-items" data-loadout-items></div>
        </aside>
      </div>
      <div class="menu-actions three-actions" ${mode === "game" ? "hidden" : ""}>
        <button type="button" data-host>Host</button>
        <button type="button" data-join>Join</button>
        <button type="button" data-offline>Offline Test</button>
      </div>
      <p class="menu-status" data-status></p>
    `;

    this.menu.replaceChildren(panel);
    this.bindProfileControls(panel);
    this.bindLoadoutControls(panel);
    if (mode === "game") {
      requireElement(panel, "[data-return-game]").addEventListener("click", () => {
        const nextProfile = this.commitProfile();
        this.actions.updateProfile(nextProfile);
        if (this.session) {
          this.showGame(this.session);
        }
      });
    } else {
      requireElement(panel, "[data-back]").addEventListener("click", () => this.showMain());
      requireElement(panel, "[data-host]").addEventListener("click", () => {
        this.commitProfile();
        this.showHost();
      });
      requireElement(panel, "[data-join]").addEventListener("click", () => {
        this.commitProfile();
        this.showJoin(true);
      });
      requireElement(panel, "[data-offline]").addEventListener("click", () => {
        this.actions.startOffline(this.commitProfile());
      });
    }
    requireElement(panel, "[data-status]").textContent = this.status;
  }

  private bindProfileControls(root: HTMLElement): void {
    const nameInput = requireElement<HTMLInputElement>(root, "[data-player-name]");
    const colorGrid = requireElement(root, "[data-color-grid]");
    nameInput.value = this.profile.name;
    colorGrid.replaceChildren();

    for (const color of PLAYER_COLORS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = `color-swatch${color === this.selectedColor ? " is-selected" : ""}`;
      swatch.style.setProperty("--swatch", color);
      swatch.setAttribute("aria-label", `Select ${color}`);
      swatch.addEventListener("click", () => {
        this.selectedColor = color;
        for (const button of colorGrid.querySelectorAll(".color-swatch")) {
          button.classList.toggle("is-selected", button === swatch);
        }
        if (root.querySelector("[data-loadout-preview]")) {
          this.renderLoadoutPreview(root);
        }
      });
      colorGrid.append(swatch);
    }
  }

  private bindLoadoutControls(root: HTMLElement): void {
    this.profile = { ...this.profile, loadout: normalizeLoadout(this.profile.loadout) };
    this.renderLoadoutPreview(root);
    if (root.querySelector("[data-loadout-slots]")) {
      this.renderLoadoutSlots(root);
    }
    this.renderLoadoutItems(root);

    const search = requireElement<HTMLInputElement>(root, "[data-loadout-search]");
    search.addEventListener("input", () => this.renderLoadoutItems(root));
    requireElement(root, "[data-loadout-default]").addEventListener("click", () => {
      const loadout = normalizeLoadout(STARTER_LOADOUT);
      this.profile = { ...this.profile, loadout };
      this.selectedLoadoutItem = loadout.leftHand ?? "pistol";
      this.refreshLoadoutEditor(root);
    });
  }

  private renderLoadoutPreview(root: HTMLElement): void {
    const preview = requireElement(root, "[data-loadout-preview]");
    preview.replaceChildren();
    const views = document.createElement("div");
    views.className = "loadout-views";
    views.append(
      this.createLoadoutView(root, "front", [
        { slot: "frontStrap", label: "Front", className: "front-strap" },
        { slot: "rightHand", label: "Hand", className: "hand" },
        { slot: "attachment", label: "F", className: "attachment" },
        { slot: "legs", label: "Legs", className: "left-leg" },
      ]),
      this.createLoadoutView(root, "back", [
        { slot: "backStrap", label: "Back", className: "back-strap" },
      ]),
    );
    preview.append(views);
  }

  private createLoadoutView(
    root: HTMLElement,
    view: "front" | "back",
    targets: Array<{ slot: LoadoutSlotId; label: string; className: string }>,
  ): HTMLElement {
    const figure = document.createElement("div");
    figure.className = `loadout-view ${view}`;
    figure.dataset.loadoutView = view;
    figure.style.setProperty("--player-color", this.selectedColor);
    if (normalizeLoadout(this.profile.loadout).legs === "super-legs") {
      figure.classList.add("has-super-legs");
    }

    const title = document.createElement("div");
    title.className = "loadout-view-title";
    title.textContent = view;
    figure.append(title);

    for (const part of ["head", "torso", "left-arm", "right-arm", "left-leg", "right-leg", "harness"] as const) {
      const node = document.createElement("span");
      node.className = `loadout-figure-${part}`;
      figure.append(node);
    }

    for (const target of targets) {
      if (target.slot === "attachment") {
        const string = document.createElement("span");
        string.className = "loadout-attachment-string";
        figure.append(string);
      }
      figure.append(this.createLoadoutDropTarget(root, target.slot, target.label, target.className));
    }

    return figure;
  }

  private createLoadoutDropTarget(root: HTMLElement, slot: LoadoutSlotId, label: string, className: string): HTMLButtonElement {
    const loadout = normalizeLoadout(this.profile.loadout);
    const weaponId = loadout[slot];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `loadout-x-target ${className}`;
    button.dataset.loadoutDropSlot = slot;
    button.title = `${slot === "rightHand" ? "Hand" : LOADOUT_SLOT_LABELS[slot]}: ${loadoutWeaponName(weaponId)}`;
    button.draggable = Boolean(weaponId);

    const marker = document.createElement("span");
    marker.className = "loadout-x";
    marker.textContent = "X";
    const value = document.createElement("strong");
    value.textContent = weaponId ? loadoutWeaponName(weaponId) : label;
    button.append(marker, value);

    button.addEventListener("dragstart", (event) => {
      if (!weaponId || !event.dataTransfer) {
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-pixel-weapon", weaponId);
      event.dataTransfer.setData("text/plain", weaponId);
    });
    button.addEventListener("dragover", (event) => {
      const weapon = readDraggedWeapon(event);
      if (!weapon) {
        return;
      }
      event.preventDefault();
      button.classList.toggle("is-valid-drop", isSlotCompatible(weapon, slot));
      button.classList.toggle("is-invalid-drop", !isSlotCompatible(weapon, slot));
    });
    button.addEventListener("dragleave", () => {
      button.classList.remove("is-valid-drop", "is-invalid-drop");
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("is-valid-drop", "is-invalid-drop");
      const weapon = readDraggedWeapon(event);
      if (weapon) {
        this.assignLoadoutDrop(root, slot, weapon, button);
      }
    });
    if (weaponId) {
      button.addEventListener("pointerdown", (event) => this.startLoadoutPointerDrag(root, event, weaponId, button));
    }
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!weaponId) {
        return;
      }
      this.profile = {
        ...this.profile,
        loadout: clearLoadoutSlot(this.profile.loadout ?? {}, slot),
      };
      const error = root.querySelector("[data-loadout-error]");
      if (error) {
        error.textContent = "";
      }
      this.refreshLoadoutEditor(root);
    });

    return button;
  }

  private assignLoadoutDrop(root: HTMLElement, slot: LoadoutSlotId, weaponId: WeaponId, target: HTMLElement): void {
    if (!isSlotCompatible(weaponId, slot)) {
      this.showLoadoutError(root, target, `${loadoutWeaponName(weaponId)} cannot attach to ${LOADOUT_SLOT_LABELS[slot]}.`);
      return;
    }
    this.profile = {
      ...this.profile,
      loadout: slot === "rightHand"
        ? assignHeldLoadoutItem(this.profile.loadout ?? {}, weaponId)
        : assignLoadoutItem(this.profile.loadout ?? {}, slot, weaponId),
    };
    this.selectedLoadoutItem = weaponId;
    const error = root.querySelector("[data-loadout-error]");
    if (error) {
      error.textContent = "";
    }
    this.refreshLoadoutEditor(root);
  }

  private showLoadoutError(root: HTMLElement, target: HTMLElement, message: string): void {
    const error = root.querySelector("[data-loadout-error]");
    if (error) {
      error.textContent = message;
    }
    target.classList.remove("is-invalid-drop");
    void target.offsetWidth;
    target.classList.add("is-invalid-drop");
  }

  private refreshLoadoutEditor(root: HTMLElement): void {
    this.renderLoadoutPreview(root);
    if (root.querySelector("[data-loadout-slots]")) {
      this.renderLoadoutSlots(root);
    }
    this.renderLoadoutItems(root);
  }

  private renderLoadoutSlots(root: HTMLElement): void {
    const container = requireElement(root, "[data-loadout-slots]");
    const loadout = normalizeLoadout(this.profile.loadout);
    container.replaceChildren();
    for (const slot of ["frontStrap", "backStrap", "leftHand", "rightHand", "attachment", "legs"] as LoadoutSlotId[]) {
      const weaponId = loadout[slot];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "loadout-slot";
      button.dataset.loadoutSlot = slot;
      button.disabled = !isSlotCompatible(this.selectedLoadoutItem, slot);
      const label = document.createElement("span");
      label.textContent = LOADOUT_SLOT_LABELS[slot];
      const value = document.createElement("strong");
      value.textContent = loadoutWeaponName(weaponId);
      button.append(label, value);
      button.addEventListener("click", () => {
        this.profile = {
          ...this.profile,
          loadout: assignLoadoutItem(loadout, slot, this.selectedLoadoutItem),
        };
        this.renderLoadoutPreview(root);
        this.renderLoadoutSlots(root);
        this.renderLoadoutItems(root);
      });
      container.append(button);
    }
  }

  private renderLoadoutCategories(root: HTMLElement): void {
    const container = root.querySelector("[data-loadout-categories]");
    if (!container) {
      return;
    }
    container.replaceChildren();
    const categories: Array<{ id: LoadoutCategory; label: string }> = [
      { id: "all", label: "All" },
      { id: "guns", label: "Guns" },
      { id: "blades", label: "Blades" },
      { id: "heavy", label: "Heavy" },
      { id: "throwables", label: "Throw" },
      { id: "body", label: "Body" },
      { id: "mobility", label: "Move" },
      { id: "summons", label: "Summon" },
      { id: "consumables", label: "Items" },
      { id: "utility", label: "Utility" },
    ];
    for (const category of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.loadoutCategory = category.id;
      button.className = category.id === this.selectedLoadoutCategory ? "is-selected" : "";
      button.textContent = category.label;
      button.addEventListener("click", () => {
        this.selectedLoadoutCategory = category.id;
        this.renderLoadoutCategories(root);
        this.renderLoadoutItems(root);
      });
      container.append(button);
    }
  }

  private renderLoadoutItems(root: HTMLElement): void {
    const container = requireElement(root, "[data-loadout-items]");
    const search = root.querySelector<HTMLInputElement>("[data-loadout-search]")?.value.trim().toLowerCase() ?? "";
    container.replaceChildren();
    const items = LOADOUT_ITEMS.filter((item) => {
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.summary.toLowerCase().includes(search);
      return matchesSearch;
    });

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `loadout-item${item.id === this.selectedLoadoutItem ? " is-selected" : ""}`;
      button.dataset.loadoutItem = item.id;
      button.draggable = true;
      button.title = item.summary;
      const swatch = document.createElement("span");
      swatch.className = "loadout-item-swatch";
      swatch.style.backgroundColor = colorForLoadoutItem(item.id);
      const text = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = item.name;
      const meta = document.createElement("small");
      const slotLabels = item.compatibleSlots.map((slot) => LOADOUT_SLOT_LABELS[slot].split(" ")[0]).join("/");
      meta.textContent = `${item.handedness} ${slotLabels}`;
      const summary = document.createElement("small");
      summary.className = "loadout-item-summary";
      summary.textContent = item.summary;
      text.append(strong, meta, summary);
      button.append(swatch, text);
      button.addEventListener("dragstart", (event) => {
        if (!event.dataTransfer) {
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-pixel-weapon", item.id);
        event.dataTransfer.setData("text/plain", item.id);
      });
      button.addEventListener("pointerdown", (event) => this.startLoadoutPointerDrag(root, event, item.id, button));
      button.addEventListener("click", () => {
        this.selectedLoadoutItem = item.id;
        if (root.querySelector("[data-loadout-slots]")) {
          this.renderLoadoutSlots(root);
        }
        this.renderLoadoutItems(root);
      });
      container.append(button);
    }

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No matching items.";
      container.append(empty);
    }
  }

  private startLoadoutPointerDrag(root: HTMLElement, event: PointerEvent, weaponId: WeaponId, source: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }

    this.cancelLoadoutPointerDrag?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalDraggable = source.draggable;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    let currentTarget: HTMLElement | null = null;

    source.draggable = false;
    try {
      source.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been captured by the browser drag system.
    }

    const setCurrentTarget = (target: HTMLElement | null): void => {
      if (target === currentTarget) {
        return;
      }
      currentTarget?.classList.remove("is-valid-drop", "is-invalid-drop");
      currentTarget = target;
      if (!currentTarget) {
        return;
      }
      const slot = loadoutSlotFromTarget(currentTarget);
      if (!slot) {
        return;
      }
      const compatible = isSlotCompatible(weaponId, slot);
      currentTarget.classList.toggle("is-valid-drop", compatible);
      currentTarget.classList.toggle("is-invalid-drop", !compatible);
    };

    const moveGhost = (clientX: number, clientY: number): void => {
      if (!ghost) {
        return;
      }
      ghost.style.left = `${clientX}px`;
      ghost.style.top = `${clientY}px`;
    };

    const beginDrag = (clientX: number, clientY: number): void => {
      dragging = true;
      source.classList.add("is-drag-source");
      root.classList.add("is-loadout-dragging");
      this.clearLoadoutDropHighlights(root);

      ghost = document.createElement("div");
      ghost.className = "loadout-drag-ghost";
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = colorForLoadoutItem(weaponId);
      const label = document.createElement("strong");
      label.textContent = loadoutWeaponName(weaponId);
      ghost.append(swatch, label);
      document.body.append(ghost);
      moveGhost(clientX, clientY);
    };

    let cleanup = (): void => undefined;

    const onPointerMove = (moveEvent: PointerEvent): void => {
      if (!dragging) {
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (distance < 5) {
          return;
        }
        beginDrag(moveEvent.clientX, moveEvent.clientY);
      }
      moveEvent.preventDefault();
      moveGhost(moveEvent.clientX, moveEvent.clientY);
      setCurrentTarget(this.loadoutDropTargetAt(root, moveEvent.clientX, moveEvent.clientY));
    };

    const onPointerUp = (upEvent: PointerEvent): void => {
      const target = currentTarget;
      const slot = target ? loadoutSlotFromTarget(target) : null;
      const shouldDrop = dragging && target && slot;
      if (dragging) {
        upEvent.preventDefault();
      }
      cleanup();
      if (shouldDrop) {
        this.assignLoadoutDrop(root, slot, weaponId, target);
      }
    };

    const onPointerCancel = (cancelEvent: PointerEvent): void => {
      if (dragging) {
        cancelEvent.preventDefault();
      }
      cleanup();
    };

    cleanup = (): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      source.classList.remove("is-drag-source");
      source.draggable = originalDraggable;
      root.classList.remove("is-loadout-dragging");
      ghost?.remove();
      ghost = null;
      this.clearLoadoutDropHighlights(root);
      if (this.cancelLoadoutPointerDrag === cleanup) {
        this.cancelLoadoutPointerDrag = null;
      }
      try {
        if (source.hasPointerCapture(event.pointerId)) {
          source.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The source may have been re-rendered after a successful drop.
      }
    };

    this.cancelLoadoutPointerDrag = cleanup;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  private loadoutDropTargetAt(root: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-loadout-drop-slot]");
    return target && root.contains(target) ? target : null;
  }

  private clearLoadoutDropHighlights(root: HTMLElement): void {
    for (const target of root.querySelectorAll<HTMLElement>("[data-loadout-drop-slot]")) {
      target.classList.remove("is-valid-drop", "is-invalid-drop");
    }
  }

  private commitProfile(): PlayerProfile {
    const nameInput = this.menu.querySelector<HTMLInputElement>("[data-player-name]");
    this.profile = savePlayerProfile({
      ...this.profile,
      name: nameInput?.value ?? this.profile.name,
      color: this.selectedColor,
      loadout: normalizeLoadout(this.profile.loadout),
    });
    this.selectedColor = this.profile.color;
    return this.profile;
  }

  private renderHud(): void {
    if (!this.session || this.hud.hidden) {
      return;
    }
    this.hud.replaceChildren();

    const left = document.createElement("div");
    left.className = "hud-left";
    const right = document.createElement("div");
    right.className = "hud-right";

    if (this.session.mode === "offline") {
      left.append(createChip("Offline Test"));
    } else if (this.session.mode === "private") {
      left.append(createChip(`Room ${this.session.roomCode ?? "-"} ${this.session.peers.length}/${MAX_ROOM_PLAYERS}`));
    } else {
      right.append(createChip(`${this.session.serverName || "Public Server"} ${this.session.peers.length}/${MAX_ROOM_PLAYERS}`));
    }

    if (this.status !== "Offline") {
      left.append(createChip(String(this.status), "muted"));
    }

    this.hud.append(left, right);
  }

  private renderPublicRooms(container: HTMLElement): void {
    container.replaceChildren();
    if (this.publicRooms.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No public servers yet.";
      container.append(empty);
      return;
    }

    for (const room of this.publicRooms) {
      const row = document.createElement("div");
      row.className = "public-room";

      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = room.serverName || room.code;
      const meta = document.createElement("span");
      const maxPeers = room.maxPeers ?? MAX_ROOM_PLAYERS;
      meta.textContent = `${room.hostName || "Host"} - ${room.peers}/${maxPeers} players`;
      text.append(title, meta);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = room.peers >= maxPeers ? "Full" : "Join";
      button.disabled = room.peers >= maxPeers;
      button.addEventListener("click", () => this.actions.joinRoom(this.profile, room.code));

      row.append(text, button);
      container.append(row);
    }
  }

  private renderPause(): void {
    const session = this.session;
    if (!session) {
      return;
    }

    const panel = document.createElement("div");
    panel.className = "pause-panel";
    panel.innerHTML = `
      <div class="panel-heading">
        <h1></h1>
        <button type="button" class="ghost-action" data-close>Close</button>
      </div>
      <p class="pause-meta" data-meta></p>
      <div class="peer-list" data-peer-list></div>
      <div class="menu-actions" data-actions></div>
    `;

    requireElement(panel, "h1").textContent = session.isHost ? "Host Menu" : "Server Menu";
    requireElement(panel, "[data-meta]").textContent = getSessionLabel(session);
    requireElement(panel, "[data-close]").addEventListener("click", () => this.hidePause());

    const peerList = requireElement(panel, "[data-peer-list]");
    const peers = session.peers.length > 0 ? session.peers : [localPeerFromSession(session, this.profile)];
    for (const peer of peers) {
      peerList.append(this.createPeerRow(peer, session));
    }

    const actions = requireElement(panel, "[data-actions]");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.editCharacter = "true";
    edit.textContent = "Edit Character";
    edit.addEventListener("click", () => {
      this.hidePause();
      this.renderCharacterSetup("game");
    });
    const leave = document.createElement("button");
    leave.type = "button";
    leave.textContent = session.isHost ? "Leave / End Server" : "Leave";
    leave.addEventListener("click", () => {
      if (session.isHost) {
        this.actions.endServer();
      } else {
        this.actions.leaveSession();
      }
    });
    actions.append(edit, leave);

    this.pause.replaceChildren(panel);
  }

  private createPeerRow(peer: PeerInfo, session: SessionView): HTMLElement {
    const row = document.createElement("div");
    row.className = "peer-row";

    const swatch = document.createElement("span");
    swatch.className = "peer-swatch";
    swatch.style.backgroundColor = peer.color;

    const name = document.createElement("div");
    name.className = "peer-name";
    const strong = document.createElement("strong");
    strong.textContent = peer.name || "Player";
    const meta = document.createElement("span");
    const badges = [];
    if (peer.isHost) {
      badges.push("Host");
    }
    if (peer.clientId === this.localClientId || peer.peerId === session.localPeerId) {
      badges.push("You");
    }
    meta.textContent = badges.join(" - ");
    name.append(strong, meta);

    row.append(swatch, name);

    if (session.isHost && peer.clientId !== this.localClientId && peer.peerId !== session.localPeerId) {
      const controls = document.createElement("div");
      controls.className = "peer-controls";
      const kick = document.createElement("button");
      kick.type = "button";
      kick.textContent = "Kick";
      kick.addEventListener("click", () => this.actions.kickPeer(peer));
      const ban = document.createElement("button");
      ban.type = "button";
      ban.textContent = "Ban";
      ban.addEventListener("click", () => this.actions.banPeer(peer));
      controls.append(kick, ban);
      row.append(controls);
    }

    return row;
  }
}

function createChip(text: string, tone = ""): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `hud-chip${tone ? ` ${tone}` : ""}`;
  chip.textContent = text;
  return chip;
}

function controlKey(key: string, label: string, extraClass = ""): string {
  return `
    <div class="key-help ${extraClass}">
      <span class="keycap">${key}</span>
      <strong>${label}</strong>
    </div>
  `;
}

function localPeerFromSession(session: SessionView, profile: PlayerProfile): PeerInfo {
  return {
    peerId: session.localPeerId,
    clientId: profile.clientId,
    name: profile.name,
    color: profile.color,
    isHost: session.isHost,
  };
}

function getSessionLabel(session: SessionView): string {
  if (session.mode === "offline") {
    return `${session.hostName || "Offline Test"}`;
  }
  if (session.mode === "private") {
    return `Room ${session.roomCode ?? "-"} - ${session.peers.length}/${MAX_ROOM_PLAYERS} players`;
  }
  return `${session.serverName || "Public Server"} - ${session.peers.length}/${MAX_ROOM_PLAYERS} players`;
}

function defaultServerName(name: string): string {
  return `${name || "Player"}'s Server`;
}

function colorForLoadoutItem(id: WeaponId): string {
  switch (id) {
    case "slingshot":
      return "#7cff6b";
    case "laser-blaster":
      return "#5ad7ff";
    case "revolver":
      return "#ffd0a6";
    case "minigun":
      return "#ffcf5a";
    case "sniper":
      return "#d6f2ff";
    case "whip":
      return "#f65bd8";
    case "knife":
      return "#d8f0ff";
    case "machete":
      return "#9ee7c3";
    case "axe":
      return "#ffb35c";
    case "wings":
      return "#d9f7ff";
    case "virgin-blood":
      return "#fff4a8";
    case "death-aura":
      return "#08080c";
    case "rocket":
      return "#ff8f3d";
    case "holy-bazooka":
      return "#fff4a8";
    case "grappling-hook":
      return "#5ad7ff";
    case "chainsaw":
      return "#b8bfd7";
    case "spikes":
      return "#f2f2f2";
    case "van":
      return "#f2f2f2";
    case "hands":
      return "#b8ffd0";
    case "super-legs":
      return "#7cff6b";
    case "teleport-ball":
      return "#b096ff";
    case "lightning-rod":
      return "#ffd84d";
    case "sledgehammer":
      return "#ff8f3d";
    case "pistol":
    default:
      return "#ffffff";
  }
}

function readDraggedWeapon(event: DragEvent): WeaponId | null {
  const value = event.dataTransfer?.getData("application/x-pixel-weapon")
    || event.dataTransfer?.getData("text/plain");
  const item = LOADOUT_ITEMS.find((candidate) => candidate.id === value);
  return item?.id ?? null;
}

function loadoutSlotFromTarget(target: HTMLElement): LoadoutSlotId | null {
  const value = target.dataset.loadoutDropSlot;
  if (
    value === "frontStrap"
    || value === "backStrap"
    || value === "leftHand"
    || value === "rightHand"
    || value === "attachment"
    || value === "legs"
  ) {
    return value;
  }
  return null;
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }
  return element;
}
