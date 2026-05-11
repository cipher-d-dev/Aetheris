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

export const AetherisBridge = {
  // --- Events ---
  onPeerDiscovered: (
    cb: (peer: {id: string; rssi: number}) => void,
  ): EmitterSubscription => emitter.addListener('AetherisPeerDiscovered', cb),

  onPeerLost: (cb: (peerId: string) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerLost', cb),

  onMessageReceived: (
    cb: (payload: {peerId: string; data: string}) => void,
  ): EmitterSubscription => emitter.addListener('AetherisMessageReceived', cb),

  // Discovery + transfer stubs — implemented Day 2 & 3
  startDiscovery: (): Promise<void> => AetherisNativeModule.startDiscovery(),
  stopDiscovery: (): Promise<void> => AetherisNativeModule.stopDiscovery(),
  connectToPeer: (peerId: string): Promise<void> =>
    AetherisNativeModule.connectToPeer(peerId),
  sendRawBytes: (peerId: string, base64Data: string): Promise<void> =>
    AetherisNativeModule.sendRawBytes(peerId, base64Data),
};
