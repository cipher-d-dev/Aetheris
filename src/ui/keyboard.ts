import {useEffect, useState} from 'react';
import {Keyboard, Platform} from 'react-native';

// Android 15 (API 35) enforces edge-to-edge, and windowSoftInputMode=adjustResize no longer
// resizes the window, so KeyboardAvoidingView must pad for the keyboard itself. On older
// Android the window is still resized, and padding as well would resize twice.
export function keyboardAvoidingBehavior(
  os: string = Platform.OS,
  version: string | number = Platform.Version,
): 'padding' | undefined {
  if (os === 'ios') {
    return 'padding';
  }
  return os === 'android' && Number(version) >= 35 ? 'padding' : undefined;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
