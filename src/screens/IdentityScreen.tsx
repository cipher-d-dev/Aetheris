import React, { useEffect } from 'react';
import {
    View, Text, StyleSheet, ActivityIndicator,
    TouchableOpacity, Clipboard, Alert, StatusBar,
} from 'react-native';
import { useIdentityStore } from '../store/identityStore';

export default function IdentityScreen() {
    const { identity, isLoading, error, initialize } = useIdentityStore();

    useEffect(() => {
        initialize();
    }, []);

    const copyId = () => {
        if (!identity) return;
        Clipboard.setString(identity.publicKeyBase58);
        Alert.alert('Copied', 'Full public key copied to clipboard');
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <StatusBar barStyle="light-content" backgroundColor="#050505" />
                <ActivityIndicator size="large" color="#00f0ff" />
                <Text style={styles.loadingText}>Initializing identity...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.center}>
                <StatusBar barStyle="light-content" backgroundColor="#050505" />
                <View style={styles.errorBox}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorTitle}>Something went wrong</Text>
                    <Text style={styles.errorMessage}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={initialize}>
                        <Text style={styles.retryText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#050505" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.dot} />
                <Text style={styles.appName}>AETHERIS</Text>
                <View style={styles.dot} />
            </View>

            {/* ID Card */}
            <View style={styles.card}>
                <Text style={styles.cardLabel}>YOUR NODE ID</Text>

                <View style={styles.idBox}>
                    <Text style={styles.shortId}>{identity?.shortId}</Text>
                </View>

                <Text style={styles.hint}>
                    Share this ID so others can find and message you on the mesh
                </Text>

                <TouchableOpacity style={styles.copyButton} onPress={copyId} activeOpacity={0.75}>
                    <Text style={styles.copyIcon}>⧉</Text>
                    <Text style={styles.copyButtonText}>Copy Full Public Key</Text>
                </TouchableOpacity>
            </View>

            {/* Debug section */}
            <View style={styles.debugCard}>
                <Text style={styles.debugLabel}>PUBLIC KEY  •  DEBUG</Text>
                <Text style={styles.debugKey} numberOfLines={3} ellipsizeMode="middle">
                    {identity?.publicKeyBase58}
                </Text>
            </View>

            <Text style={styles.footer}>End-to-end encrypted  •  No servers  •  No accounts</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // Layout
    container: {
        flex: 1,
        backgroundColor: '#050505',
        padding: 24,
        justifyContent: 'center',
    },
    center: {
        flex: 1,
        backgroundColor: '#050505',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },

    // Loading
    loadingText: {
        color: '#555',
        fontSize: 13,
        marginTop: 16,
        letterSpacing: 1,
    },

    // Error
    errorBox: {
        backgroundColor: '#0f0505',
        borderWidth: 1,
        borderColor: '#ff3b3b33',
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        width: '100%',
    },
    errorIcon: {
        fontSize: 36,
        marginBottom: 12,
    },
    errorTitle: {
        color: '#ff6b6b',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    errorMessage: {
        color: '#884444',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
    },
    retryButton: {
        borderWidth: 1,
        borderColor: '#ff3b3b',
        borderRadius: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    retryText: {
        color: '#ff6b6b',
        fontSize: 13,
        fontWeight: '600',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 36,
        gap: 10,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#00f0ff',
        opacity: 0.6,
    },
    appName: {
        color: '#00f0ff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 6,
        opacity: 0.8,
    },

    // ID Card
    card: {
        backgroundColor: '#0d0d0d',
        borderRadius: 24,
        padding: 28,
        borderWidth: 1,
        borderColor: '#1a1a1a',
        marginBottom: 16,
        // subtle glow
        shadowColor: '#00f0ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 8,
    },
    cardLabel: {
        color: '#333',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 4,
        textAlign: 'center',
        marginBottom: 20,
    },
    idBox: {
        backgroundColor: '#080808',
        borderRadius: 14,
        paddingVertical: 24,
        paddingHorizontal: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#00f0ff18',
        marginBottom: 20,
    },
    shortId: {
        color: '#00f0ff',
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: 10,
        fontFamily: 'monospace',
    },
    hint: {
        color: '#444',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 24,
        paddingHorizontal: 8,
    },
    copyButton: {
        backgroundColor: '#00f0ff0f',
        borderWidth: 1,
        borderColor: '#00f0ff30',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    copyIcon: {
        color: '#00f0ff',
        fontSize: 14,
    },
    copyButtonText: {
        color: '#00f0ff',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.5,
    },

    // Debug card
    debugCard: {
        backgroundColor: '#0a0a0a',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#141414',
        marginBottom: 24,
    },
    debugLabel: {
        color: '#252525',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 3,
        marginBottom: 8,
    },
    debugKey: {
        color: '#2a2a2a',
        fontSize: 10,
        fontFamily: 'monospace',
        lineHeight: 15,
    },

    // Footer
    footer: {
        color: '#222',
        fontSize: 10,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
});