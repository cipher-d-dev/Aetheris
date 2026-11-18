import React from 'react';
import {Pressable, StyleSheet, ViewStyle} from 'react-native';
import {useThemeStore} from '../theme';
import {Icon} from './Icon';

export default function IconButton({
  name,
  onPress,
  size = 24,
  color,
  filled = false,
  style,
  disabled,
}: {
  name: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  filled?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const {theme: t} = useThemeStore();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({pressed}) => [
        styles.base,
        filled && {backgroundColor: t.primary},
        pressed && {opacity: 0.6},
        style,
      ]}>
      <Icon name={name} size={size} color={color ?? (filled ? t.onPrimary : t.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center'},
});
