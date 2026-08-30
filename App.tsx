import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { initDatabase } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';
import { useThemeStore } from './src/theme';
import { useIdentityStore } from './src/store/identityStore';
import { useMeshService } from './src/store/meshService';
import { StatusBar, AppState, AppStateStatus } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Platform } from 'react-native';

export default function App() {
  const { isDark, theme: t } = useThemeStore();
  const { identity, initialize: initializeIdentity } = useIdentityStore();
  const { isRunning, start: startMesh, stop: stopMesh } = useMeshService();

  // Request required Bluetooth and location permissions
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    const requiredPermissions = [
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
      PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    ];

    for (const permission of requiredPermissions) {
      const status = await check(permission);
      if (status !== RESULTS.GRANTED) {
        const requested = await request(permission);
        if (requested !== RESULTS.GRANTED) {
          console.warn(`[App] Permission ${permission} denied`);
          return false;
        }
      }
    }
    return true;
  };

  // Initialize database and identity on app start
  useEffect(() => {
    const setupApp = async () => {
      try {
        // Request permissions first
        const permissionsGranted = await requestPermissions();
        if (!permissionsGranted) {
          console.warn('[App] Some permissions were denied - app may not work correctly');
        }

        // Initialize database
        await initDatabase();
        
        // Initialize identity
        await initializeIdentity();
      } catch (e) {
        console.error('[App] Setup failed:', e);
      }
    };
    setupApp();
  }, []);

  // Initialize mesh service once identity is ready
  useEffect(() => {
    if (identity && !isRunning) {
      startMesh(identity.publicKeyBase58, identity.publicKeyBase58).catch(e => {
        console.error('[App] Mesh start failed:', e);
      });
    }
  }, [identity, isRunning]);

  useEffect(() => {
    return () => {
      stopMesh();
    };
  }, [stopMesh]);

  // Handle app lifecycle (pause/resume)
  // Removed pausing mesh in background, as it runs via Foreground Service now.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isRunning]);

  const handleAppStateChange = async (state: AppStateStatus) => {
    if (state === 'active' && identity && !isRunning) {
      // App came to foreground, restart mesh
      console.log('[App] Resuming mesh');
      await startMesh(identity.publicKeyBase58, identity.publicKeyBase58);
    }
  };

  return (
    <NavigationContainer>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={t.bg}
      />
      <AppNavigator />
    </NavigationContainer>
  );
}
