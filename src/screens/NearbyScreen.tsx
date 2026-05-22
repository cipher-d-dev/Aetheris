import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Animated,
    Platform,
    Easing,
} from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Icon from 'react-native-vector-icons/Feather';
import { useThemeStore, Font } from '../theme';
import { useIdentityStore } from '../store/identityStore';
import {
    AetherisBridge,
    NativePeer,
    ConnectionState,
} from '../native/AetherisBridge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Peer {
    id: string;
    rssi: number;
    lastSeen: number;
    connectionState: ConnectionState | 'idle';
}

type ScanState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'bt_off';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rssiToSignal(rssi: number): { label: string; bars: number; color: string } {
    if (rssi >= -60) return { label: 'Strong', bars: 4, color: '#22C55E' };
    if (rssi >= -70) return { label: 'Good', bars: 3, color: '#84CC16' };
    if (rssi >= -80) return { label: 'Fair', bars: 2, color: '#F59E0B' };
    return { label: 'Weak', bars: 1, color: '#EF4444' };
}

function timeAgo(ms: number): string {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

function connectionStateLabel(state: ConnectionState | 'idle'): string {
    switch (state) {
        case 'idle': return '';
        case 'connecting': return 'Connecting...';
        case 'connected': return 'Connected';
        case 'disconnected': return 'Disconnected';
        case 'failed': return 'Failed';
    }
}

function connectionStateColor(state: ConnectionState | 'idle', accent: string): string {
    switch (state) {
        case 'connected': return '#22C55E';
        case 'connecting': return '#F59E0B';
        case 'failed': return '#EF4444';
        case 'disconnected': return '#6B7280';
        default: return accent;
    }
}

// ─── Signal Bars ──────────────────────────────────────────────────────────────

function SignalBars({ bars, color }: { bars: number; color: string }) {
    return (
        <View style={signalStyles.row}>
            {[1, 2, 3, 4].map(i => (
                <View
                    key={i}
                    style={[
                        signalStyles.bar,
                        {
                            height: 4 + i * 3,
                            backgroundColor: i <= bars ? color : '#3A3F4D',
                        },
                    ]}
                />
            ))}
        </View>
    );
}

const signalStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    bar: { width: 4, borderRadius: 2 },
});

// ─── Pulsing Ring ─────────────────────────────────────────────────────────────

