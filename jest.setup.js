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
    },
  },
  RESULTS: {GRANTED: 'granted'},
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
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

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

jest.mock('./src/native/AetherisBridge', () => ({
  AetherisBridge: {
    startDiscovery: jest.fn(() => Promise.resolve()),
    stopDiscovery: jest.fn(() => Promise.resolve()),
    isBluetoothEnabled: jest.fn(() => Promise.resolve(true)),
    connectToPeer: jest.fn(() => Promise.resolve()),
    disconnectFromPeer: jest.fn(() => Promise.resolve()),
    sendRawBytes: jest.fn(() => Promise.resolve()),
    getConnectedPeers: jest.fn(() => Promise.resolve([])),
    isConnectedTo: jest.fn(() => Promise.resolve(false)),
    onPeerDiscovered: jest.fn(() => ({remove: jest.fn()})),
    onPeerUpdated: jest.fn(() => ({remove: jest.fn()})),
    onPeerLost: jest.fn(() => ({remove: jest.fn()})),
    onConnectionStateChanged: jest.fn(() => ({remove: jest.fn()})),
    onMessageReceived: jest.fn(() => ({remove: jest.fn()})),
  },
}));

jest.mock('react-native-vector-icons/Feather', () => 'Icon');
