const mockRows = [];
let mockKeychainValue = null;

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  const overrides = {
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({remove: jest.fn()})),
    },
    Keyboard: {
      addListener: jest.fn(() => ({remove: jest.fn()})),
      removeListener: jest.fn(),
      dismiss: jest.fn(),
    },
    BackHandler: {
      addEventListener: jest.fn(() => ({remove: jest.fn()})),
      removeEventListener: jest.fn(),
    },
    Platform: {
      ...rn.Platform,
      OS: 'android',
      Version: 35,
      select: values => values.android ?? values.default,
    },
    StatusBar: () => null,
  };
  return new Proxy(rn, {
    get(target, prop) {
      if (prop in overrides) {
        return overrides[prop];
      }
      return target[prop];
    },
  });
});

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({children}) => children,
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
  }),
  useRoute: () => ({params: {}}),
  createNavigationContainerRef: () => ({isReady: () => false, navigate: jest.fn()}),
  DefaultTheme: {dark: false, colors: {}},
  DarkTheme: {dark: true, colors: {}},
}));

const createMockNavigator = () => ({
  Navigator: ({children}) => children,
  Screen: () => null,
});

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: createMockNavigator,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: createMockNavigator,
}));

jest.mock('react-native-quick-sqlite', () => ({
  open: () => ({
    execute: () => ({rows: {_array: mockRows}}),
  }),
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY'},
  STORAGE_TYPE: {AES_GCM: 'AES_GCM'},
  getGenericPassword: jest.fn(() => Promise.resolve(mockKeychainValue || false)),
  setGenericPassword: jest.fn((username, password) => {
    mockKeychainValue = {username, password};
    return Promise.resolve(true);
  }),
}));

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    ANDROID: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      NEARBY_WIFI_DEVICES: 'android.permission.NEARBY_WIFI_DEVICES',
      RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
    },
  },
  RESULTS: {GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable'},
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
  checkMultiple: jest.fn(perms =>
    Promise.resolve(Object.fromEntries(perms.map(p => [p, 'granted']))),
  ),
  requestMultiple: jest.fn(perms =>
    Promise.resolve(Object.fromEntries(perms.map(p => [p, 'granted']))),
  ),
  requestNotifications: jest.fn(() => Promise.resolve({status: 'granted'})),
  openSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-sodium', () => ({
  crypto_sign_keypair: jest.fn(() =>
    Promise.resolve({
      pk: Buffer.alloc(32, 1).toString('base64'),
      sk: Buffer.alloc(64, 2).toString('base64'),
    }),
  ),
  randombytes_buf: jest.fn(size => Promise.resolve(Buffer.alloc(size, 3).toString('base64'))),
  crypto_sign_detached: jest.fn(() => Promise.resolve(Buffer.alloc(64, 4).toString('base64'))),
  crypto_sign_verify_detached: jest.fn(() => Promise.resolve(true)),
  crypto_sign_ed25519_pk_to_curve25519: jest.fn(key => Promise.resolve(key)),
  crypto_sign_ed25519_sk_to_curve25519: jest.fn(key => Promise.resolve(key)),
  crypto_box_keypair: jest.fn(() =>
    Promise.resolve({
      pk: Buffer.alloc(32, 5).toString('base64'),
      sk: Buffer.alloc(32, 6).toString('base64'),
    }),
  ),
  crypto_box_NONCEBYTES: 24,
  crypto_box_easy: jest.fn(() => Promise.resolve(Buffer.from('cipher').toString('base64'))),
  crypto_box_open_easy: jest.fn(() => Promise.resolve(Buffer.from('{}').toString('base64'))),
}));

jest.mock('./src/native/AetherisBridge', () => {
  const sub = () => ({remove: jest.fn()});
  return {
    AetherisBridge: {
      start: jest.fn(() => Promise.resolve()),
      stop: jest.fn(() => Promise.resolve()),
      isBluetoothEnabled: jest.fn(() => Promise.resolve(true)),
      setDiscoveryDutyCycle: jest.fn(() => Promise.resolve()),
      setTickInterval: jest.fn(() => Promise.resolve()),
      sendFrame: jest.fn(() => Promise.resolve()),
      disconnect: jest.fn(() => Promise.resolve()),
      pickImage: jest.fn(() => Promise.resolve(null)),
      startRecording: jest.fn(() => Promise.resolve()),
      stopRecording: jest.fn(() => Promise.resolve({data: '', mime: 'audio/mp4', durationMs: 0})),
      cancelRecording: jest.fn(() => Promise.resolve()),
      playAudio: jest.fn(() => Promise.resolve()),
      stopAudio: jest.fn(() => Promise.resolve()),
      copyText: jest.fn(() => Promise.resolve()),
      showMessageNotification: jest.fn(() => Promise.resolve(true)),
      onPeerFound: jest.fn(sub),
      onPeerLost: jest.fn(sub),
      onLinkUp: jest.fn(sub),
      onLinkDown: jest.fn(sub),
      onFrame: jest.fn(sub),
      onRadioError: jest.fn(sub),
      onTick: jest.fn(sub),
      onAudioFinished: jest.fn(sub),
    },
  };
});

jest.mock('react-native-vector-icons/Feather', () => 'Icon');
