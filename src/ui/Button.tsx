import React from 'react';
import {Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle} from 'react-native';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

export default function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const {theme: t} = useThemeStore();
  const bg = variant === 'primary' ? t.primary : variant === 'secondary' ? t.primarySoft : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({pressed}) => [
        styles.button,
        {backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1},
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={19} color={fg} />}
          <Text style={[styles.text, {color: fg}]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  text: {fontFamily: Font.semiBold, fontSize: 16},
});
