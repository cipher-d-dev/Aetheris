import React, {useState} from 'react';
import {View, Text, TextInput, StyleSheet, KeyboardAvoidingView} from 'react-native';
import {openSettings} from 'react-native-permissions';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, Type, useThemeStore} from '../theme';
import {useMeshService} from '../store/meshService';
import {useIdentityStore} from '../store/identityStore';
import {requestRadioPermissions} from '../native/permissions';
import {keyboardAvoidingBehavior, useKeyboardVisible} from '../ui/keyboard';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import Logo from '../ui/Logo';
import {Icon} from '../ui/Icon';

/**
 * First run: pick a name, then allow Bluetooth/nearby access.
 * Calls onDone when finished.
 */
export default function OnboardingScreen({onDone}: {onDone: () => void}) {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const selfId = useIdentityStore(s => s.identity?.publicKeyBase58 ?? 'me');
  const setAlias = useMeshService(s => s.setAlias);
  const bootstrap = useMeshService(s => s.bootstrap);
  const [step, setStep] = useState<'name' | 'access'>('name');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const saveName = () => {
    if (!name.trim()) return;
    setAlias(name);
    setStep('access');
  };

  const allow = async () => {
    setBusy(true);
    const result = await requestRadioPermissions().catch(() => 'denied' as const);
    setBusy(false);
    if (result === 'blocked') {
      setBlocked(true);
      return;
    }
    bootstrap(selfId);
    onDone();
  };

  if (step === 'name') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, {paddingTop: insets.top + 40, paddingBottom: 32 + (keyboardVisible ? 0 : insets.bottom), backgroundColor: t.bg}]}
        behavior={keyboardAvoidingBehavior()}>
        <View style={styles.top}>
          <View style={styles.brandRow}>
            <Logo size={36} />
            <Text style={[styles.brand, {color: t.text}]}>Aetheris</Text>
          </View>
          <Text style={[Type.largeTitle, {color: t.text}]}>What should people call you?</Text>
          <Text style={[styles.lead, {color: t.textSub}]}>
            People near you will see this name when they want to message you.
          </Text>
          <View style={styles.preview}>
            {name.trim() ? (
              <Avatar id={selfId} name={name} size={96} />
            ) : (
              <View style={[styles.emptyAvatar, {backgroundColor: t.surface}]}>
                <Icon name="person" size={44} color={t.textMuted} />
              </View>
            )}
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={t.textMuted}
            autoFocus
            maxLength={32}
            returnKeyType="next"
            onSubmitEditing={saveName}
            style={[styles.input, {color: t.text, backgroundColor: t.surface}]}
          />
        </View>
        <Button title="Continue" onPress={saveName} disabled={!name.trim()} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, {paddingTop: insets.top + 40, paddingBottom: 32 + insets.bottom, backgroundColor: t.bg}]}>
      <View style={styles.top}>
        <View style={[styles.hero, {backgroundColor: t.primarySoft}]}>
          <Icon name="people" size={56} color={t.primary} />
        </View>
        <Text style={[Type.largeTitle, styles.center, {color: t.text}]}>Chat with people around you</Text>
        <Text style={[styles.lead, styles.center, {color: t.textSub}]}>
          Aetheris connects straight to nearby phones over Bluetooth and Wi‑Fi. No internet, no
          phone number, no account.
        </Text>
        <View style={styles.points}>
          {[
            ['bluetooth', 'Finds people with the app nearby'],
            ['lock-closed', 'Messages are encrypted end to end'],
            ['wifi', 'Works with no signal at all'],
          ].map(([icon, text]) => (
            <View key={icon} style={styles.point}>
              <View style={[styles.pointIcon, {backgroundColor: t.surface}]}>
                <Icon name={icon} size={18} color={t.primary} />
              </View>
              <Text style={[styles.pointText, {color: t.text}]}>{text}</Text>
            </View>
          ))}
        </View>
      </View>
      {blocked ? (
        <>
          <Text style={[styles.note, {color: t.textSub}]}>
            Access was turned off. Allow "Nearby devices" and "Location" for Aetheris in Settings.
          </Text>
          <Button title="Open Settings" onPress={() => openSettings()} />
          <Button title="Continue anyway" variant="ghost" onPress={onDone} style={{marginTop: 6}} />
        </>
      ) : (
        <Button title="Allow and continue" onPress={allow} loading={busy} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingHorizontal: 24},
  top: {flex: 1},
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22},
  brand: {fontFamily: Font.extraBold, fontSize: 18, letterSpacing: -0.2},
  lead: {fontFamily: Font.regular, fontSize: 16, lineHeight: 24, marginTop: 10},
  preview: {alignItems: 'center', marginTop: 36, marginBottom: 24},
  emptyAvatar: {width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center'},
  input: {height: 58, borderRadius: 16, paddingHorizontal: 18, fontFamily: Font.semiBold, fontSize: 18},
  hero: {width: 112, height: 112, borderRadius: 34, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 28},
  center: {textAlign: 'center'},
  points: {marginTop: 32, gap: 16},
  point: {flexDirection: 'row', alignItems: 'center', gap: 14},
  pointIcon: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  pointText: {fontFamily: Font.medium, fontSize: 15, flex: 1},
  note: {fontFamily: Font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 14},
});
