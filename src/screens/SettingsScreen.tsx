import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput } from 'react-native';
import { POWER_PROFILES, PowerMode, useMeshService } from '../store/meshService';
import DiagnosticsModal from '../components/DiagnosticsModal';
import Icon from 'react-native-vector-icons/Feather';
import { useThemeStore, Font } from '../theme';
import { useIdentityStore } from '../store/identityStore';
import { ScrollView } from 'react-native';

interface SettingRowProps {
    icon: string;
    label: string;
    sublabel?: string;
    right?: React.ReactNode;
    onPress?: () => void;
}

function SettingRow({ icon, label, sublabel, right, onPress }: SettingRowProps) {
    const { theme: t } = useThemeStore();

    const Inner = (
        <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: t.accentSoft }]}>
                <Icon name={icon} size={16} color={t.accent} />
            </View>
            <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: t.text }]}>{label}</Text>
                {sublabel ? (
                    <Text style={[styles.rowSublabel, { color: t.textMuted }]}>{sublabel}</Text>
                ) : null}
            </View>
            {right ?? <Icon name="chevron-right" size={16} color={t.textMuted} />}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
                {Inner}
            </TouchableOpacity>
        );
    }
    return Inner;
}

function SectionLabel({ label }: { label: string }) {
    const { theme: t } = useThemeStore();
    return (
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>{label}</Text>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
    const { theme: t, isDark, toggle } = useThemeStore();
    const { identity } = useIdentityStore();
    const { alias, setAlias, powerMode, setPowerMode, status, neighbours, routes, carrying } = useMeshService();
    const [aliasDraft, setAliasDraft] = useState(alias);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    useEffect(() => setAliasDraft(alias), [alias]);

    return (
        <ScrollView style={[styles.container, { backgroundColor: t.bg }]} contentContainerStyle={{ paddingBottom: 70 }}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: t.text }]}>Settings</Text>
                <Text style={[styles.headerSub, { color: t.textMuted }]}>
                    Preferences & info
                </Text>
            </View>

            {/* Appearance */}
            <SectionLabel label="APPEARANCE" />
            <SettingRow
                icon={isDark ? 'moon' : 'sun'}
                label="Dark Mode"
                sublabel={isDark ? 'Currently dark' : 'Currently light'}
                right={
                    <Switch
                        value={isDark}
                        onValueChange={toggle}
                        trackColor={{ false: '#D1D5DB', true: t.accentBorder }}
                        thumbColor={isDark ? t.accent : '#FFFFFF'}
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                }
            />

            {/* Identity */}
            <SectionLabel label="IDENTITY" />
            <SettingRow
                icon="user"
                label="Your Short ID"
                sublabel={identity?.shortId ?? '—'}
                right={<View />}
            />
            <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[styles.rowIcon, { backgroundColor: t.accentSoft }]}>
                    <Icon name="tag" size={16} color={t.accent} />
                </View>
                <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: t.text }]}>Display name</Text>
                    <TextInput
                        style={[styles.aliasInput, { color: t.text, borderColor: t.border }]}
                        placeholder="Shown to people you message"
                        placeholderTextColor={t.textMuted}
                        value={aliasDraft}
                        onChangeText={setAliasDraft}
                        onEndEditing={() => setAlias(aliasDraft)}
                        maxLength={32}
                    />
                </View>
                {aliasDraft.trim() !== alias && (
                    <TouchableOpacity onPress={() => setAlias(aliasDraft)}>
                        <Text style={[styles.saveText, { color: t.accent }]}>Save</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Network */}
            <SectionLabel label="BATTERY" />
            {(Object.keys(POWER_PROFILES) as PowerMode[]).map(mode => (
                <SettingRow
                    key={mode}
                    icon={mode === 'performance' ? 'zap' : mode === 'balanced' ? 'activity' : 'battery'}
                    label={POWER_PROFILES[mode].label}
                    sublabel={POWER_PROFILES[mode].description}
                    onPress={() => setPowerMode(mode)}
                    right={
                        <Icon
                            name={powerMode === mode ? 'check-circle' : 'circle'}
                            size={18}
                            color={powerMode === mode ? t.accent : t.textMuted}
                        />
                    }
                />
            ))}

            <SectionLabel label="NETWORK" />
            <SettingRow
                icon="radio"
                label="Mesh radio"
                sublabel={
                    status === 'running'
                        ? `On · ${neighbours.length} linked · ${routes.length} reachable · carrying ${carrying}`
                        : status === 'starting' ? 'Starting…' : 'Off — see the Mesh tab'
                }
                right={<View />}
            />

            <SettingRow
                icon="terminal"
                label="Diagnostics"
                sublabel="Live routing table and event log — share it when reporting a problem"
                onPress={() => setShowDiagnostics(true)}
            />
            <DiagnosticsModal visible={showDiagnostics} onClose={() => setShowDiagnostics(false)} />

            {/* About */}
            <SectionLabel label="ABOUT" />
            <View style={[styles.aboutCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.aboutTitle, { color: t.text }]}>Aetheris</Text>
                <Text style={[styles.aboutVersion, { color: t.textMuted }]}>Version 1.0.0</Text>
                <Text style={[styles.aboutDesc, { color: t.textSub }]}>
                    Offline messaging that hops phone to phone over Bluetooth and Wi-Fi.{'\n'}
                    No internet. No servers. No accounts.
                </Text>
            </View>
        </ScrollView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 },

    header: { marginBottom: 28 },
    headerTitle: { fontSize: 28, fontFamily: Font.bold, letterSpacing: -0.5, marginBottom: 4 },
    headerSub: { fontSize: 14, fontFamily: Font.regular },

    sectionLabel: {
        fontSize: 10, fontFamily: Font.bold,
        letterSpacing: 2, marginBottom: 8, marginTop: 20,
    },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8,
    },
    rowIcon: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 15, fontFamily: Font.medium },
    rowSublabel: { fontSize: 12, fontFamily: Font.regular, marginTop: 1 },

    aliasInput: {
        fontSize: 14, fontFamily: Font.regular, borderBottomWidth: 1,
        paddingVertical: 4, paddingHorizontal: 0, marginTop: 2,
    },
    saveText: { fontSize: 13, fontFamily: Font.bold },

    comingSoonBadge: {
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    },
    comingSoonText: { fontSize: 11, fontFamily: Font.semiBold },

    aboutCard: {
        borderWidth: 1, borderRadius: 16, padding: 18,
    },
    aboutTitle: { fontSize: 16, fontFamily: Font.bold, marginBottom: 2 },
    aboutVersion: { fontSize: 12, fontFamily: Font.regular, marginBottom: 10 },
    aboutDesc: { fontSize: 13, fontFamily: Font.regular, lineHeight: 20 },
});