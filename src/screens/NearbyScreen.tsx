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
import { AetherisBridge, NativePeer } from '../native/AetherisBridge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Peer {
    id: string;
    rssi: number;
    lastSeen: number;
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalBars({ bars, color }: { bars: number; color: string }) {
    return (
        <View style={signalStyles.row}>
            {[1, 2, 3, 4].map(i => (
                <View
                    key={i}
                    style={[
                        signalStyles.bar,
                        { height: 4 + i * 3, backgroundColor: i <= bars ? color : '#2A2F3D' },
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
                    Animated.timing(scale, {
                        toValue: 1,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.sequence([
                    Animated.timing(opacity, {
                        toValue: 0,
                        duration: 1400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacity, {
                        toValue: 0.6,
                        duration: 0,
                        useNativeDriver: true,
                    }),
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
                    {
                        borderColor: color,
                        transform: [{ scale }],
                        opacity,
                    },
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

function PeerCard({ peer }: { peer: Peer }) {
    const { theme: t } = useThemeStore();
    const signal = rssiToSignal(peer.rssi);

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
            </View>

            <View style={peerStyles.signalWrap}>
                <SignalBars bars={signal.bars} color={signal.color} />
                <Text style={[peerStyles.signalLabel, { color: signal.color }]}>
                    {signal.label}
                </Text>
                <Text style={[peerStyles.rssiText, { color: t.textMuted }]}>
                    {peer.rssi} dBm
                </Text>
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
    peerId: { fontSize: 15, fontFamily: Font.semiBold, letterSpacing: 1 },
    lastSeen: { fontSize: 11, fontFamily: Font.regular, marginTop: 2 },
    signalWrap: { alignItems: 'center', gap: 3 },
    signalLabel: { fontSize: 10, fontFamily: Font.semiBold },
    rssiText: { fontSize: 9, fontFamily: Font.regular },
});

// ─── Permission helpers ───────────────────────────────────────────────────────

async function requestBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const androidVersion = Platform.Version as number;

    if (androidVersion >= 31) {
        // Android 12+: new BLE permissions
        const results = await Promise.all([
            request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN),
            request(PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE),
            request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT),
        ]);
        return results.every(r => r === RESULTS.GRANTED);
    } else {
        // Android < 12: location permission required for BLE
        const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        return result === RESULTS.GRANTED;
    }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'bt_off';

export default function NearbyScreen() {
    const { theme: t } = useThemeStore();
    const { identity } = useIdentityStore();

    const [peers, setPeers] = useState<Peer[]>([]);
    const [scanState, setScanState] = useState<ScanState>('idle');
    const peersRef = useRef<Peer[]>([]);

    // Keep ref in sync for use inside event callbacks
    const updatePeers = useCallback((updater: (prev: Peer[]) => Peer[]) => {
        const next = updater(peersRef.current);
        peersRef.current = next;
        setPeers([...next]);
    }, []);

    useEffect(() => {
        // Set up BLE event listeners
        const subDiscovered = AetherisBridge.onPeerDiscovered(peer => {
            updatePeers(prev => {
                if (prev.find(p => p.id === peer.id)) return prev;
                return [...prev, { id: peer.id, rssi: peer.rssi, lastSeen: peer.lastSeen }];
            });
        });

        const subUpdated = AetherisBridge.onPeerUpdated(peer => {
            updatePeers(prev =>
                prev.map(p =>
                    p.id === peer.id
                        ? { ...p, rssi: peer.rssi, lastSeen: peer.lastSeen }
                        : p,
                ),
            );
        });

        const subLost = AetherisBridge.onPeerLost(({ id }) => {
            updatePeers(prev => prev.filter(p => p.id !== id));
        });

        return () => {
            subDiscovered.remove();
            subUpdated.remove();
            subLost.remove();
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
        } catch (e: any) {
            setScanState('idle');
        }
    };

    const stopScan = async () => {
        await AetherisBridge.stopDiscovery();
        setScanState('idle');
        setPeers([]);
        peersRef.current = [];
    };

    // ─── Render helpers ─────────────────────────────────────────────────────

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

                {scanState === 'scanning' ? (
                    <PulsingRing color={t.accent} />
                ) : null}
            </View>

            {/* Scan button */}
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

            {/* Status messages */}
            {scanState === 'denied' && (
                <View style={[styles.statusBanner, { backgroundColor: t.errorBg, borderColor: t.errorBorder }]}>
                    <Icon name="alert-triangle" size={14} color={t.errorText} />
                    <Text style={[styles.statusText, { color: t.errorText }]}>
                        Bluetooth permission denied. Enable it in Settings.
                    </Text>
                </View>
            )}

            {scanState === 'bt_off' && (
                <View style={[styles.statusBanner, { backgroundColor: t.errorBg, borderColor: t.errorBorder }]}>
                    <Icon name="bluetooth-off" size={14} color={t.errorText} />
                    <Text style={[styles.statusText, { color: t.errorText }]}>
                        Bluetooth is off. Please enable it.
                    </Text>
                </View>
            )}

            {peers.length > 0 && (
                <Text style={[styles.listLabel, { color: t.textMuted }]}>PEERS</Text>
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
                renderItem={({ item }) => <PeerCard peer={item} />}
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
    listContent: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 32, flexGrow: 1 },

    headerWrap: { marginBottom: 8 },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    headerTitle: { fontSize: 28, fontFamily: Font.bold, letterSpacing: -0.5, marginBottom: 4 },
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
    scanButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: Font.semiBold,
    },
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

    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    statusText: { fontSize: 13, fontFamily: Font.regular, flex: 1 },

    listLabel: {
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