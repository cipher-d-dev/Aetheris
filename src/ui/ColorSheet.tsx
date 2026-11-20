import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ACCENTS, AccentName, Font, useThemeStore} from '../theme';
import {Icon} from './Icon';

/** Colour theme picker: two-tone swatches plus a live preview of a conversation. */
export default function ColorSheet({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (accent: AccentName) => void;
  onClose: () => void;
}) {
  const {theme: t, accent} = useThemeStore();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={onClose} accessible={false}>
        <Pressable style={[styles.sheet, {backgroundColor: t.bg, paddingBottom: 16 + insets.bottom}]} accessible={false}>
          <View style={[styles.handle, {backgroundColor: t.border}]} />
          <Text accessibilityRole="header" style={[styles.title, {color: t.text}]}>
            Colour
          </Text>

          {/* Live preview in the selected colour */}
          <View style={[styles.preview, {backgroundColor: t.chatBg}]}>
            <View style={[styles.bubble, styles.in, {backgroundColor: t.bubbleIn}]}>
              <Text style={[styles.bubbleText, {color: t.bubbleInText}]}>Are you nearby?</Text>
            </View>
            <View style={[styles.bubble, styles.out, {backgroundColor: t.bubbleOut}]}>
              <Text style={[styles.bubbleText, {color: t.bubbleOutText}]}>Yes, by the entrance</Text>
              <Icon name="checkmark-done" size={14} color={t.tickRead} style={styles.tick} />
            </View>
          </View>

          <View accessibilityRole="radiogroup" style={styles.grid}>
            {(Object.keys(ACCENTS) as AccentName[]).map(key => {
              const a = ACCENTS[key];
              const on = key === accent;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{checked: on}}
                  accessibilityLabel={a.label}
                  onPress={() => onSelect(key)}
                  style={({pressed}) => [styles.item, pressed && {opacity: 0.7}]}>
                  <View style={[styles.ring, {borderColor: on ? t.text : 'transparent'}]}>
                    <View style={styles.swatch}>
                      <View style={[styles.half, {backgroundColor: a.swatch[0]}]} />
                      <View style={[styles.half, {backgroundColor: a.swatch[1]}]} />
                    </View>
                    {on && (
                      <View style={styles.check}>
                        <Icon name="checkmark" size={18} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.label, {color: on ? t.text : t.textSub}]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.note, {color: t.textMuted}]}>Works in both light and dark mode.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, paddingHorizontal: 20},
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 10},
  title: {fontFamily: Font.bold, fontSize: 16.5, paddingBottom: 12},
  preview: {borderRadius: 16, padding: 12, gap: 6},
  bubble: {maxWidth: '75%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14},
  in: {alignSelf: 'flex-start', borderTopLeftRadius: 4},
  out: {alignSelf: 'flex-end', borderTopRightRadius: 4, flexDirection: 'row', alignItems: 'flex-end', gap: 6},
  bubbleText: {fontFamily: Font.regular, fontSize: 14},
  tick: {marginBottom: 1},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, marginTop: 18},
  item: {width: '31%', alignItems: 'center', gap: 6},
  ring: {width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center'},
  swatch: {width: 46, height: 46, borderRadius: 23, overflow: 'hidden', flexDirection: 'row', transform: [{rotate: '45deg'}]},
  half: {flex: 1},
  check: {position: 'absolute', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)'},
  label: {fontFamily: Font.semiBold, fontSize: 12.5},
  note: {fontFamily: Font.regular, fontSize: 12, textAlign: 'center', marginTop: 16},
});
