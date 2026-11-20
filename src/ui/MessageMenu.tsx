import React, {ReactNode} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

export type MessageMenuAction = {
  key: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
};

/** Bottom sheet for a message's long-press actions. Picking an action closes the sheet, then runs it. */
export default function MessageMenu({
  visible,
  onClose,
  actions,
  header,
  preview,
}: {
  visible: boolean;
  onClose: () => void;
  actions: MessageMenuAction[];
  /** Rendered above the actions (e.g. a reaction row). */
  header?: ReactNode;
  /** Short snippet of the message, shown muted on one line. */
  preview?: string;
}) {
  const {theme: t} = useThemeStore();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, {backgroundColor: t.bg, paddingBottom: insets.bottom + 8}]}>
          {preview ? (
            <Text numberOfLines={1} style={[styles.preview, {color: t.textMuted}]}>
              {preview}
            </Text>
          ) : null}
          {header}
          {actions.map(a => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({pressed}) => [styles.row, pressed && {backgroundColor: t.surfaceAlt}]}>
              {a.icon ? (
                <Icon name={a.icon} size={22} color={a.destructive ? t.danger : t.text} />
              ) : null}
              <Text style={[styles.label, {color: a.destructive ? t.danger : t.text}]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {backgroundColor: 'rgba(0,0,0,0.45)'},
  sheet: {borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, overflow: 'hidden'},
  preview: {fontFamily: Font.regular, fontSize: 13, paddingHorizontal: 20, paddingVertical: 10},
  row: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20},
  label: {fontFamily: Font.medium, fontSize: 16},
});
