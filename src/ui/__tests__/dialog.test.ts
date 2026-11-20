import {describe, expect, it, jest} from '@jest/globals';
import {showDialog, useDialogStore} from '../dialog';

describe('in-app dialogs', () => {
  it('queues dialogs, runs the pressed action after closing, and defaults to OK', () => {
    jest.useFakeTimers();
    const onDelete = jest.fn();
    showDialog('Delete chat?', 'Gone for good.', [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive', onPress: onDelete}]);
    showDialog('Second');

    const first = useDialogStore.getState().queue[0];
    expect(first).toMatchObject({title: 'Delete chat?', tone: 'danger', icon: 'trash-outline'});
    useDialogStore.getState().dismiss(first.buttons[1]);
    expect(onDelete).not.toHaveBeenCalled(); // runs after the dialog closes
    jest.runAllTimers();
    expect(onDelete).toHaveBeenCalledTimes(1);

    const second = useDialogStore.getState().queue[0];
    expect(second.title).toBe('Second');
    expect(second.buttons).toEqual([{text: 'OK'}]);
    useDialogStore.getState().dismiss();
    expect(useDialogStore.getState().queue).toEqual([]);
    jest.useRealTimers();
  });
});
