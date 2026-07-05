import "./style.css";
import { Game } from "./game/Game";
import { SignalingClient } from "./net/SignalingClient";
import { WebRTCClient, type ConnectionStatus } from "./net/WebRTCClient";
import { LobbyUI } from "./ui/LobbyUI";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}

const signaling = new SignalingClient();
let rtc: WebRTCClient | null = null;

const game = new Game(root, {
  onLocalState: (packet) => {
    rtc?.sendPlayerState(packet);
  },
});

const ui = new LobbyUI(root, {
  hostPrivate: () => {
    void hostRoom("private");
  },
  hostPublic: () => {
    void hostRoom("public");
  },
  joinPrivate: (code) => {
    void joinRoom(code);
  },
  refreshPublicRooms: () => {
    void refreshPublicRooms();
  },
  startOffline: () => {
    rtc?.close();
    rtc = null;
    ui.setStatus("Offline");
    ui.setRoomCode(null);
    game.startOffline();
  },
});

game.startOffline();
void refreshPublicRooms();

async function hostRoom(visibility: "private" | "public"): Promise<void> {
  try {
    resetRtc();
    ui.setStatus("Creating room");
    const room = await signaling.createRoom(visibility);
    ui.setRoomCode(room.roomCode);
    rtc = createRtcClient();
    game.startNetwork(rtc.peerId, "P1");
    await rtc.host(room.roomCode);
    if (visibility === "public") {
      await refreshPublicRooms();
    }
  } catch (error) {
    ui.showError(error);
  }
}

async function joinRoom(code: string): Promise<void> {
  try {
    resetRtc();
    ui.setStatus("Connecting");
    ui.setRoomCode(code);
    rtc = createRtcClient();
    game.startNetwork(rtc.peerId, "P2");
    await rtc.join(code);
  } catch (error) {
    ui.showError(error);
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

function createRtcClient(): WebRTCClient {
  return new WebRTCClient(signaling, {
    onStatus: (status: ConnectionStatus) => ui.setStatus(status),
    onRemoteState: (state) => game.setRemoteState(state),
    onPeerLeft: (peerId) => game.removeRemote(peerId),
  });
}

function resetRtc(): void {
  rtc?.close();
  rtc = null;
}
