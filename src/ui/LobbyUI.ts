import type { PeerInfo, RoomSummary } from "../net/NetTypes";
import { MAX_ROOM_PLAYERS } from "../net/RoomConfig";
import type { ConnectionStatus } from "../net/WebRTCClient";
import {
  PLAYER_COLORS,
  savePlayerProfile,
  type PlayerProfile,
} from "./Profile";
import { playSound } from "../audio/SoundSystem";

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
}

type MenuScreen = "controls" | "main" | "setup" | "host" | "join" | "game";

export class LobbyUI {
  private readonly menu = document.createElement("section");
  private readonly hud = document.createElement("section");
  private readonly pause = document.createElement("section");
  private screen: MenuScreen = "main";
  private publicRooms: RoomSummary[] = [];
  private selectedColor: string;
  private status: ConnectionStatus | string = "Offline";
  private session: SessionView | null = null;
  private pauseOpen = false;
  private localClientId = "";

  constructor(
    parent: HTMLElement,
    private profile: PlayerProfile,
    private readonly actions: LobbyActions,
  ) {
    this.selectedColor = profile.color;
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

  showSetup(): void {
    this.screen = "setup";
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.pause.hidden = true;
    this.pauseOpen = false;

    const panel = document.createElement("div");
    panel.className = "menu-panel setup-panel";
    panel.innerHTML = `
      <div class="panel-heading">
        <h1>Player Setup</h1>
        <button type="button" class="ghost-action" data-back>Back</button>
      </div>
      <label class="field-label" for="player-name">Name</label>
      <input id="player-name" class="text-input" data-player-name maxlength="18" autocomplete="off" />
      <div class="field-label">Color</div>
      <div class="color-grid" data-color-grid></div>
      <div class="menu-actions three-actions">
        <button type="button" data-host>Host</button>
        <button type="button" data-join>Join</button>
        <button type="button" data-offline>Offline Test</button>
      </div>
      <p class="menu-status" data-status></p>
    `;

    this.menu.replaceChildren(panel);
    this.bindProfileControls(panel);
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
    requireElement(panel, "[data-status]").textContent = this.status;
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
        ${controlKey("F", "Pick Up")}
        ${controlKey("G", "Drop")}
        ${controlKey("1-0", "Weapon Slots", "wide-key")}
        ${controlKey("Q", "Previous Weapon")}
        ${controlKey("E", "Next Weapon")}
        ${controlKey("N", "Toggle Names")}
        ${controlKey("Esc", "Server Info / Leave", "wide-key")}
      </div>
      <div class="mouse-map">
        <div><span class="mouse-icon">Mouse</span><strong>Aim</strong></div>
        <div><span class="mouse-icon">Left</span><strong>Primary Weapon Use</strong></div>
        <div><span class="mouse-icon">Right</span><strong>Secondary Weapon Use</strong></div>
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
      });
      colorGrid.append(swatch);
    }
  }

  private commitProfile(): PlayerProfile {
    const nameInput = this.menu.querySelector<HTMLInputElement>("[data-player-name]");
    this.profile = savePlayerProfile({
      ...this.profile,
      name: nameInput?.value ?? this.profile.name,
      color: this.selectedColor,
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
    actions.append(leave);

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

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }
  return element;
}
