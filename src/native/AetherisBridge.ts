/**
 * Typed wrapper around the Kotlin AetherisNativeModule
 * (android/app/src/main/java/com/aetheris/AetherisModule.kt).
 */
import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native';

const {AetherisNativeModule} = NativeModules;

if (!AetherisNativeModule) {
  throw new Error(
    'AetherisNativeModule not found. Rebuild the Android app (npx react-native run-android).',
  );
}

const emitter = new NativeEventEmitter(AetherisNativeModule);

export interface PeerFoundEvent {
  endpointId: string;
  nodeId: string;
}
export interface LinkUpEvent {
  linkId: string;
  nodeId: string;
}
export interface FrameEvent {
  linkId: string;
  data: string;
}
export interface RadioErrorEvent {
  code: string;
  message: string;
}
export interface PickedImage {
  data: string;
  mime: string;
  width: number;
  height: number;
}
export interface RecordedAudio {
  data: string;
  mime: string;
  durationMs: number;
}

export const AetherisBridge = {
  // ─── Radio ──────────────────────────────────────────────────────────────
  start: (nodeId: string): Promise<void> => AetherisNativeModule.start(nodeId),
  stop: (): Promise<void> => AetherisNativeModule.stop(),
  isBluetoothEnabled: (): Promise<boolean> => AetherisNativeModule.isBluetoothEnabled(),
  /** 0/0 = scan continuously. Otherwise scan onMs, rest offMs. */
  setDiscoveryDutyCycle: (onMs: number, offMs: number): Promise<void> =>
    AetherisNativeModule.setDiscoveryDutyCycle(onMs, offMs),
  /** Native heartbeat (keeps running when the app is backgrounded). 0 = off. */
  setTickInterval: (ms: number): Promise<void> => AetherisNativeModule.setTickInterval(ms),
  sendFrame: (linkId: string, data: string): Promise<void> =>
    AetherisNativeModule.sendFrame(linkId, data),
  disconnect: (linkId: string): Promise<void> => AetherisNativeModule.disconnect(linkId),

  // ─── Media ──────────────────────────────────────────────────────────────
  /** Resolves null if the user cancels. */
  pickImage: (maxDim = 1024, quality = 60): Promise<PickedImage | null> =>
    AetherisNativeModule.pickImage(maxDim, quality),
  startRecording: (): Promise<void> => AetherisNativeModule.startRecording(),
  stopRecording: (): Promise<RecordedAudio> => AetherisNativeModule.stopRecording(),
  cancelRecording: (): Promise<void> => AetherisNativeModule.cancelRecording(),
  playAudio: (id: string, data: string): Promise<void> =>
    AetherisNativeModule.playAudio(id, data),
  stopAudio: (): Promise<void> => AetherisNativeModule.stopAudio(),

  /** Opens the system QR scanner. Resolves the text, or null if cancelled. */
  scanQrCode: (): Promise<string | null> => AetherisNativeModule.scanQrCode(),

  // ─── Notifications ──────────────────────────────────────────────────────
  showMessageNotification: (title: string, body: string): Promise<boolean> =>
    AetherisNativeModule.showMessageNotification(title, body),

  // ─── Events ─────────────────────────────────────────────────────────────
  onPeerFound: (cb: (e: PeerFoundEvent) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerFound', cb),
  onPeerLost: (cb: (e: {endpointId: string}) => void): EmitterSubscription =>
    emitter.addListener('AetherisPeerLost', cb),
  onLinkUp: (cb: (e: LinkUpEvent) => void): EmitterSubscription =>
    emitter.addListener('AetherisLinkUp', cb),
  onLinkDown: (cb: (e: {linkId: string}) => void): EmitterSubscription =>
    emitter.addListener('AetherisLinkDown', cb),
  onFrame: (cb: (e: FrameEvent) => void): EmitterSubscription =>
    emitter.addListener('AetherisFrame', cb),
  onRadioError: (cb: (e: RadioErrorEvent) => void): EmitterSubscription =>
    emitter.addListener('AetherisRadioError', cb),
  onTick: (cb: () => void): EmitterSubscription => emitter.addListener('AetherisTick', cb),
  onAudioFinished: (cb: (e: {id: string}) => void): EmitterSubscription =>
    emitter.addListener('AetherisAudioFinished', cb),
};
