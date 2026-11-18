import {createNavigationContainerRef} from '@react-navigation/native';

/** Lets non-screen code (e.g. notifications) navigate. */
export const navigationRef = createNavigationContainerRef<any>();

export function openChat(conversationId: string, attempt = 0) {
  if (!navigationRef.isReady()) {
    if (attempt < 20) setTimeout(() => openChat(conversationId, attempt + 1), 250);
    return;
  }
  navigationRef.navigate('Chat', {conversationId});
}
