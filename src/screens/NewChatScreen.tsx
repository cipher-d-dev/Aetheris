import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore, Font } from '../theme';

export default function NewChatScreen() {
    const { theme: t } = useThemeStore();
    const navigation = useNavigation<any>();
    const [peerId, setPeerId] = useState('');
    const [error, setError] = useState('');

    const handleStart = () => {
        const cleaned = peerId.trim();
        if (cleaned.length < 4) {
            setError('Please enter a valid node ID.');
            return;
        }
        setError('');
        navigation.replace('Chat', { peerId: cleaned });
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: t.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={[styles.backButton, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                    <Icon name="arrow-left" size={18} color={t.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: t.text }]}>New Chat</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.body}>
                <Text style={[styles.label, { color: t.textSub }]}>
                    Enter the node ID of the person you want to message.{'\n'}
                    They shared it with you from their Identity screen.
                </Text>

                <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: error ? t.errorText : t.border }]}>
                    <Icon name="user" size={16} color={t.textMuted} style={styles.inputIcon} />
                    <TextInput
                        style={[styles.input, { color: t.text, fontFamily: Font.regular }]}
                        placeholder="e.g. 2YXW-PNHE or full public key"
                        placeholderTextColor={t.textMuted}
                        value={peerId}
                        onChangeText={v => { setPeerId(v); setError(''); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleStart}
                    />
                </View>

                {error !== '' && (
                    <Text style={[styles.errorText, { color: t.errorText }]}>{error}</Text>
                )}

                <TouchableOpacity
                    style={[
                        styles.startButton,
                        { backgroundColor: peerId.trim().length >= 4 ? t.accent : t.surfaceAlt },
                    ]}
                    onPress={handleStart}
                    activeOpacity={0.8}>
                    <Icon
                        name="arrow-right"
                        size={16}
                        color={peerId.trim().length >= 4 ? '#fff' : t.textMuted}
                    />
                    <Text
                        style={[
                            styles.startButtonText,
                            { color: peerId.trim().length >= 4 ? '#fff' : t.textMuted },
                        ]}>
                        Start Conversation
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 56 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginBottom: 32,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    title: { fontSize: 18, fontFamily: Font.bold },

    body: { paddingHorizontal: 24 },
    label: {
        fontSize: 14,
        fontFamily: Font.regular,
        lineHeight: 21,
        marginBottom: 24,
    },

    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: 12,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 15 },

    errorText: { fontSize: 13, fontFamily: Font.regular, marginBottom: 12 },

    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 15,
        marginTop: 8,
    },
    startButtonText: { fontSize: 15, fontFamily: Font.semiBold },
});