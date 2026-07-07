import "./style.css";
import "./game/combat/AxeReworkPatch";
import { Game } from "./game/Game";
import type { PeerInfo, SignalMessage } from "./net/NetTypes";
import { SignalingClient } from "./net/SignalingClient";
import { WebRTCClient, type ConnectionStatus } from "./net/WebRTCClient";
import { LobbyUI, type SessionView } from "./ui/LobbyUI";
import { loadPlayerProfile, type PlayerProfile } from "./ui/Profile";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}

const signaling = new SignalingClient();
let profile = loadPlayerProfile();
let rtc: WebRTCClient | null = null;
let currentSession: SessionView | null = null;
let currentStatus: ConnectionStatus | string = "Offline";
let debugOverlayVisible = false;
const debugOverlay = createDebugOverlay();

const game = new Game(root, {
  onLocalState: (packet) => {
    rtc?.sendPlayerState(packet);
  },
  onCombatEvent: (packet) => {
    rtc?.sendCombatEvent(packet);
  },
});
game.setShowNames(profile.showNames);

const ui = new LobbyUI(root, profile, {
  hostPrivate: (nextProfile) => {
    void hostRoom(nextProfile, "private");
  },
  hostPublic: (nextProfile, serverName) => {
    void hostRoom(nextProfile, "public", serverName);
  },
  joinRoom: (nextProfile, code) => {
    void joinRoom(nextProfile, code);
  },
  refreshPublicRooms: () => {
    void refreshPublicRooms();
  },
  startOffline: (nextProfile) => {
    startOffline(nextProfile);
  },
  leaveSession: () => {
    returnToMain("Left server");
  },
  endServer: () => {
    endServer();
  },
  kickPeer: (peer) => {
    kickPeer(peer);
  },
  banPeer: (peer) => {
    banPeer(peer);
  },
});

void refreshPublicRooms();
installDebugHook();

window.addEventListener("keydown", (event) => {
  if (event.code === "F3") {
    event.preventDefault();
    debugOverlayVisible = !debugOverlayVisible;
    debugOverlay.hidden = !debugOverlayVisible;
    renderDebugOverlay();
    return;
  }

  if (!currentSession) {
    return;
  }

  const target = event.target as HTMLElement | null;
  const isTyping = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
  if (event.code === "Escape") {
    event.preventDefault();
    ui.togglePause(currentSession, profile.clientId);
    return;
  }

  if (!isTyping && event.code === "KeyN") {
    event.preventDefault();
    profile = ui.setShowNames(!profile.showNames);
    game.setShowNames(profile.showNames);
  }
});

function startOffline(nextProfile: PlayerProfile): void {
  profile = nextProfile;
  resetRtc();
  game.setShowNames(profile.showNames);
  game.startOffline(profile);
  currentSession = {
    mode: "offline",
    isHost: true,
    localPeerId: "local",
    hostName: profile.name,
    peers: [localPeer("local", true)],
  };
  setStatus("Offline");
  ui.showGame(currentSession);
}

async function hostRoom(
  nextProfile: PlayerProfile,
  visibility: "private" | "public",
  serverName = "",
): Promise<void> {
  try {
    profile = nextProfile;
    resetRtc();
    game.setShowNames(profile.showNames);
    setStatus("Creating room");
    const room = await signaling.createRoom({
      visibility,
      serverName: serverName.trim() || `${profile.name}'s Arena`,
      hostName: profile.name,
      hostColor: profile.color,
    });
    rtc = new WebRTCClient(signaling, room.roomId, profile.clientId, true, {
      onStatus: (status) => {
        setStatus(status);
      },
      onPeerList: (peers) => {
        currentSession = {
          mode: visibility,
          isHost: true,
          code: room.code,
          serverName: room.serverName,
          hostName: profile.name,
          localPeerId: profile.clientId,
          peers,
        };
        ui.updateSession(currentSession);
      },
      onPlayerState: (packet) => {
        game.applyRemoteState(packet);
      },
      onCombatEvent: (packet) => {
        game.applyCombatEvent(packet);
      },
      onServerClosed: (reason) => {
        returnToMain(reason || "Host left. Server closed.");
      },
    });
    await rtc.connect(profile);
    game.startNetwork(profile, true);
    currentSession = {
      mode: visibility,
      isHost: true,
      code: room.code,
      serverName: room.serverName,
      hostName: profile.name,
      localPeerId: profile.clientId,
      peers: [localPeer(profile.clientId, true)],
    };
    ui.showGame(currentSession);
  } catch (error) {
    console.error(error);
    returnToMain(error instanceof Error ? error.message : "Could not create room");
  }
}

