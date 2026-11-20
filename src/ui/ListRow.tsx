import React from 'react';
import {Pressable, View, Text, StyleSheet} from 'react-native';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

/** Settings-style row: icon tile, title, optional subtitle, right accessory. */
export default function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const {theme: t} = useThemeStore();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surfaceAlt}]}>
      {icon && (
        <View style={[styles.tile, {backgroundColor: iconColor ?? t.primary}]}>
          <Icon name={icon} size={18} color="#FFFFFF" />
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.title, {color: danger ? t.danger : t.text}]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, {color: t.textMuted}]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={t.textMuted} /> : null)}
    </Pressable>
  );
}

export function Section({title, children}: {title?: string; children: React.ReactNode}) {
  const {theme: t} = useThemeStore();
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, {color: t.textMuted}]}>{title}</Text>}
      <View style={[styles.card, {backgroundColor: t.surface}]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13},
  tile: {width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center'},
  text: {flex: 1},
  title: {fontFamily: Font.medium, fontSize: 15},
  subtitle: {fontFamily: Font.regular, fontSize: 12.5, marginTop: 2, lineHeight: 17},
  section: {marginTop: 24, paddingHorizontal: 16},
  sectionTitle: {fontFamily: Font.semiBold, fontSize: 13, marginBottom: 8, marginLeft: 4},
  card: {borderRadius: 18, overflow: 'hidden'},
});
