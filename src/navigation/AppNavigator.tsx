import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
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
  const unread = useMessagesStore(s => s.conversations.reduce((n, c) => n + c.unread, 0));
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, {backgroundColor: t.bg, borderTopColor: t.separator}],
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: ({color}) => <Text style={[styles.label, {color}]}>{route.name}</Text>,
        tabBarIcon: ({color, focused}) => (
          <Icon name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`} size={25} color={color} />
        ),
      })}>
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: {backgroundColor: t.primary, fontFamily: Font.bold, fontSize: 10},
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
  tabBar: {height: 70, paddingTop: 8, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0},
  label: {fontFamily: Font.semiBold, fontSize: 11.5, lineHeight: 16, marginTop: 2},
});
