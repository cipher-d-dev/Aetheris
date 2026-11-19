import type {ChatMessage} from '../store/messagesStore';

export type ChatItem =
  | {type: 'day'; key: string; ts: number}
  | {type: 'unread'; key: 'unread'}
  | {type: 'msg'; key: string; m: ChatMessage; first: boolean; last: boolean; showSender: boolean};

/**
 * Day separators and bubble grouping for a chat. With `unreadAnchorId`, an
 * "unread" divider goes immediately before that message if it is in the list.
 */
export function buildItems(messages: ChatMessage[], isGroup: boolean, unreadAnchorId?: string): ChatItem[] {
  const items: ChatItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) items.push({type: 'day', key: `day-${m.id}`, ts: m.createdAt});
    if (m.id === unreadAnchorId) items.push({type: 'unread', key: 'unread'});
    const sameAsPrev = !newDay && prev && prev.senderId === m.senderId && m.createdAt - prev.createdAt < 120000;
    const sameAsNext =
      next &&
      next.senderId === m.senderId &&
      next.createdAt - m.createdAt < 120000 &&
      new Date(next.createdAt).toDateString() === new Date(m.createdAt).toDateString();
    items.push({type: 'msg', key: m.id, m, first: !sameAsPrev, last: !sameAsNext, showSender: isGroup && !sameAsPrev});
  });
  return items;
}
