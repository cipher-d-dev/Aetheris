/**
 * In-app dialogs, styled like the rest of Aetheris (instead of the phone's
 * native alert). Same call shape as Alert.alert, plus optional icon/tone.
 */
import {create} from 'zustand';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogSpec {
  title: string;
  message?: string;
  buttons: DialogButton[];
  icon?: string;
  tone?: 'default' | 'danger' | 'warning';
}

interface DialogState {
  queue: DialogSpec[];
  show: (spec: DialogSpec) => void;
  /** Close the current dialog, then run the pressed button's action. */
  dismiss: (button?: DialogButton) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  show: spec => set({queue: [...get().queue, spec]}),
  dismiss: button => {
    set({queue: get().queue.slice(1)});
    // Run after closing so an action that opens another dialog queues cleanly.
    if (button?.onPress) setTimeout(button.onPress, 0);
  },
}));

export function showDialog(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  opts: {icon?: string; tone?: DialogSpec['tone']} = {},
): void {
  const list = buttons && buttons.length > 0 ? buttons : [{text: 'OK'}];
  const destructive = list.some(b => b.style === 'destructive');
  useDialogStore.getState().show({
    title,
    message,
    buttons: list,
    icon: opts.icon ?? (destructive ? 'trash-outline' : undefined),
    tone: opts.tone ?? (destructive ? 'danger' : 'default'),
  });
}
