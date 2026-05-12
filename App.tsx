import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { initDatabase } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';
import { useThemeStore } from './src/theme';
import { StatusBar } from 'react-native';

export default function App() {
  const { isDark, theme: t } = useThemeStore();

  useEffect(() => {
    initDatabase();
  }, []);

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