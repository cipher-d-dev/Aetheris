import React from 'react';
import {Modal, Pressable, View, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: string;
  destructive?: boolean;
}

/** Bottom sheet listing choices. With `selected`, it behaves as a radio list. */
export default function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption<T>[];
  selected?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const t = useThemeStore(s => s.theme);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={onClose} accessible={false}>
        <Pressable style={[styles.sheet, {backgroundColor: t.bg, paddingBottom: 12 + insets.bottom}]} accessible={false}>
          <View style={[styles.handle, {backgroundColor: t.border}]} />
          <Text accessibilityRole="header" style={[styles.title, {color: t.text}]}>
            {title}
          </Text>
          <View accessibilityRole={selected !== undefined ? 'radiogroup' : undefined}>
            {options.map(o => {
              const on = selected === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole={selected !== undefined ? 'radio' : 'button'}
                  accessibilityState={selected !== undefined ? {checked: on} : undefined}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  style={({pressed}) => [styles.option, pressed && {backgroundColor: t.surface}]}>
                  {o.icon && <Icon name={o.icon} size={20} color={o.destructive ? t.danger : t.textSub} />}
                  <View style={{flex: 1}}>
                    <Text style={[styles.label, {color: o.destructive ? t.danger : t.text}]}>{o.label}</Text>
                    {o.description ? <Text style={[styles.desc, {color: t.textMuted}]}>{o.description}</Text> : null}
                  </View>
                  {selected !== undefined && (
                    <Icon
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={on ? t.primaryText : t.textMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8},
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 10},
  title: {fontFamily: Font.bold, fontSize: 16.5, paddingHorizontal: 20, paddingBottom: 6},
  option: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13},
  label: {fontFamily: Font.medium, fontSize: 15},
  desc: {fontFamily: Font.regular, fontSize: 12.5, lineHeight: 17, marginTop: 2},
});
