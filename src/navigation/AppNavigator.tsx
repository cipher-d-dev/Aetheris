import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useThemeStore, Font } from '../theme';

import IdentityScreen from '../screens/IdentityScreen';
import NearbyScreen from '../screens/NearbyScreen';
import MessagesScreen from '../screens/MessagesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
    const { theme: t, isDark } = useThemeStore();

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
                        <View style={[styles.iconWrap, focused && { backgroundColor: t.accentSoft }]}>
                            <Icon name={iconName} size={20} color={color} />
                        </View>
                    );
                },
            })}>
            <Tab.Screen name="Identity" component={IdentityScreen} />
            <Tab.Screen name="Nearby" component={NearbyScreen} />
            <Tab.Screen name="Messages" component={MessagesScreen} />
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