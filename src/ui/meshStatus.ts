import type {MeshStatus} from '../store/meshService';

export interface MeshStatusInput {
  status: MeshStatus;
  permission: string;
  bluetoothOn: boolean;
  error?: string;
  errorCode?: string;
  routeCount: number;
}

export interface MeshStatusLine {
  text: string;
  tone: 'normal' | 'warning';
  /** Tapping does something: open settings, retry, or show help. */
  tappable: boolean;
}

export const MESH_TIPS_TITLE = "Can't see someone?";
export const MESH_TIPS =
  '• Both phones need Aetheris open (or running in the background).\n' +
  '• Turn on Bluetooth and Location on both phones.\n' +
  '• Stay within about 30 metres. Walls shorten the range.\n' +
  '• Turn off battery saver for Aetheris in your phone settings.\n\n' +
  'Messages to people who are away are kept and delivered when they come back nearby.';

const RADIO_ERROR_LINES: Record<string, string> = {
  ADVERTISE_FAILED: "Other phones can't see you right now",
  DISCOVERY_FAILED: "Can't look for people nearby",
};

/** What the line under the Chats title says. Permission and Bluetooth problems win over everything. */
export function meshStatusLine(s: MeshStatusInput): MeshStatusLine {
  if (s.permission === 'blocked') {
    return {text: 'Aetheris needs access to nearby devices.', tone: 'warning', tappable: true};
  }
  if (s.permission === 'denied') {
    return {text: 'Allow access to find people nearby.', tone: 'warning', tappable: true};
  }
  if (!s.bluetoothOn) {
    return {text: 'Turn on Bluetooth to reach people nearby.', tone: 'warning', tappable: true};
  }
  if (s.status === 'error') {
    return {text: "Couldn't start.", tone: 'warning', tappable: true};
  }
  if (s.status !== 'running') return {text: 'Starting…', tone: 'normal', tappable: false};
  if (s.error) {
    const text = (s.errorCode && RADIO_ERROR_LINES[s.errorCode]) || "Bluetooth isn't working properly";
    return {text: `${text}.`, tone: 'warning', tappable: true};
  }
  const n = s.routeCount;
  return {
    text: n === 0 ? 'Looking for people nearby…' : `${n} ${n === 1 ? 'person' : 'people'} nearby`,
    tone: 'normal',
    tappable: false,
  };
}
