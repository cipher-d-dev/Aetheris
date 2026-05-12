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

export const AetherisBridge = {
  // ─── Discovery ─────────────────────────────────────────────────────────────

  /**
   * Start BLE advertising + scanning.
   * @param nodeId Your full Base58 public key
   */
  startDiscovery: (nodeId: string): Promise<void> =>
    AetherisNativeModule.startDiscovery(nodeId),

  stopDiscovery: (): Promise<void> => AetherisNativeModule.stopDiscovery(),

  isBluetoothEnabled: (): Promise<boolean> =>
    AetherisNativeModule.isBluetoothEnabled(),

  // ─── Events ────────────────────────────────────────────────────────────────

  /** Fires when a new Aetheris peer is detected for the first time */
  onPeerDiscovered: (cb: (peer: NativePeer) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerDiscovered', cb),

  /** Fires when a known peer's RSSI updates */
  onPeerUpdated: (cb: (peer: NativePeer) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerUpdated', cb),

  /** Fires when a peer hasn't been seen for 10 seconds */
  onPeerLost: (cb: (data: {id: string}) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerLost', cb),

  /** Fires when a raw message arrives (Day 3+) */
  onMessageReceived: (
    cb: (payload: {peerId: string; data: string}) => void,
  ): EmitterSubscription => emitter.addListener('AetherisMessageReceived', cb),

  // ─── Day 3 stubs ───────────────────────────────────────────────────────────

  connectToPeer: (peerId: string): Promise<void> =>
    AetherisNativeModule.connectToPeer(peerId),

  sendRawBytes: (peerId: string, base64Data: string): Promise<void> =>
    AetherisNativeModule.sendRawBytes(peerId, base64Data),
};
