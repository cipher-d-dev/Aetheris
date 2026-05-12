import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useThemeStore, Font } from '../theme';

export default function MessagesScreen() {
    const { theme: t } = useThemeStore();

    return (
        <View style={[styles.container, { backgroundColor: t.bg }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: t.text }]}>Messages</Text>
                <Text style={[styles.headerSub, { color: t.textMuted }]}>Your conversations</Text>
            </View>

            <View style={styles.emptyState}>
                <View style={[styles.iconWrap, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                    <Icon name="message-circle" size={32} color={t.textMuted} />
                </View>
                <Text style={[styles.emptyTitle, { color: t.text }]}>No messages yet</Text>
                <Text style={[styles.emptySubtitle, { color: t.textSub }]}>
                    Chat UI launches in Day 4.{'\n'}
                    Find a peer on Nearby to start a conversation.
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 24, paddingTop: 56 },
    header: { marginBottom: 40 },
    headerTitle: { fontSize: 28, fontFamily: Font.bold, letterSpacing: -0.5, marginBottom: 4 },
    headerSub: { fontSize: 14, fontFamily: Font.regular },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    iconWrap: {
        width: 72, height: 72, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, fontFamily: Font.semiBold },
    emptySubtitle: {
        fontSize: 14, fontFamily: Font.regular,
        textAlign: 'center', lineHeight: 21,
    },
});