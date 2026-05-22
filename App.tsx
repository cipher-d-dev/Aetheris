import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { initDatabase } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';
import { useThemeStore } from './src/theme';
import { useIdentityStore } from './src/store/identityStore';
import { useMeshService } from './src/store/meshService';
import { StatusBar, AppState, AppStateStatus } from 'react-native';

export default function App() {
  const { isDark, theme: t } = useThemeStore();
  const { identity, initialize: initializeIdentity } = useIdentityStore();
  const { isRunning, start: startMesh, stop: stopMesh } = useMeshService();

  // Initialize database and identity on app start
  useEffect(() => {
    const setupApp = async () => {
      try {
        initDatabase();
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

  // Handle app lifecycle (pause/resume)
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
    } else if (state === 'background' && isRunning) {
      // App went to background, stop mesh
      console.log('[App] Pausing mesh');
      await stopMesh();
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