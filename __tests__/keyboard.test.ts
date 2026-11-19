import {describe, expect, it} from '@jest/globals';
import {keyboardAvoidingBehavior} from '../src/ui/keyboard';

describe('keyboardAvoidingBehavior', () => {
  it('pads on iOS', () => {
    expect(keyboardAvoidingBehavior('ios', '17.0')).toBe('padding');
  });
  it('relies on adjustResize on Android 14', () => {
    expect(keyboardAvoidingBehavior('android', 34)).toBeUndefined();
  });
  it('pads on Android 15', () => {
    expect(keyboardAvoidingBehavior('android', 35)).toBe('padding');
  });
  it('defaults to the mocked Platform (android 35)', () => {
    expect(keyboardAvoidingBehavior()).toBe('padding');
  });
});
