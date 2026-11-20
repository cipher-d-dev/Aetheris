import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Font, useThemeStore} from '../theme';
import {Icon} from './Icon';
import {DialogButton, useDialogStore} from './dialog';

/** Renders the dialog at the front of the queue. Mounted once, in App. */
export default function DialogHost() {
  const t = useThemeStore(s => s.theme);
  const spec = useDialogStore(s => s.queue[0]);
  const dismiss = useDialogStore(s => s.dismiss);
  if (!spec) return null;

  const cancel = spec.buttons.find(b => b.style === 'cancel');
  const accent = spec.tone === 'danger' ? t.danger : spec.tone === 'warning' ? t.warningText : t.primaryText;
  const accentSoft = spec.tone === 'danger' ? t.dangerSoft : spec.tone === 'warning' ? t.warningSoft : t.primarySoft;
  const stacked = spec.buttons.length > 2;
  // Cancel sits on the left (or last when stacked), the main action on the right.
  const ordered = stacked
    ? [...spec.buttons.filter(b => b.style !== 'cancel'), ...spec.buttons.filter(b => b.style === 'cancel')]
    : [...spec.buttons.filter(b => b.style === 'cancel'), ...spec.buttons.filter(b => b.style !== 'cancel')];

  const buttonStyle = (b: DialogButton, i: number) => {
    const main = !stacked && i === ordered.length - 1 && b.style !== 'cancel';
    if (b.style === 'destructive') return {bg: main ? t.danger : t.dangerSoft, fg: main ? '#FFFFFF' : t.danger};
    if (b.style === 'cancel') return {bg: t.surface, fg: t.text};
    return main ? {bg: t.primary, fg: t.onPrimary} : {bg: t.surface, fg: t.primaryText};
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(cancel)} statusBarTranslucent>
      <Pressable style={[styles.backdrop, {backgroundColor: t.overlay}]} onPress={() => dismiss(cancel)} accessible={false}>
        <Pressable style={[styles.card, {backgroundColor: t.bg}]} accessible={false} accessibilityViewIsModal>
          {spec.icon && (
            <View style={[styles.iconWrap, {backgroundColor: accentSoft}]}>
              <Icon name={spec.icon} size={24} color={accent} />
            </View>
          )}
          <Text accessibilityRole="header" style={[styles.title, {color: t.text}]}>
            {spec.title}
          </Text>
          {spec.message ? (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
              <Text style={[styles.message, {color: t.textSub}]}>{spec.message}</Text>
            </ScrollView>
          ) : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {ordered.map((b, i) => {
              const c = buttonStyle(b, i);
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  accessibilityRole="button"
                  onPress={() => dismiss(b)}
                  style={({pressed}) => [
                    styles.button,
                    !stacked && styles.buttonFlex,
                    {backgroundColor: c.bg, opacity: pressed ? 0.8 : 1},
                  ]}>
                  <Text style={[styles.buttonText, {color: c.fg}]}>{b.text}</Text>
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
  backdrop: {flex: 1, justifyContent: 'center', padding: 28},
  card: {borderRadius: 24, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16, maxHeight: '80%'},
  iconWrap: {width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14},
  title: {fontFamily: Font.bold, fontSize: 17.5, letterSpacing: -0.2},
  messageScroll: {marginTop: 8, flexGrow: 0},
  messageContent: {paddingBottom: 2},
  message: {fontFamily: Font.regular, fontSize: 14.5, lineHeight: 21},
  buttons: {flexDirection: 'row', gap: 10, marginTop: 20},
  buttonsStacked: {flexDirection: 'column', gap: 8},
  button: {height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14},
  buttonFlex: {flex: 1},
  buttonText: {fontFamily: Font.semiBold, fontSize: 15},
});
