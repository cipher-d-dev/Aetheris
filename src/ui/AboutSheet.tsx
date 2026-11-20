import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';
import Logo from './Logo';

const POINTS: [string, string][] = [
  ['people', 'Message anyone nearby who has Aetheris'],
  ['git-network-outline', 'Messages hop phone to phone to reach people further away'],
  ['lock-closed', 'Encrypted end to end. Phones passing them on can’t read them'],
  ['cloud-offline-outline', 'No internet, phone number or account'],
];

export default function AboutSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const t = useThemeStore(s => s.theme);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={onClose} accessible={false}>
        <Pressable style={[styles.sheet, {backgroundColor: t.bg, paddingBottom: 20 + insets.bottom}]} accessible={false}>
          <View style={[styles.handle, {backgroundColor: t.border}]} />
          <View style={styles.head}>
            <Logo size={64} />
            <Text accessibilityRole="header" style={[styles.name, {color: t.text}]}>
              Aetheris
            </Text>
            <Text style={[styles.tagline, {color: t.textSub}]}>Chat with the people around you.</Text>
          </View>
          <View style={styles.points}>
            {POINTS.map(([icon, text]) => (
              <View key={icon} style={styles.point}>
                <View style={[styles.pointIcon, {backgroundColor: t.primarySoft}]}>
                  <Icon name={icon} size={16} color={t.primaryText} />
                </View>
                <Text style={[styles.pointText, {color: t.text}]}>{text}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.version, {color: t.textMuted}]}>Version 1.0</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, paddingHorizontal: 24},
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 18},
  head: {alignItems: 'center', gap: 6},
  name: {fontFamily: Font.extraBold, fontSize: 21, letterSpacing: -0.3, marginTop: 8},
  tagline: {fontFamily: Font.regular, fontSize: 14},
  points: {gap: 12, marginTop: 22},
  point: {flexDirection: 'row', alignItems: 'center', gap: 12},
  pointIcon: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  pointText: {flex: 1, fontFamily: Font.medium, fontSize: 14, lineHeight: 19},
  version: {fontFamily: Font.regular, fontSize: 12, textAlign: 'center', marginTop: 22},
});
