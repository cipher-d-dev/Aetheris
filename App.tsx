import React, {useEffect} from 'react';
import {Alert, AppState, Linking, StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import {initDatabase} from './src/db/database';
import {useThemeStore} from './src/theme';
import {useIdentityStore} from './src/store/identityStore';
import {useMeshService} from './src/store/meshService';
import {useMessagesStore} from './src/store/messagesStore';
import {navigationRef, openChat} from './src/navigation/navigationRef';
import {addContactFromText, addResultMessage} from './src/contacts/addContact';

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

  // 4. Contact links (aetheris://add/<id>) opened from other apps.
  useEffect(() => {
    if (!identity) return;
    const handle = (url: string | null) => {
      if (!url) return;
      // A forwarded link isn't proof of identity, so it's not "verified".
      const result = addContactFromText(url, identity.publicKeyBase58, false);
      if (result.ok) openChat(result.contact.id);
      else Alert.alert('Add contact', addResultMessage(result));
    };
    Linking.getInitialURL().then(handle).catch(() => undefined);
    const sub = Linking.addEventListener('url', e => handle(e.url));
    return () => sub.remove();
  }, [identity]);

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      <AppNavigator />
    </NavigationContainer>
  );
}
