import type {ChatMessage} from '../store/messagesStore';
import type {ReplyRef} from '../types/message';

const SNIPPET_MAX = 100;

/** Short preview of a message for a reply quote: its text, or a label for media. */
export function replySnippet(m: Pick<ChatMessage, 'kind' | 'text'>): string {
  if (m.kind === 'image') return 'Photo';
  if (m.kind === 'audio') return 'Voice message';
  const t = m.text.trim();
  return t.length > SNIPPET_MAX ? t.slice(0, SNIPPET_MAX - 1) + '…' : t;
}

/**
 * What to show for a quoted reply. The claimed sender and snippet come from
 * another phone and could be forged, so when the original is on this phone its
 * real values win. targetId is the original's local id, or null if not loaded.
 */
export function resolveQuote(
  replyTo: ReplyRef,
  messages: Pick<ChatMessage, 'id' | 'refId' | 'senderId' | 'senderAlias' | 'isOutbound' | 'kind' | 'text'>[],
  selfId: string,
  nameOf: (senderId: string, alias?: string) => string,
): {name: string; snippet: string; targetId: string | null} {
  const original = messages.find(m => m.refId === replyTo.id);
  const senderId = original ? original.senderId : replyTo.senderId;
  const mine = original ? original.isOutbound || senderId === selfId : senderId === selfId;
  return {
    name: mine ? 'You' : nameOf(senderId, original?.senderAlias),
    snippet: original ? replySnippet(original) : replyTo.snippet,
    targetId: original ? original.id : null,
  };
}
