import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, useThemeStore} from '../theme';
import {useMessagesStore} from '../store/messagesStore';
import {Icon} from '../ui/Icon';

import ChatsScreen from '../screens/ChatsScreen';
import PeopleScreen from '../screens/PeopleScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChatScreen from '../screens/ChatScreen';
import NewGroupScreen from '../screens/NewGroupScreen';
import ContactInfoScreen from '../screens/ContactInfoScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, string> = {
  Chats: 'chatbubbles',
  People: 'people',
  Settings: 'settings',
};

function Tabs() {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const unread = useMessagesStore(s => s.conversations.reduce((n, c) => n + c.unread, 0));
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        // Height and bottom padding are set here (they override the tab bar's own inset padding), so the bottom inset is applied once.
        tabBarStyle: [
          styles.tabBar,
          {height: 70 + insets.bottom, paddingBottom: 10 + insets.bottom, backgroundColor: t.bg, borderTopColor: t.separator},
        ],
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textSub,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: ({color, focused}) => (
          <Text style={[styles.label, {color, fontFamily: focused ? Font.bold : Font.medium}]}>{route.name}</Text>
        ),
        // Active tab: a soft pill behind a filled icon.
        tabBarIcon: ({focused}) => (
          <View style={[styles.pill, focused && {backgroundColor: t.tabPill}]}>
            <Icon
              name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`}
              size={21}
              color={focused ? t.primaryText : t.textSub}
            />
          </View>
        ),
      })}>
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: {backgroundColor: t.primary, color: t.onPrimary, fontFamily: Font.bold, fontSize: 10, top: 2},
        }}
      />
      <Tab.Screen name="People" component={PeopleScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const {theme: t} = useThemeStore();
  return (
    <Stack.Navigator
      screenOptions={{headerShown: false, contentStyle: {backgroundColor: t.bg}, animation: 'slide_from_right'}}>
      <Stack.Screen name="Home" component={Tabs} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="ContactInfo" component={ContactInfoScreen} />
      <Stack.Screen name="NewMessage" component={PeopleScreen} options={{animation: 'slide_from_bottom'}} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0},
  pill: {width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 11.5, lineHeight: 15, marginTop: 3},
});
