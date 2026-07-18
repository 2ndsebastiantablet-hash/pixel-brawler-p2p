/// <reference types="vite/client" />

interface PixelBrawlerDebugSnapshot {
  signalingUrl: string;
  roomCode?: string;
  clientId: string;
  peerId?: string;
  connectedPeers: number;
  roomPlayerCount: number;
  connectionStatus: string;
  webSocketStatus: string;
  webRtcPeerStatus: Record<string, string>;
  dataChannels: Record<string, RTCDataChannelState | "missing">;
  relayFallbackPeerCount: number;
  remotePlayers: {
    count: number;
    players: Array<{
      id: string;
      clientId: string;
      name: string;
      color: string;
      x: number;
      y: number;
      hp?: number;
    }>;
  };
  localPlayer: {
    id: string;
    clientId: string;
    name: string;
    color: string;
    x: number;
    y: number;
    weaponId: string;
    hp?: number;
  };
  render3d: {
    enabled: boolean;
    available: boolean;
    actorCount: number;
    error?: string;
  };
}

interface Window {
  __PIXEL_BRAWLER_DEBUG__?: PixelBrawlerDebugSnapshot;
}