function PulsingRing({ color }: { color: string }) {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(scale, {
                        toValue: 1.8,
                        duration: 1400,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
                ]),
                Animated.sequence([
                    Animated.timing(opacity, { toValue: 0, duration: 1400, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
                ]),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, []);

    return (
        <View style={pulseStyles.wrap}>
            <Animated.View
                style={[
                    pulseStyles.ring,
                    { borderColor: color, transform: [{ scale }], opacity },
                ]}
            />
            <View style={[pulseStyles.dot, { backgroundColor: color }]} />
        </View>
    );
}

const pulseStyles = StyleSheet.create({
    wrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    ring: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─── Peer Card ────────────────────────────────────────────────────────────────

function PeerCard({
    peer,
    onConnect,
    onDisconnect,
}: {
    peer: Peer;
    onConnect: (id: string) => void;
    onDisconnect: (id: string) => void;
}) {
    const { theme: t } = useThemeStore();
    const signal = rssiToSignal(peer.rssi);
    const connColor = connectionStateColor(peer.connectionState, t.accent);
    const isConnected = peer.connectionState === 'connected';
    const isConnecting = peer.connectionState === 'connecting';

    return (
        <View style={[peerStyles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[peerStyles.avatar, { backgroundColor: t.accentSoft, borderColor: t.accentBorder }]}>
                <Icon name="user" size={18} color={t.accent} />
            </View>

            <View style={peerStyles.info}>
                <Text style={[peerStyles.peerId, { color: t.text }]}>{peer.id}</Text>
                <Text style={[peerStyles.lastSeen, { color: t.textMuted }]}>
                    {timeAgo(peer.lastSeen)}
                </Text>
                {peer.connectionState !== 'idle' && (
                    <Text style={[peerStyles.connState, { color: connColor }]}>
                        {connectionStateLabel(peer.connectionState)}
                    </Text>
                )}
            </View>

            <View style={peerStyles.right}>
                <SignalBars bars={signal.bars} color={signal.color} />
                <Text style={[peerStyles.rssiText, { color: t.textMuted }]}>
                    {peer.rssi} dBm
                </Text>

                {isConnected ? (
                    <TouchableOpacity
                        style={[peerStyles.actionButton, { borderColor: '#EF4444' }]}
                        onPress={() => onDisconnect(peer.id)}
                        activeOpacity={0.7}>
                        <Text style={[peerStyles.actionText, { color: '#EF4444' }]}>
                            Disconnect
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[
                            peerStyles.actionButton,
                            { borderColor: isConnecting ? t.textMuted : t.accentBorder },
                        ]}
                        onPress={() => !isConnecting && onConnect(peer.id)}
                        activeOpacity={0.7}
                        disabled={isConnecting}>
                        <Text
                            style={[
                                peerStyles.actionText,
                                { color: isConnecting ? t.textMuted : t.accent },
                            ]}>
                            {isConnecting ? '...' : 'Connect'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const peerStyles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    info: { flex: 1 },
    peerId: { fontSize: 14, fontFamily: Font.semiBold, letterSpacing: 1 },
    lastSeen: { fontSize: 11, fontFamily: Font.regular, marginTop: 2 },
    connState: { fontSize: 11, fontFamily: Font.medium, marginTop: 2 },
    right: { alignItems: 'center', gap: 4 },
    rssiText: { fontSize: 9, fontFamily: Font.regular },
    actionButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginTop: 4,
    },
    actionText: { fontSize: 11, fontFamily: Font.semiBold },
});

// ─── Permission Helper ────────────────────────────────────────────────────────

async function requestBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const version = Platform.Version as number;

    if (version >= 31) {
        const results = await Promise.all([
            request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN),
            request(PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE),
            request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT),
        ]);
        return results.every(r => r === RESULTS.GRANTED);
    } else {
        const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        return result === RESULTS.GRANTED;
    }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NearbyScreen() {
    const { theme: t } = useThemeStore();
    const { identity } = useIdentityStore();

    const [peers, setPeers] = useState<Peer[]>([]);
    const [scanState, setScanState] = useState<ScanState>('idle');
    const peersRef = useRef<Peer[]>([]);

    const updatePeers = useCallback((updater: (prev: Peer[]) => Peer[]) => {
        const next = updater(peersRef.current);
        peersRef.current = next;
        setPeers([...next]);
    }, []);

    useEffect(() => {
        const subDiscovered = AetherisBridge.onPeerDiscovered((peer: NativePeer) => {
            updatePeers(prev => {
                if (prev.find(p => p.id === peer.id)) return prev;
                return [
                    ...prev,
                    { id: peer.id, rssi: peer.rssi, lastSeen: peer.lastSeen, connectionState: 'idle' },
                ];
            });
        });

        const subUpdated = AetherisBridge.onPeerUpdated((peer: NativePeer) => {
            updatePeers(prev =>
                prev.map(p =>
                    p.id === peer.id ? { ...p, rssi: peer.rssi, lastSeen: peer.lastSeen } : p,
                ),
            );
        });

        const subLost = AetherisBridge.onPeerLost(({ id }: { id: string }) => {
            updatePeers(prev => prev.filter(p => p.id !== id));
        });

        const subConnection = AetherisBridge.onConnectionStateChanged(event => {
            updatePeers(prev =>
                prev.map(p =>
                    p.id === event.peerId ? { ...p, connectionState: event.state } : p,
                ),
            );
        });

        return () => {
            subDiscovered.remove();
            subUpdated.remove();
            subLost.remove();
            subConnection.remove();
        };
    }, []);

    const startScan = async () => {
        if (!identity) return;
        setScanState('requesting');

        const granted = await requestBlePermissions();
        if (!granted) {
            setScanState('denied');
            return;
        }

        const btEnabled = await AetherisBridge.isBluetoothEnabled();
        if (!btEnabled) {
            setScanState('bt_off');
            return;
        }

        try {
            await AetherisBridge.startDiscovery(identity.publicKeyBase58);
            setScanState('scanning');
        } catch (e) {
            setScanState('idle');
        }
    };

    const stopScan = async () => {
        await AetherisBridge.stopDiscovery();
        setScanState('idle');
        peersRef.current = [];
        setPeers([]);
    };

    /**
     * NOTE: connectToPeer requires the Wi-Fi Direct MAC address, which is
     * separate from the Aetheris node ID. In a full implementation this
     * comes from a Wi-Fi Direct peer discovery scan. For now this is
     * wired up and ready — the MAC address resolution is a Day 5 enhancement
     * where we embed the WFD MAC in the BLE advertisement payload.
     *
     * For testing Day 3: pass the device's Wi-Fi Direct MAC manually.
     */
    const handleConnect = async (peerId: string) => {
        // Placeholder — in production the deviceAddress comes from BLE payload
        // For now connect triggers the Wi-Fi Direct flow from native side
        await AetherisBridge.connectToPeer('', peerId);
    };

    const handleDisconnect = async (peerId: string) => {
        await AetherisBridge.disconnectFromPeer(peerId);
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const renderHeader = () => (
        <View style={styles.headerWrap}>
            <View style={styles.headerTop}>
                <View>
                    <Text style={[styles.headerTitle, { color: t.text }]}>Nearby</Text>
                    <Text style={[styles.headerSub, { color: t.textMuted }]}>
                        {scanState === 'scanning'
                            ? `${peers.length} peer${peers.length !== 1 ? 's' : ''} found`
                            : 'Discover peers around you'}
                    </Text>
                </View>
                {scanState === 'scanning' && <PulsingRing color={t.accent} />}
            </View>

            {scanState !== 'scanning' ? (
                <TouchableOpacity
                    style={[styles.scanButton, { backgroundColor: t.accent }]}
                    onPress={startScan}
                    activeOpacity={0.8}
                    disabled={scanState === 'requesting'}>
                    <Icon name="radio" size={16} color="#FFFFFF" />
                    <Text style={styles.scanButtonText}>
                        {scanState === 'requesting' ? 'Starting...' : 'Start Scanning'}
                    </Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={[styles.stopButton, { borderColor: t.border, backgroundColor: t.surfaceAlt }]}
                    onPress={stopScan}
                    activeOpacity={0.8}>
                    <Icon name="square" size={14} color={t.textSub} />
                    <Text style={[styles.stopButtonText, { color: t.textSub }]}>Stop</Text>
                </TouchableOpacity>
            )}

            {scanState === 'denied' && (
                <View style={[styles.banner, { backgroundColor: t.errorBg, borderColor: t.errorBorder }]}>
                    <Icon name="alert-triangle" size={14} color={t.errorText} />
                    <Text style={[styles.bannerText, { color: t.errorText }]}>
                        Bluetooth permission denied. Enable it in device Settings.
                    </Text>
                </View>
            )}

            {scanState === 'bt_off' && (
                <View style={[styles.banner, { backgroundColor: t.errorBg, borderColor: t.errorBorder }]}>
                    <Icon name="bluetooth-off" size={14} color={t.errorText} />
                    <Text style={[styles.bannerText, { color: t.errorText }]}>
                        Bluetooth is off. Please enable it.
                    </Text>
                </View>
            )}

            {peers.length > 0 && (
                <Text style={[styles.sectionLabel, { color: t.textMuted }]}>PEERS</Text>
            )}
        </View>
    );

    const renderEmpty = () => {
        if (scanState !== 'scanning') return null;
        return (
            <View style={styles.emptyState}>
                <View style={[styles.emptyIconWrap, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
                    <Icon name="radio" size={28} color={t.textMuted} />
                </View>
                <Text style={[styles.emptyTitle, { color: t.text }]}>Scanning...</Text>
                <Text style={[styles.emptySubtitle, { color: t.textSub }]}>
                    Move closer to other Aetheris devices.{'\n'}
                    Peers appear here when detected.
                </Text>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: t.bg }]}>
            <FlatList
                data={peers}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <PeerCard
                        peer={item}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                    />
                )}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContent: {
        paddingHorizontal: 24,
        paddingTop: 56,
        paddingBottom: 32,
        flexGrow: 1,
    },

    headerWrap: { marginBottom: 8 },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontFamily: Font.bold,
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    headerSub: { fontSize: 14, fontFamily: Font.regular },

    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 14,
        marginBottom: 16,
    },
    scanButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: Font.semiBold },

    stopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 14,
        borderWidth: 1,
        marginBottom: 16,
    },
    stopButtonText: { fontSize: 15, fontFamily: Font.semiBold },

    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    bannerText: { fontSize: 13, fontFamily: Font.regular, flex: 1 },

    sectionLabel: {
        fontSize: 10,
        fontFamily: Font.bold,
        letterSpacing: 2,
        marginBottom: 8,
        marginTop: 4,
    },

    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
        gap: 12,
    },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, fontFamily: Font.semiBold },
    emptySubtitle: {
        fontSize: 14,
        fontFamily: Font.regular,
        textAlign: 'center',
        lineHeight: 21,
    },
});