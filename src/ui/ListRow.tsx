import React from 'react';
import {Pressable, View, Text, StyleSheet} from 'react-native';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

/** Settings-style row: icon tile, title, optional subtitle and value, then a chevron. */
export default function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  right,
  onPress,
  danger,
}: {
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Current setting, shown on the right (e.g. "Balanced") */
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const {theme: t} = useThemeStore();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, value, subtitle].filter(Boolean).join(', ')}
      style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surfaceAlt}]}>
      {icon && (
        <View style={[styles.tile, {backgroundColor: iconColor ?? t.primary}]}>
          <Icon name={icon} size={16} color="#FFFFFF" />
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.title, {color: danger ? t.danger : t.text}]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, {color: t.textMuted}]}>{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.value, {color: t.textMuted}]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={16} color={t.textMuted} /> : null)}
    </Pressable>
  );
}

/** A titled card of rows with inset hairline separators between them. */
export function Section({title, footer, children}: {title?: string; footer?: string; children: React.ReactNode}) {
  const {theme: t} = useThemeStore();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title && <Text style={[styles.sectionTitle, {color: t.textMuted}]}>{title.toUpperCase()}</Text>}
      <View style={[styles.card, {backgroundColor: t.surface}]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.separator, {backgroundColor: t.border}]} />}
            {child}
          </React.Fragment>
        ))}
      </View>
      {footer && <Text style={[styles.footer, {color: t.textMuted}]}>{footer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 50},
  tile: {width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  text: {flex: 1},
  title: {fontFamily: Font.medium, fontSize: 15},
  subtitle: {fontFamily: Font.regular, fontSize: 12.5, marginTop: 2, lineHeight: 17},
  value: {fontFamily: Font.regular, fontSize: 14, maxWidth: 140},
  section: {marginTop: 22, paddingHorizontal: 16},
  sectionTitle: {fontFamily: Font.semiBold, fontSize: 11.5, letterSpacing: 0.6, marginBottom: 7, marginLeft: 14},
  card: {borderRadius: 16, overflow: 'hidden'},
  separator: {height: StyleSheet.hairlineWidth, marginLeft: 54},
  footer: {fontFamily: Font.regular, fontSize: 12, lineHeight: 17, marginTop: 7, marginHorizontal: 14},
});
