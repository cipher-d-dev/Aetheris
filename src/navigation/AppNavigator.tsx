import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useThemeStore, Font } from '../theme';

import IdentityScreen from '../screens/IdentityScreen';
import NearbyScreen from '../screens/NearbyScreen';
import MessagesScreen from '../screens/MessagesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChatScreen from '../screens/ChatScreen';
import NewChatScreen from '../screens/NewChatScreen';

// ─── Stack for the Messages tab ───────────────────────────────────────────────
// MessagesScreen (conversation list) → NewChatScreen → ChatScreen

const MessagesStack = createNativeStackNavigator();

function MessagesStackNavigator() {
    const { theme: t } = useThemeStore();
    return (
        <MessagesStack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: t.bg },
                animation: 'slide_from_right',
            }}>
            <MessagesStack.Screen name="ConversationList" component={MessagesScreen} />
            <MessagesStack.Screen name="NewChat" component={NewChatScreen} />
            <MessagesStack.Screen name="Chat" component={ChatScreen} />
        </MessagesStack.Navigator>
    );
}

// ─── Bottom Tabs ──────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
    const { theme: t } = useThemeStore();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: [
                    styles.tabBar,
                    {
                        backgroundColor: t.tabBar,
                        borderTopColor: t.tabBarBorder,
                    },
                ],
                tabBarActiveTintColor: t.accent,
                tabBarInactiveTintColor: t.textMuted,
                tabBarLabelStyle: {
                    fontFamily: Font.medium,
                    fontSize: 11,
                    marginBottom: 4,
                },
                tabBarIcon: ({ color, focused }) => {
                    const iconMap: Record<string, string> = {
                        Identity: 'user',
                        Nearby: 'radio',
                        Messages: 'message-circle',
                        Settings: 'settings',
                    };
                    const iconName = iconMap[route.name] ?? 'circle';
                    return (
                        <View
                            style={[
                                styles.iconWrap,
                                focused && { backgroundColor: t.accentSoft },
                            ]}>
                            <Icon name={iconName} size={20} color={color} />
                        </View>
                    );
                },
            })}>
            <Tab.Screen name="Identity" component={IdentityScreen} />
            <Tab.Screen name="Nearby" component={NearbyScreen} />
            <Tab.Screen
                name="Messages"
                component={MessagesStackNavigator}
                listeners={({ navigation }) => ({
                    tabPress: () => {
                        // Always go back to conversation list when tapping the tab
                        navigation.navigate('Messages', { screen: 'ConversationList' });
                    },
                })}
            />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        height: 64,
        paddingTop: 6,
        borderTopWidth: 1,
        elevation: 0,
        shadowOpacity: 0,
    },
    iconWrap: {
        width: 36,
        height: 28,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
});