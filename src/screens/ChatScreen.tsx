import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useThemeStore, Font } from '../theme';
import { useIdentityStore } from '../store/identityStore';
import { useMessagesStore, Message } from '../store/messagesStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

function formatDateSeparator(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });
}

function needsDateSeparator(current: Message, previous?: Message): boolean {
    if (!previous) return true;
    return (
        new Date(current.createdAt).toDateString() !==
        new Date(previous.createdAt).toDateString()
    );
}

// ─── Status Icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: Message['status'] }) {
    const { theme: t } = useThemeStore();
    switch (status) {
        case 'pending':
            return <Icon name="clock" size={11} color={t.textMuted} />;
        case 'sent':
            return <Icon name="check" size={11} color={t.textMuted} />;
        case 'delivered':
            return <Icon name="check-circle" size={11} color={t.accent} />;
        case 'failed':
            return <Icon name="alert-circle" size={11} color={t.errorText} />;
        default:
            return null;
    }
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
    message,
    showTail,
}: {
    message: Message;
    showTail: boolean;
}) {
    const { theme: t } = useThemeStore();
    const isOutbound = message.isOutbound;

    const bubbleStyle = isOutbound
        ? [
            styles.bubble,
            styles.bubbleOut,
            {
                backgroundColor: t.accent,
                borderBottomRightRadius: showTail ? 4 : 18,
            },
        ]
        : [
            styles.bubble,
            styles.bubbleIn,
            {
                backgroundColor: t.surface,
                borderColor: t.border,
                borderBottomLeftRadius: showTail ? 4 : 18,
            },
        ];

    return (
        <View style={[styles.bubbleRow, isOutbound ? styles.rowOut : styles.rowIn]}>
            <View style={bubbleStyle}>
                <Text
                    style={[
                        styles.bubbleText,
                        { color: isOutbound ? '#FFFFFF' : t.text },
                    ]}>
                    {message.text}
                </Text>
                <View style={styles.bubbleMeta}>
                    <Text
                        style={[
                            styles.bubbleTime,
                            { color: isOutbound ? 'rgba(255,255,255,0.65)' : t.textMuted },
                        ]}>
                        {formatTime(message.createdAt)}
                    </Text>
                    {isOutbound && <StatusIcon status={message.status} />}
                </View>
            </View>
        </View>
    );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ timestamp }: { timestamp: number }) {
    const { theme: t } = useThemeStore();
    return (
        <View style={styles.dateSep}>
            <View style={[styles.dateLine, { backgroundColor: t.border }]} />
            <Text style={[styles.dateText, { color: t.textMuted }]}>
                {formatDateSeparator(timestamp)}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: t.border }]} />
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
    const { theme: t } = useThemeStore();
    const { identity } = useIdentityStore();
    const { messages, loadMessages, sendMessage } = useMessagesStore();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    const peerId: string = route.params?.peerId ?? '';
    const peerAlias: string = route.params?.peerAlias ?? peerId;

    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const conversation = messages[peerId] ?? [];

    useEffect(() => {
        if (identity) {
            loadMessages(identity.publicKeyBase58, peerId);
        }
    }, [identity, peerId]);

    useEffect(() => {
        if (conversation.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [conversation.length]);

    const handleSend = () => {
        if (!inputText.trim() || !identity || sending) return;

        const text = inputText.trim();
        setInputText('');
        setSending(true);

        try {
            sendMessage({
                myId: identity.publicKeyBase58,
                peerId,
                text,
            });
        } finally {
            setSending(false);
        }
    };

    // Build flat list data with date separators
    type ListItem =
        | { type: 'date'; key: string; timestamp: number }
        | { type: 'message'; key: string; message: Message; showTail: boolean };

    const listData: ListItem[] = [];
    conversation.forEach((msg, index) => {
        const prev = conversation[index - 1];
        const next = conversation[index + 1];

        if (needsDateSeparator(msg, prev)) {
            listData.push({ type: 'date', key: `date-${msg.id}`, timestamp: msg.createdAt });
        }

        const showTail =
            !next ||
            next.isOutbound !== msg.isOutbound ||
            needsDateSeparator(next, msg);

        listData.push({ type: 'message', key: msg.id, message: msg, showTail });
    });

    const displayName =
        peerAlias !== peerId
            ? peerAlias
            : peerId.length > 12
                ? `${peerId.slice(0, 5)}...${peerId.slice(-5)}`
                : peerId;

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: t.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}>

            {/* Header */}
            <View style={[styles.header, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
                <TouchableOpacity
                    style={[styles.backBtn, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}>
                    <Icon name="arrow-left" size={18} color={t.text} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <View style={[styles.headerAvatar, { backgroundColor: t.accentSoft, borderColor: t.accentBorder }]}>
                        <Text style={[styles.headerAvatarText, { color: t.accent }]}>
                            {displayName.slice(0, 2).toUpperCase()}
                        </Text>
                    </View>
                    <View>
                        <Text style={[styles.headerName, { color: t.text }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text style={[styles.headerStatus, { color: t.textMuted }]}>
                            Mesh node
                        </Text>
                    </View>
                </View>

                <View style={{ width: 40 }} />
            </View>

            {/* Messages */}
            {conversation.length === 0 ? (
                <View style={styles.emptyChat}>
                    <View style={[styles.emptyChatIcon, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                        <Icon name="lock" size={24} color={t.textMuted} />
                    </View>
                    <Text style={[styles.emptyChatTitle, { color: t.text }]}>
                        End-to-end encrypted
                    </Text>
                    <Text style={[styles.emptyChatSub, { color: t.textSub }]}>
                        Messages are encrypted and only{'\n'}
                        readable by you and {displayName}.
                    </Text>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={listData}
                    keyExtractor={item => item.key}
                    renderItem={({ item }) => {
                        if (item.type === 'date') {
                            return <DateSeparator timestamp={item.timestamp} />;
                        }
                        return (
                            <MessageBubble
                                message={item.message}
                                showTail={item.showTail}
                            />
                        );
                    }}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() =>
                        flatListRef.current?.scrollToEnd({ animated: false })
                    }
                />
            )}

            {/* Input bar */}
            <View style={[styles.inputBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
                <View style={[styles.inputWrap, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                    <TextInput
                        style={[styles.input, { color: t.text, fontFamily: Font.regular }]}
                        placeholder="Message..."
                        placeholderTextColor={t.textMuted}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={1000}
                        returnKeyType="default"
                    />
                </View>

                <TouchableOpacity
                    style={[
                        styles.sendBtn,
                        {
                            backgroundColor:
                                inputText.trim().length > 0 ? t.accent : t.surfaceAlt,
                        },
                    ]}
                    onPress={handleSend}
                    activeOpacity={0.8}
                    disabled={inputText.trim().length === 0 || sending}>
                    {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Icon
                            name="send"
                            size={16}
                            color={inputText.trim().length > 0 ? '#fff' : t.textMuted}
                        />
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 52,
        paddingBottom: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerCenter: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerAvatar: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerAvatarText: { fontSize: 14, fontFamily: Font.bold },
    headerName: { fontSize: 15, fontFamily: Font.semiBold, maxWidth: 180 },
    headerStatus: { fontSize: 11, fontFamily: Font.regular, marginTop: 1 },

    // Messages list
    messageList: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        flexGrow: 1,
    },

    // Bubble
    bubbleRow: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    rowOut: { justifyContent: 'flex-end' },
    rowIn: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '78%',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 18,
    },
    bubbleOut: {
        borderBottomRightRadius: 4,
    },
    bubbleIn: {
        borderWidth: 1,
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: 15,
        fontFamily: Font.regular,
        lineHeight: 21,
    },
    bubbleMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 4,
    },
    bubbleTime: { fontSize: 10, fontFamily: Font.regular },

    // Date separator
    dateSep: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 16,
        gap: 8,
    },
    dateLine: { flex: 1, height: 1 },
    dateText: { fontSize: 11, fontFamily: Font.medium },

    // Empty state
    emptyChat: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 40,
    },
    emptyChatIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    emptyChatTitle: { fontSize: 16, fontFamily: Font.semiBold },
    emptyChatSub: {
        fontSize: 13,
        fontFamily: Font.regular,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Input bar
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        gap: 10,
    },
    inputWrap: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 10,
        maxHeight: 120,
    },
    input: {
        fontSize: 15,
        lineHeight: 20,
        maxHeight: 100,
    },
    sendBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
});