import React, {useEffect, useState} from 'react';
import {Appearance, AppState, Linking, StatusBar, View} from 'react-native';
import {NavigationContainer, DefaultTheme, DarkTheme} from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import {dbGetGroup, dbGetPeer, dbGetSetting, initDatabase} from './src/db/database';
import {ThemeMode, useThemeStore} from './src/theme';
import {useIdentityStore} from './src/store/identityStore';
import {useMeshService} from './src/store/meshService';
import {useMessagesStore} from './src/store/messagesStore';
import {navigationRef, openChat} from './src/navigation/navigationRef';
import {chatIdFromUrl, isKnownConversation} from './src/navigation/deepLink';

type Phase = 'loading' | 'onboarding' | 'ready';

export default function App() {
  const {isDark, theme: t} = useThemeStore();
  const identity = useIdentityStore(s => s.identity);
  const initializeIdentity = useIdentityStore(s => s.initialize);
  const [phase, setPhase] = useState<Phase>('loading');

  // Database, identity, saved preferences.
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const mode = dbGetSetting('themeMode') as ThemeMode | null;
        if (mode) useThemeStore.getState().setMode(mode);
        const alias = dbGetSetting('alias') ?? '';
        useMeshService.setState({alias});
        await initializeIdentity();
        useMessagesStore.getState().loadConversations();
        setPhase(alias ? 'ready' : 'onboarding');
      } catch (e) {
        console.error('[App] setup failed', e);
        setPhase('ready');
      }
    })();
  }, [initializeIdentity]);

  // Follow the phone's light/dark setting when on "Auto".
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => useThemeStore.getState().syncSystem());
    return () => sub.remove();
  }, []);

  // Start the radio once set up. It keeps running in the background.
  useEffect(() => {
    if (phase === 'ready' && identity) useMeshService.getState().bootstrap(identity.publicKeyBase58);
  }, [phase, identity]);

  // Notification taps arrive as aetheris://chat/<id> links.
  useEffect(() => {
    if (phase !== 'ready') return;
    const open = (url: string | null) => {
      const id = url ? chatIdFromUrl(url) : null;
      if (id && isKnownConversation(id, {group: dbGetGroup, peer: dbGetPeer})) openChat(id);
    };
    Linking.getInitialURL().then(open, () => undefined);
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, [phase]);

  // Back in the app: retry if Bluetooth or permissions were missing.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const mesh = useMeshService.getState();
      if (state === 'active' && phase === 'ready' && identity && mesh.status !== 'running') {
        mesh.bootstrap(identity.publicKeyBase58);
      }
    });
    return () => sub.remove();
  }, [phase, identity]);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {...(isDark ? DarkTheme : DefaultTheme).colors, background: t.bg, card: t.bg, primary: t.primary},
  };

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      {phase === 'loading' ? (
        <View style={{flex: 1, backgroundColor: t.bg}} />
      ) : phase === 'onboarding' ? (
        <OnboardingScreen onDone={() => setPhase('ready')} />
      ) : (
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <AppNavigator />
        </NavigationContainer>
      )}
    </>
  );
}
