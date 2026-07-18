import "./style.css";
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
  updateProfile: (nextProfile) => {
    applyProfileUpdate(nextProfile);
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

function applyProfileUpdate(nextProfile: PlayerProfile): void {
  profile = nextProfile;
  game.applyProfile(profile);
  if (currentSession) {
    currentSession = {
      ...currentSession,
      hostName: currentSession.isHost ? profile.name : currentSession.hostName,
      peers: currentSession.peers.map((peer) => (
        peer.clientId === profile.clientId
          ? { ...peer, name: profile.name, color: profile.color }
          : peer
      )),
    };
    ui.updateSession(currentSession);
  }
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
      serverName,
      hostName: profile.name,
      hostClientId: profile.clientId,
      bannedClientIds: readBanList(profile.clientId),
    });

    rtc = createRtcClient(profile);
    game.startNetwork(rtc.peerId, profile, "host");
    currentSession = {
      mode: room.visibility,
      isHost: true,
      localPeerId: rtc.peerId,
      roomCode: room.roomCode,
      serverName: room.serverName,
      hostName: room.hostName,
      peers: [localPeer(rtc.peerId, true)],
    };
    ui.showGame(currentSession);
    await rtc.host(room.roomCode);
    if (visibility === "public") {
      await refreshPublicRooms();
    }
  } catch (error) {
    resetRtc();
    game.stop();
    currentSession = null;
    ui.showError(error);
    ui.showSetup();
  }
}

async function joinRoom(nextProfile: PlayerProfile, code: string): Promise<void> {
  try {
    profile = nextProfile;
    resetRtc();
    game.setShowNames(profile.showNames);
    setStatus("Connecting");
    rtc = createRtcClient(profile);
    game.startNetwork(rtc.peerId, profile, "guest");
    currentSession = {
      mode: "private",
      isHost: false,
      localPeerId: rtc.peerId,
      roomCode: code,
      peers: [localPeer(rtc.peerId, false)],
    };
    ui.showGame(currentSession);
    await rtc.join(code);
  } catch (error) {
    resetRtc();
    game.stop();
    currentSession = null;
    ui.showError(error);
    ui.showSetup();
  }
}

async function refreshPublicRooms(): Promise<void> {
  try {
    ui.setPublicRooms(await signaling.listPublicRooms());
  } catch (error) {
    console.warn("Could not refresh public rooms", error);
    ui.setPublicRooms([]);
  }
}

function createRtcClient(nextProfile: PlayerProfile): WebRTCClient {
  return new WebRTCClient(signaling, nextProfile, {
    onStatus: (status: ConnectionStatus) => setStatus(status),
    onRemoteState: (state) => game.setRemoteState(state),
    onCombatEvent: (event) => game.applyCombatEvent(event),
    onPeerLeft: (peerId) => {
      game.removeRemote(peerId);
      if (currentSession) {
        currentSession = {
          ...currentSession,
          peers: currentSession.peers.filter((peer) => peer.peerId !== peerId),
        };
        ui.updateSession(currentSession);
      }
    },
    onLobby: (message) => updateSessionFromLobby(message),
    onKicked: (reason) => returnToMain(reason, false),
    onBanned: (reason) => returnToMain(reason, false),
    onServerClosed: (reason) => returnToMain(reason, false),
    onAfkWarning: (message) => setStatus(message),
  });
}

function updateSessionFromLobby(message: Extract<SignalMessage, { type: "lobby" }>): void {
  const localPeerId = message.peers.find((peer) => peer.clientId === profile.clientId)?.peerId
    ?? rtc?.peerId
    ?? currentSession?.localPeerId
    ?? "local";

  currentSession = {
    mode: message.visibility,
    isHost: message.hostClientId === profile.clientId,
    localPeerId,
    roomCode: message.roomCode,
    serverName: message.serverName,
    hostName: message.hostName,
    peers: message.peers,
  };
  ui.showGame(currentSession);
}

function kickPeer(peer: PeerInfo): void {
  if (!currentSession?.isHost || !rtc) {
    return;
  }
  rtc.kickPeer(peer.peerId);
  removePeerLocally(peer);
}

function banPeer(peer: PeerInfo): void {
  if (!currentSession?.isHost || !rtc) {
    return;
  }
  addBan(profile.clientId, peer.clientId);
  rtc.banPeer(peer.clientId);
  removePeerLocally(peer);
}

