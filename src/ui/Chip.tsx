import React from 'react';
import {Pressable, Text, StyleSheet} from 'react-native';
import {Font, useThemeStore} from '../theme';

export default function Chip({label, count, on, onPress}: {label: string; count?: number; on: boolean; onPress: () => void}) {
  const t = useThemeStore(s => s.theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{selected: on}}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={({pressed}) => [
        styles.chip,
        on
          ? {backgroundColor: t.chipOn, borderColor: t.chipOn}
          : {backgroundColor: t.chip, borderColor: t.chipBorder},
        pressed && {opacity: 0.7},
      ]}>
      <Text style={[styles.text, {color: on ? t.chipOnText : t.textSub}]}>
        {label}
        {count ? <Text style={{color: on ? t.chipOnText : t.textMuted}}>{`  ${count}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {height: 30, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, justifyContent: 'center'},
  text: {fontFamily: Font.semiBold, fontSize: 13},
});
