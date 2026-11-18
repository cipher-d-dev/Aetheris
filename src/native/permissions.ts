import {Platform} from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  Permission,
  checkMultiple,
  requestMultiple,
  request,
  requestNotifications,
} from 'react-native-permissions';

/** Permissions Nearby Connections needs on this Android version. */
function radioPermissions(): Permission[] {
  const v = Number(Platform.Version);
  const list: Permission[] = [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];
  if (v >= 31) {
    list.push(
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
    );
  }
  if (v >= 33) list.push(PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES);
  return list;
}

export type RadioPermissionState = 'granted' | 'denied' | 'blocked';

export async function checkRadioPermissions(): Promise<RadioPermissionState> {
  if (Platform.OS !== 'android') return 'granted';
  return summarise(await checkMultiple(radioPermissions()));
}

export async function requestRadioPermissions(): Promise<RadioPermissionState> {
  if (Platform.OS !== 'android') return 'granted';
  const state = summarise(await requestMultiple(radioPermissions()));
  if (Number(Platform.Version) >= 33) {
    // Best effort: lets us show "new message" notifications.
    await requestNotifications(['alert', 'sound']).catch(() => undefined);
  }
  return state;
}

export async function requestMicrophone(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return (await request(PERMISSIONS.ANDROID.RECORD_AUDIO)) === RESULTS.GRANTED;
}

function summarise(results: Record<string, string>): RadioPermissionState {
  const values = Object.values(results);
  if (values.every(r => r === RESULTS.GRANTED || r === RESULTS.UNAVAILABLE)) return 'granted';
  if (values.some(r => r === RESULTS.BLOCKED)) return 'blocked';
  return 'denied';
}
