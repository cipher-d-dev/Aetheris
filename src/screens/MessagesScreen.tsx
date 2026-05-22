import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore, Font } from '../theme';
import { useIdentityStore } from '../store/identityStore';
import { useMessagesStore, Conversation } from '../store/messagesStore';

function timeLabel(ts?: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
}

function ConversationRow({
    item,
    onPress,
}: {
    item: Conversation;
    onPress: () => void;
}) {
    const { theme: t } = useThemeStore();
    const initials = item.peerAlias
        ? item.peerAlias.slice(0, 2).toUpperCase()
        : item.peerId.slice(0, 2).toUpperCase();

    return (
        <TouchableOpacity
            style={[styles.row, { borderBottomColor: t.border }]}
            onPress={onPress}
            activeOpacity={0.7}>
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: t.accentSoft, borderColor: t.accentBorder }]}>
                <Text style={[styles.avatarText, { color: t.accent }]}>{initials}</Text>
            </View>

            {/* Content */}
            <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                    <Text style={[styles.peerName, { color: t.text }]} numberOfLines={1}>
                        {item.peerAlias ?? item.peerId}
                    </Text>
                    <Text style={[styles.timeLabel, { color: t.textMuted }]}>
                        {timeLabel(item.lastTime)}
                    </Text>
                </View>
                <View style={styles.rowBottom}>
                    <Text style={[styles.lastMessage, { color: t.textSub }]} numberOfLines={1}>
                        {item.lastMessage ?? 'No messages yet'}
                    </Text>
                    {item.unread > 0 && (
                        <View style={[styles.badge, { backgroundColor: t.accent }]}>
                            <Text style={styles.badgeText}>{item.unread}</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function MessagesScreen() {
    const { theme: t } = useThemeStore();
    const { identity } = useIdentityStore();
    const { conversations, loadConversations } = useMessagesStore();
    const navigation = useNavigation<any>();

    useEffect(() => {
        if (identity) loadConversations(identity.publicKeyBase58);
    }, [identity]);

    const openChat = (peerId: string) => {
        navigation.navigate('Chat', { peerId });
    };

    const openNewChat = () => {
        navigation.navigate('NewChat');
    };

    return (
        <View style={[styles.container, { backgroundColor: t.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={[styles.title, { color: t.text }]}>Messages</Text>
                    <Text style={[styles.subtitle, { color: t.textMuted }]}>
                        Your conversations
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.newButton, { backgroundColor: t.accent }]}
                    onPress={openNewChat}
                    activeOpacity={0.8}>
                    <Icon name="edit" size={16} color="#fff" />
                </TouchableOpacity>
            </View>

            {conversations.length === 0 ? (
                <View style={styles.empty}>
                    <View style={[styles.emptyIcon, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                        <Icon name="message-circle" size={32} color={t.textMuted} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: t.text }]}>No conversations yet</Text>
                    <Text style={[styles.emptySub, { color: t.textSub }]}>
                        Tap the pencil icon to start a new chat{'\n'}by entering a peer's node ID.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={item => item.peerId}
                    renderItem={({ item }) => (
                        <ConversationRow item={item} onPress={() => openChat(item.peerId)} />
                    )}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 56 },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        marginBottom: 8,
    },
    title: { fontSize: 28, fontFamily: Font.bold, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, fontFamily: Font.regular, marginTop: 2 },

    newButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderBottomWidth: 1,
        gap: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    avatarText: { fontSize: 16, fontFamily: Font.bold },
    rowContent: { flex: 1 },
    rowTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    peerName: {
        fontSize: 15,
        fontFamily: Font.semiBold,
        flex: 1,
        marginRight: 8,
    },
    timeLabel: { fontSize: 12, fontFamily: Font.regular },
    rowBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    lastMessage: { fontSize: 13, fontFamily: Font.regular, flex: 1, marginRight: 8 },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 11, fontFamily: Font.bold },

    empty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, fontFamily: Font.semiBold, textAlign: 'center' },
    emptySub: {
        fontSize: 14,
        fontFamily: Font.regular,
        textAlign: 'center',
        lineHeight: 21,
    },
});