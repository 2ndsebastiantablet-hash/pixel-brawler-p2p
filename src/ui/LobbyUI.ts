import type { ConnectionStatus } from "../net/WebRTCClient";
import type { RoomSummary } from "../net/NetTypes";

interface LobbyActions {
  hostPrivate: () => void;
  hostPublic: () => void;
  joinPrivate: (code: string) => void;
  refreshPublicRooms: () => void;
  startOffline: () => void;
}

export class LobbyUI {
  private readonly statusValue: HTMLElement;
  private readonly roomCodeValue: HTMLElement;
  private readonly publicRoomsList: HTMLElement;
  private readonly joinInput: HTMLInputElement;

  constructor(parent: HTMLElement, private readonly actions: LobbyActions) {
    const shell = document.createElement("section");
    shell.className = "lobby-panel";
    shell.innerHTML = `
      <div class="panel-header">
        <div>
          <h1>pixel-brawler-p2p</h1>
          <p>Fast pixel platform brawler prototype</p>
        </div>
      </div>
      <div class="status-row">
        <span>Status</span>
        <strong data-status>Offline</strong>
      </div>
      <div class="status-row">
        <span>Room</span>
        <strong data-room-code>-</strong>
      </div>
      <div class="button-grid">
        <button type="button" data-host-private>Host Private Room</button>
        <button type="button" data-host-public>Host Public Room</button>
        <button type="button" data-offline>Start Offline Test</button>
      </div>
      <form class="join-row" data-join-form>
        <input data-join-code maxlength="8" placeholder="Room code" autocomplete="off" />
        <button type="submit">Join</button>
      </form>
      <div class="public-header">
        <span>Public Rooms</span>
        <button type="button" data-refresh>Refresh</button>
      </div>
      <div class="public-list" data-public-list></div>
    `;

    parent.append(shell);
    this.statusValue = requireElement(shell, "[data-status]");
    this.roomCodeValue = requireElement(shell, "[data-room-code]");
    this.publicRoomsList = requireElement(shell, "[data-public-list]");
    this.joinInput = requireElement<HTMLInputElement>(shell, "[data-join-code]");

    requireElement(shell, "[data-host-private]").addEventListener("click", () => this.actions.hostPrivate());
    requireElement(shell, "[data-host-public]").addEventListener("click", () => this.actions.hostPublic());
    requireElement(shell, "[data-offline]").addEventListener("click", () => this.actions.startOffline());
    requireElement(shell, "[data-refresh]").addEventListener("click", () => this.actions.refreshPublicRooms());
    requireElement(shell, "[data-join-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const code = this.joinInput.value.trim().toUpperCase();
      if (code) {
        this.actions.joinPrivate(code);
      }
    });
  }

  setStatus(status: ConnectionStatus): void {
    this.statusValue.textContent = status;
  }

  setRoomCode(code: string | null): void {
    this.roomCodeValue.textContent = code || "-";
    if (code) {
      this.joinInput.value = code;
    }
  }

  setPublicRooms(rooms: RoomSummary[]): void {
    this.publicRoomsList.replaceChildren();
    if (rooms.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No public rooms yet.";
      this.publicRoomsList.append(empty);
      return;
    }

    for (const room of rooms) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "public-room";
      row.innerHTML = `<strong>${room.code}</strong><span>${room.peers}/2 peers</span>`;
      row.addEventListener("click", () => this.actions.joinPrivate(room.code));
      this.publicRoomsList.append(row);
    }
  }

  showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(message);
    this.setStatus("Disconnected / failed");
  }
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing UI element: ${selector}`);
  }
  return element;
}