function removePeerLocally(peer: PeerInfo): void {
  game.removeRemote(peer.peerId);
  if (!currentSession) {
    return;
  }
  currentSession = {
    ...currentSession,
    peers: currentSession.peers.filter((item) => item.peerId !== peer.peerId && item.clientId !== peer.clientId),
  };
  ui.updateSession(currentSession);
}

function endServer(): void {
  const active = rtc;
  rtc = null;
  active?.closeServer();
  game.stop();
  currentSession = null;
  ui.showMain("Server closed");
}

function returnToMain(message: string, closeRtc = true): void {
  if (closeRtc) {
    resetRtc();
  } else {
    rtc = null;
  }
  game.stop();
  currentSession = null;
  ui.showMain(message);
  currentStatus = message;
  renderDebugOverlay();
}

function resetRtc(): void {
  const active = rtc;
  rtc = null;
  active?.close();
}

function setStatus(status: ConnectionStatus | string): void {
  currentStatus = status;
  ui.setStatus(status);
  renderDebugOverlay();
}

function installDebugHook(): void {
  Object.defineProperty(window, "__PIXEL_BRAWLER_DEBUG__", {
    configurable: true,
    get: buildDebugSnapshot,
  });
  window.setInterval(renderDebugOverlay, 250);
}

function buildDebugSnapshot(): PixelBrawlerDebugSnapshot {
  const gameDebug = game.getDebugSnapshot();
  const netDebug = rtc?.getDebugSnapshot();
  return {
    signalingUrl: signaling.baseUrl,
    roomCode: currentSession?.roomCode,
    clientId: profile.clientId,
    peerId: rtc?.peerId ?? currentSession?.localPeerId,
    connectedPeers: netDebug?.connectedPeerCount ?? Math.max(0, (currentSession?.peers.length ?? 1) - 1),
    roomPlayerCount: currentSession?.peers.length ?? 0,
    connectionStatus: currentStatus,
    webSocketStatus: netDebug?.webSocketStatus ?? "closed",
    webRtcPeerStatus: netDebug?.peerStatus ?? {},
    dataChannels: netDebug?.dataChannels ?? {},
    relayFallbackPeerCount: netDebug?.relayFallbackPeerCount ?? 0,
    remotePlayers: gameDebug.remotePlayers,
    localPlayer: gameDebug.localPlayer,
    render3d: gameDebug.render3d,
  };
}

function createDebugOverlay(): HTMLPreElement {
  const overlay = document.createElement("pre");
  overlay.className = "debug-overlay";
  overlay.hidden = true;
  document.body.append(overlay);
  return overlay;
}

function renderDebugOverlay(): void {
  if (!debugOverlayVisible) {
    return;
  }
  const debug = buildDebugSnapshot();
  debugOverlay.textContent = [
    `signaling ${debug.signalingUrl}`,
    `room ${debug.roomCode ?? "-"} client ${debug.clientId}`,
    `peer ${debug.peerId ?? "-"} connected ${debug.connectedPeers} room ${debug.roomPlayerCount}`,
    `ws ${debug.webSocketStatus} status ${debug.connectionStatus}`,
    `rtc ${JSON.stringify(debug.webRtcPeerStatus)}`,
    `dc ${JSON.stringify(debug.dataChannels)} fallback ${debug.relayFallbackPeerCount}`,
    `remote players ${debug.remotePlayers.count}`,
    `3d ${debug.render3d.enabled ? "on" : "off"} ${debug.render3d.available ? "ready" : "fallback"} actors ${debug.render3d.actorCount}`,
  ].join("\n");
}

function localPeer(peerId: string, isHost: boolean): PeerInfo {
  return {
    peerId,
    clientId: profile.clientId,
    name: profile.name,
    color: profile.color,
    isHost,
  };
}

function readBanList(hostClientId: string): string[] {
  try {
    const raw = localStorage.getItem(banKey(hostClientId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function addBan(hostClientId: string, bannedClientId: string): void {
  const bans = new Set(readBanList(hostClientId));
  bans.add(bannedClientId);
  localStorage.setItem(banKey(hostClientId), JSON.stringify([...bans]));
}

function banKey(hostClientId: string): string {
  return `pixel-brawler-p2p.bans.${hostClientId}`;
}