async function joinRoom(nextProfile: PlayerProfile, code: string): Promise<void> {
  try {
    profile = nextProfile;
    resetRtc();
    game.setShowNames(profile.showNames);
    setStatus("Joining room");
    const room = await signaling.joinRoom(code.trim(), {
      name: profile.name,
      color: profile.color,
      clientId: profile.clientId,
    });
    rtc = new WebRTCClient(signaling, room.roomId, profile.clientId, false, {
      onStatus: (status) => {
        setStatus(status);
      },
      onPeerList: (peers) => {
        currentSession = {
          mode: room.visibility,
          isHost: false,
          code: room.code,
          serverName: room.serverName,
          hostName: room.hostName,
          localPeerId: profile.clientId,
          peers,
        };
        ui.updateSession(currentSession);
      },
      onPlayerState: (packet) => {
        game.applyRemoteState(packet);
      },
      onCombatEvent: (packet) => {
        game.applyCombatEvent(packet);
      },
      onServerClosed: (reason) => {
        returnToMain(reason || "Host left. Server closed.");
      },
    });
    await rtc.connect(profile);
    game.startNetwork(profile, false);
    currentSession = {
      mode: room.visibility,
      isHost: false,
      code: room.code,
      serverName: room.serverName,
      hostName: room.hostName,
      localPeerId: profile.clientId,
      peers: [localPeer(profile.clientId, false)],
    };
    ui.showGame(currentSession);
  } catch (error) {
    console.error(error);
    returnToMain(error instanceof Error ? error.message : "Could not join room");
  }
}

async function refreshPublicRooms(): Promise<void> {
  try {
    const rooms = await signaling.listPublicRooms();
    ui.setPublicRooms(rooms);
  } catch (error) {
    console.warn("Failed to refresh public rooms", error);
    ui.setPublicRooms([]);
  }
}

function kickPeer(peer: PeerInfo): void {
  if (!rtc || !currentSession?.isHost) {
    return;
  }
  rtc.kick(peer.id, false);
}

function banPeer(peer: PeerInfo): void {
  if (!rtc || !currentSession?.isHost) {
    return;
  }
  rtc.kick(peer.id, true);
}

function endServer(): void {
  rtc?.closeServer();
  returnToMain("Server closed");
}

function returnToMain(message?: string): void {
  resetRtc();
  currentSession = null;
  currentStatus = message ?? "Disconnected";
  game.stop();
  ui.showMenu(message);
}

function resetRtc(): void {
  rtc?.disconnect();
  rtc = null;
}

function setStatus(status: ConnectionStatus | string): void {
  currentStatus = status;
  renderDebugOverlay();
}

function localPeer(id: string, host: boolean): PeerInfo {
  return {
    id,
    name: profile.name,
    color: profile.color,
    host,
    connectedAt: Date.now(),
    afkSeconds: 0,
  };
}

function createDebugOverlay(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "debug-overlay";
  panel.hidden = true;
  root.append(panel);
  return panel;
}

function installDebugHook(): void {
  Object.assign(window, {
    __PIXEL_BRAWLER_DEBUG__: () => ({
      session: currentSession,
      status: currentStatus,
      signalingUrl: signaling.getDebugUrl(),
      rtc: rtc?.getDebugState() ?? null,
      game: game.getDebugState(),
    }),
  });
}

function renderDebugOverlay(): void {
  if (!debugOverlayVisible) {
    return;
  }
  const rtcDebug = rtc?.getDebugState();
  const gameDebug = game.getDebugState();
  debugOverlay.textContent = [
    `status: ${currentStatus}`,
    `signal: ${signaling.getDebugUrl()}`,
    `room: ${currentSession?.code ?? "offline"}`,
    `client: ${profile.clientId}`,
    `peers: ${rtcDebug?.connectedPeers ?? 0}/${currentSession?.peers.length ?? 0}`,
    `channels: ${rtcDebug?.channelsOpen ?? 0}`,
    `remote: ${gameDebug.remotePlayers}`,
    `ws: ${rtcDebug?.websocketStatus ?? "none"}`,
  ].join("\n");
}

declare global {
  interface Window {
    __PIXEL_BRAWLER_DEBUG__?: () => unknown;
  }
}
