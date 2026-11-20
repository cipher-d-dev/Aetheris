import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, Share} from 'react-native';
import {ACCENTS, AccentName, Font, ThemeMode, Type, useThemeStore} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {POWER_PROFILES, PowerMode, useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {dbSetSetting} from '../db/database';
import {formatLogTime, getLogLines} from '../utils/logBuffer';
import Avatar from '../ui/Avatar';
import ListRow, {Section} from '../ui/ListRow';
import OptionSheet from '../ui/OptionSheet';
import ColorSheet from '../ui/ColorSheet';
import AboutSheet from '../ui/AboutSheet';
import {AetherisBridge} from '../native/AetherisBridge';
import {useAvatarStore} from '../store/avatarStore';
import Button from '../ui/Button';
import {Icon} from '../ui/Icon';
import {showDialog} from '../ui/dialog';
import {MESH_TIPS, MESH_TIPS_TITLE} from '../ui/meshStatus';

const MODES: {value: ThemeMode; label: string; description: string; icon: string}[] = [
  {value: 'system', label: 'Auto', description: "Follow your phone's setting", icon: 'phone-portrait-outline'},
  {value: 'light', label: 'Light', description: 'Always light', icon: 'sunny-outline'},
  {value: 'dark', label: 'Dark', description: 'Always dark', icon: 'moon-outline'},
];

const POWER_MODES: PowerMode[] = ['performance', 'balanced', 'saver'];

export default function SettingsScreen() {
  const {theme: t, mode, setMode} = useThemeStore();
  const insets = useSafeAreaInsets();
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? 'me');
  const mesh = useMeshService();
  const hasPhoto = useAvatarStore(s => !!s.avatars[selfId]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<'theme' | 'accent' | 'battery' | 'photo' | 'about' | null>(null);
  const {accent, setAccent} = useThemeStore();

  const chooseAccent = (a: AccentName) => {
    setAccent(a);
    try {
      dbSetSetting('accent', a);
    } catch {}
  };

  const chooseMode = (m: ThemeMode) => {
    setMode(m);
    try {
      dbSetSetting('themeMode', m);
    } catch {}
  };

  const editName = () => {
    setDraft(mesh.alias);
    setEditing(true);
  };

  const saveName = () => {
    if (draft.trim()) mesh.setAlias(draft);
    setEditing(false);
  };

  const choosePhoto = async () => {
    try {
      const img = await AetherisBridge.pickImage(192, 70, true);
      if (img) await mesh.setPhoto(img.data);
    } catch (e: any) {
      showDialog("Couldn't use that photo", e?.message ?? 'Try a different one.', undefined, {icon: 'image-outline', tone: 'warning'});
    }
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

  const tips = () => showDialog(MESH_TIPS_TITLE, MESH_TIPS, [{text: 'Got it'}], {icon: 'help-buoy-outline'});

  const relaying = mesh.carryingForOthers;
  const nearby = mesh.routes.length;

  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      <ScrollView contentContainerStyle={{paddingBottom: 32 + insets.bottom}}>
        <Text accessibilityRole="header" style={[styles.title, {paddingTop: insets.top + 14, color: t.text}]}>
          Settings
        </Text>

        {/* Profile */}
        <View style={styles.hero}>
          <Pressable
            onPress={() => setSheet('photo')}
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
            style={({pressed}) => [pressed && {opacity: 0.8}]}>
            <Avatar id={selfId} name={mesh.alias || '?'} size={92} />
            <View style={[styles.cameraBadge, {backgroundColor: t.primary, borderColor: t.bg}]}>
              <Icon name="camera" size={15} color={t.onPrimary} />
            </View>
          </Pressable>
          <Pressable onPress={editName} accessibilityRole="button" accessibilityLabel={`Name, ${mesh.alias || 'not set'}. Edit`} style={styles.nameRow}>
            <Text style={[styles.heroName, {color: t.text}]} numberOfLines={1}>
              {mesh.alias || 'Add your name'}
            </Text>
            <Icon name="pencil" size={15} color={t.textMuted} />
          </Pressable>
          <View style={[styles.heroPill, {backgroundColor: t.surface}]}>
            <View style={[styles.dot, {backgroundColor: nearby > 0 ? t.online : t.textMuted}]} />
            <Text style={[styles.heroPillText, {color: t.textSub}]}>
              {mesh.status !== 'running'
                ? 'Starting…'
                : nearby > 0
                ? `Visible to ${nearby} ${nearby === 1 ? 'person' : 'people'} nearby`
                : 'Visible to people nearby'}
            </Text>
          </View>
        </View>

        <Section title="Profile">
          <ListRow icon="person" iconColor="#5A4FDB" title="Name" value={mesh.alias || 'Not set'} onPress={editName} />
          <ListRow
            icon="image"
            iconColor="#EC4899"
            title="Profile photo"
            value={hasPhoto ? 'Set' : 'None'}
            onPress={() => setSheet('photo')}
          />
        </Section>

        <Section title="Preferences">
          <ListRow
            icon="color-palette"
            iconColor={t.primary}
            title="Colour"
            value={ACCENTS[accent].label}
            onPress={() => setSheet('accent')}
          />
          <ListRow
            icon="moon"
            iconColor="#334155"
            title="Light or dark"
            value={MODES.find(m => m.value === mode)?.label}
            onPress={() => setSheet('theme')}
          />
          <ListRow
            icon="battery-half"
            iconColor="#17C964"
            title="Battery use"
            value={POWER_PROFILES[mesh.powerMode].label}
            onPress={() => setSheet('battery')}
          />
        </Section>

        <Section
          title="Helping others"
          footer="When someone's message needs to travel further, your phone can pass it on. It stays encrypted: you can't read it.">
          <ListRow
            icon="git-network-outline"
            iconColor="#7C3AED"
            title="Messages you're passing on"
            value={String(relaying)}
          />
        </Section>

        <Section title="Help">
          <ListRow icon="help-circle" iconColor="#F59E0B" title="Can't see someone?" onPress={tips} />
          <ListRow icon="share" iconColor="#64748B" title="Send a problem report" onPress={sendReport} />
          <ListRow icon="information-circle" iconColor="#0EA5E9" title="About Aetheris" onPress={() => setSheet('about')} />
        </Section>

      </ScrollView>

      <OptionSheet
        visible={sheet === 'theme'}
        title="Light or dark"
        options={MODES}
        selected={mode}
        onSelect={chooseMode}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'battery'}
        title="Battery use"
        options={POWER_MODES.map(m => ({value: m, label: POWER_PROFILES[m].label, description: POWER_PROFILES[m].description}))}
        selected={mesh.powerMode}
        onSelect={m => mesh.setPowerMode(m)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'photo'}
        title="Profile photo"
        options={[
          {value: 'choose', label: hasPhoto ? 'Choose a new photo' : 'Choose a photo', icon: 'image-outline'},
          ...(hasPhoto ? [{value: 'remove', label: 'Remove photo', icon: 'trash-outline', destructive: true}] : []),
        ]}
        onSelect={v => (v === 'choose' ? choosePhoto() : mesh.setPhoto(null))}
        onClose={() => setSheet(null)}
      />

      <ColorSheet visible={sheet === 'accent'} onSelect={chooseAccent} onClose={() => setSheet(null)} />
      <AboutSheet visible={sheet === 'about'} onClose={() => setSheet(null)} />

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={() => setEditing(false)}>
          <Pressable style={[styles.dialog, {backgroundColor: t.bg}]}>
            <Text style={[Type.title, {color: t.text}]}>Your name</Text>
            <Text style={[styles.dialogHint, {color: t.textMuted}]}>People nearby see this when they want to message you.</Text>
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
  title: {fontFamily: Font.extraBold, fontSize: 24, letterSpacing: -0.5, paddingHorizontal: 20},
  hero: {alignItems: 'center', paddingTop: 10, gap: 8},
  cameraBadge: {position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center'},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, paddingHorizontal: 20, minHeight: 32},
  heroName: {fontFamily: Font.bold, fontSize: 20, letterSpacing: -0.3, maxWidth: 260},
  heroPill: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 26, borderRadius: 13},
  heroPillText: {fontFamily: Font.medium, fontSize: 12},
  dot: {width: 7, height: 7, borderRadius: 4},
  backdrop: {flex: 1, justifyContent: 'center', padding: 24},
  dialog: {borderRadius: 22, padding: 20, gap: 12},
  dialogHint: {fontFamily: Font.regular, fontSize: 13, lineHeight: 18, marginTop: -6},
  input: {height: 48, borderRadius: 12, paddingHorizontal: 14, fontFamily: Font.medium, fontSize: 15.5},
});
