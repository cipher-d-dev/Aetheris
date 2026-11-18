import {createNavigationContainerRef} from '@react-navigation/native';

/** Lets non-screen code (deep links, notifications) navigate. */
export const navigationRef = createNavigationContainerRef<any>();

export function openChat(conversationId: string, attempt = 0) {
  if (!navigationRef.isReady()) {
    // Cold start from a link: the navigator may not be mounted yet.
    if (attempt < 20) setTimeout(() => openChat(conversationId, attempt + 1), 250);
    return;
  }
  navigationRef.navigate('Messages', {
    screen: 'Chat',
    params: {conversationId},
    initial: false,
  });
}
