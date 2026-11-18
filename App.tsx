import React, {useEffect} from 'react';
import {AppState, StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import {initDatabase} from './src/db/database';
import {useThemeStore} from './src/theme';
import {useIdentityStore} from './src/store/identityStore';
import {useMeshService} from './src/store/meshService';
import {useMessagesStore} from './src/store/messagesStore';

export default function App() {
  const {isDark, theme: t} = useThemeStore();
  const identity = useIdentityStore(s => s.identity);
  const initializeIdentity = useIdentityStore(s => s.initialize);
  const bootstrap = useMeshService(s => s.bootstrap);

  // 1. Database + identity
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await initializeIdentity();
        useMessagesStore.getState().loadConversations();
      } catch (e) {
        console.error('[App] setup failed', e);
      }
    })();
  }, [initializeIdentity]);

  // 2. Mesh. It keeps running in the background via a foreground service.
  useEffect(() => {
    if (identity) bootstrap(identity.publicKeyBase58);
  }, [identity, bootstrap]);

  // 3. Coming back to the app: retry if permissions/Bluetooth were missing.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const mesh = useMeshService.getState();
      if (state === 'active' && identity && mesh.status !== 'running') {
        mesh.bootstrap(identity.publicKeyBase58);
      }
    });
    return () => sub.remove();
  }, [identity]);

  return (
    <NavigationContainer>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      <AppNavigator />
    </NavigationContainer>
  );
}
