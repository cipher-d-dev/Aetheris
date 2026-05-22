import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native';

const {AetherisNativeModule} = NativeModules;

if (!AetherisNativeModule) {
  throw new Error(
    'AetherisNativeModule not found. Did you rebuild after adding the Kotlin files?',
  );
}

const emitter = new NativeEventEmitter(AetherisNativeModule);

export interface NativePeer {
  id: string;
  rssi: number;
  lastSeen: number;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export interface ConnectionStateEvent {
  peerId: string;
  state: ConnectionState;
}

export interface MessageReceivedEvent {
  peerId: string;
  data: string; // Base64 encoded bytes
}

export const AetherisBridge = {
  // ─── Discovery (BLE) ───────────────────────────────────────────────────────

  startDiscovery: (nodeId: string): Promise<void> =>
    AetherisNativeModule.startDiscovery(nodeId),

  stopDiscovery: (): Promise<void> => AetherisNativeModule.stopDiscovery(),

  isBluetoothEnabled: (): Promise<boolean> =>
    AetherisNativeModule.isBluetoothEnabled(),

  // ─── Connection (Wi-Fi Direct) ─────────────────────────────────────────────

  /**
   * Connect to a peer over Wi-Fi Direct.
   * @param deviceAddress The Wi-Fi Direct MAC address of the peer
   * @param peerId        The Aetheris node ID of the peer (from BLE)
   */
  connectToPeer: (deviceAddress: string, peerId: string): Promise<void> =>
    AetherisNativeModule.connectToPeer(deviceAddress, peerId),

  disconnectFromPeer: (peerId: string): Promise<void> =>
    AetherisNativeModule.disconnectFromPeer(peerId),

  /**
   * Send raw bytes to a connected peer.
   * @param peerId     Aetheris node ID
   * @param base64Data Base64-encoded bytes to send
   */
  sendRawBytes: (peerId: string, base64Data: string): Promise<void> =>
    AetherisNativeModule.sendRawBytes(peerId, base64Data),

  getConnectedPeers: (): Promise<string[]> =>
    AetherisNativeModule.getConnectedPeers(),

  isConnectedTo: (peerId: string): Promise<boolean> =>
    AetherisNativeModule.isConnectedTo(peerId),

  // ─── BLE Events ────────────────────────────────────────────────────────────

  onPeerDiscovered: (cb: (peer: NativePeer) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerDiscovered', cb),

  onPeerUpdated: (cb: (peer: NativePeer) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerUpdated', cb),

  onPeerLost: (cb: (data: {id: string}) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerLost', cb),

  // ─── Wi-Fi Direct Events ───────────────────────────────────────────────────

  onConnectionStateChanged: (
    cb: (event: ConnectionStateEvent) => void,
  ): EmitterSubscription =>
    emitter.addListener('AetherisConnectionStateChanged', cb),

  onMessageReceived: (
    cb: (event: MessageReceivedEvent) => void,
  ): EmitterSubscription => emitter.addListener('AetherisMessageReceived', cb),
};
