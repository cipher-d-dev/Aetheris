import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Switch, Pressable, Modal, TextInput, Alert, Share} from 'react-native';
import {Font, ThemeMode, Type, useThemeStore} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {dbSetSetting} from '../db/database';
import {formatLogTime, getLogLines} from '../utils/logBuffer';
import Avatar from '../ui/Avatar';
import ListRow, {Section} from '../ui/ListRow';
import Button from '../ui/Button';
import {Icon} from '../ui/Icon';

const MODES: {mode: ThemeMode; label: string}[] = [
  {mode: 'system', label: 'Auto'},
  {mode: 'light', label: 'Light'},
  {mode: 'dark', label: 'Dark'},
];

export default function SettingsScreen() {
  const {theme: t, mode, setMode} = useThemeStore();
  const insets = useSafeAreaInsets();
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? 'me');
  const mesh = useMeshService();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const chooseMode = (m: ThemeMode) => {
    setMode(m);
    try {
      dbSetSetting('themeMode', m);
    } catch {}
  };

  const saveName = () => {
    if (draft.trim()) mesh.setAlias(draft);
    setEditing(false);
  };

  const sendReport = () => {
    const lines = getLogLines();
    const report = [
      `Aetheris problem report — ${new Date().toISOString()}`,
      `status=${mesh.status} permission=${mesh.permission} bluetooth=${mesh.bluetoothOn} battery=${mesh.powerMode}`,
      `phones in range=${mesh.nearbyCount} connected=${mesh.neighbours.length} reachable=${mesh.routes.length} waiting=${mesh.carrying}`,
      ...mesh.routes.map(r => `  ${r.id.slice(0, 10)} hops=${r.hops} via=${r.nextHop.slice(0, 10)}`),
      '',
      ...lines.map(l => `${formatLogTime(l.t)} ${l.msg}`),
    ].join('\n');
    Share.share({message: report}).catch(() => undefined);
  };

  const tips = () =>
    Alert.alert(
      "Can't see someone?",
      '• Both phones need Aetheris open (or running in the background).\n' +
        '• Turn on Bluetooth and Location on both phones.\n' +
        '• Stay within about 30 metres. Walls shorten the range.\n' +
        '• Turn off battery saver for Aetheris in your phone settings.\n\n' +
        'Messages to people who are away are kept and delivered when they come back nearby.',
    );

  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      <ScrollView contentContainerStyle={{paddingBottom: 40 + insets.bottom}}>
        <Text style={[Type.largeTitle, styles.title, {paddingTop: insets.top + 56, color: t.text}]}>Settings</Text>

        <Pressable
          onPress={() => {
            setDraft(mesh.alias);
            setEditing(true);
          }}
          style={({pressed}) => [styles.profile, {backgroundColor: pressed ? t.surfaceAlt : t.surface}]}>
          <Avatar id={selfId} name={mesh.alias || '?'} size={64} />
          <View style={{flex: 1}}>
            <Text style={[styles.profileName, {color: t.text}]}>{mesh.alias || 'Add your name'}</Text>
            <Text style={[styles.profileSub, {color: t.textMuted}]}>This is how people nearby see you</Text>
          </View>
          <Icon name="pencil" size={18} color={t.textMuted} />
        </Pressable>

        <Section title="Appearance">
          <View style={styles.segmentWrap}>
            <View accessibilityRole="radiogroup" style={[styles.segment, {backgroundColor: t.surfaceAlt}]}>
              {MODES.map(m => {
                const on = mode === m.mode;
                return (
                  <Pressable
                    key={m.mode}
                    accessibilityRole="radio"
                    accessibilityState={{checked: on}}
                    onPress={() => chooseMode(m.mode)}
                    style={[styles.segmentItem, on && {backgroundColor: t.bg}]}>
                    <Text style={[styles.segmentText, {color: on ? t.text : t.textSub}]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        <Section title="Battery">
          <ListRow
            icon="battery-half-outline"
            iconColor="#17C964"
            title="Save battery"
            subtitle="Looks for people less often. New people may take a minute to appear."
            right={
              <Switch
                value={mesh.powerMode === 'saver'}
                onValueChange={on => mesh.setPowerMode(on ? 'saver' : 'balanced')}
                trackColor={{false: t.surfaceAlt, true: t.primary}}
                thumbColor="#FFFFFF"
              />
            }
          />
        </Section>

        <Section title="Help">
          <ListRow icon="help-circle-outline" iconColor="#0EA5E9" title="Can't see someone?" onPress={tips} />
          <ListRow
            icon="share-outline"
            iconColor="#F5A524"
            title="Send a problem report"
            subtitle="Shares technical details to help fix connection problems"
            onPress={sendReport}
          />
        </Section>

        <Text style={[styles.about, {color: t.textMuted}]}>
          Aetheris 1.0 · Messages travel phone to phone, encrypted end to end. No internet, no accounts.
        </Text>
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={() => setEditing(false)}>
          <Pressable style={[styles.sheet, {backgroundColor: t.bg}]}>
            <Text style={[Type.title, {color: t.text}]}>Your name</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Your name"
              placeholderTextColor={t.textMuted}
              autoFocus
              maxLength={32}
              style={[styles.input, {color: t.text, backgroundColor: t.surface}]}
              onSubmitEditing={saveName}
            />
            <Button title="Save" onPress={saveName} disabled={!draft.trim()} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {paddingHorizontal: 20, paddingBottom: 12},
  profile: {flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, padding: 16, borderRadius: 20},
  profileName: {fontFamily: Font.bold, fontSize: 19},
  profileSub: {fontFamily: Font.regular, fontSize: 13, marginTop: 3},
  segmentWrap: {padding: 8},
  segment: {flexDirection: 'row', borderRadius: 12, padding: 3},
  segmentItem: {flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10},
  segmentText: {fontFamily: Font.semiBold, fontSize: 14},
  about: {fontFamily: Font.regular, fontSize: 12.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 40, marginTop: 28},
  backdrop: {flex: 1, justifyContent: 'center', padding: 24},
  sheet: {borderRadius: 24, padding: 20, gap: 14},
  input: {height: 52, borderRadius: 14, paddingHorizontal: 16, fontFamily: Font.medium, fontSize: 16},
});
