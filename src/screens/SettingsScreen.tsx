import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
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
            <SettingRow
                icon="tag"
                label="Set Alias"
                sublabel="Coming soon — Day 5"
                right={
                    <View style={[styles.comingSoonBadge, { backgroundColor: t.accentSoft }]}>
                        <Text style={[styles.comingSoonText, { color: t.accent }]}>Soon</Text>
                    </View>
                }
            />

            {/* Network */}
            <SectionLabel label="NETWORK" />
            <SettingRow
                icon="bluetooth"
                label="BLE Discovery"
                sublabel="Coming soon — Day 2"
                right={
                    <View style={[styles.comingSoonBadge, { backgroundColor: t.accentSoft }]}>
                        <Text style={[styles.comingSoonText, { color: t.accent }]}>Soon</Text>
                    </View>
                }
            />
            <SettingRow
                icon="wifi"
                label="Wi-Fi Direct Transfer"
                sublabel="Coming soon — Day 3"
                right={
                    <View style={[styles.comingSoonBadge, { backgroundColor: t.accentSoft }]}>
                        <Text style={[styles.comingSoonText, { color: t.accent }]}>Soon</Text>
                    </View>
                }
            />

            {/* About */}
            <SectionLabel label="ABOUT" />
            <View style={[styles.aboutCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.aboutTitle, { color: t.text }]}>Aetheris</Text>
                <Text style={[styles.aboutVersion, { color: t.textMuted }]}>Version 0.1.0 — Day 1 Build</Text>
                <Text style={[styles.aboutDesc, { color: t.textSub }]}>
                    A decentralised, offline-first mesh messaging app.{'\n'}
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