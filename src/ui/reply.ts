import type {ChatMessage} from '../store/messagesStore';
import type {ReplyRef} from '../types/message';

const SNIPPET_MAX = 100;
export const UNVERIFIED_SUFFIX = ' · not on this phone';

/** Short preview of a message for a reply quote: its text, or a label for media. */
export function replySnippet(m: Pick<ChatMessage, 'kind' | 'text'>): string {
  if (m.kind === 'image') return 'Photo';
  if (m.kind === 'audio') return 'Voice message';
  const t = m.text.trim();
  return t.length > SNIPPET_MAX ? t.slice(0, SNIPPET_MAX - 1) + '…' : t;
}

type QuoteSource = Pick<ChatMessage, 'id' | 'refId' | 'senderId' | 'senderAlias' | 'isOutbound' | 'kind' | 'text'>;

/**
 * What to show for a quoted reply. The claimed sender and snippet come from
 * another phone and could be forged, so when the original is on this phone its
 * real values win (loaded list first, then lookup). If it isn't on this phone the
 * claim is shown as unverified and never as "You". targetId is the original's
 * local id, or null if it isn't loaded.
 */
export function resolveQuote(
  replyTo: ReplyRef,
  messages: QuoteSource[],
  selfId: string,
  nameOf: (senderId: string, alias?: string) => string,
  lookup?: (refId: string) => QuoteSource | null,
): {name: string; snippet: string; targetId: string | null; unverified: boolean} {
  const loaded = messages.find(m => m.refId === replyTo.id);
  const original = loaded ?? lookup?.(replyTo.id) ?? null;
  if (original) {
    const mine = original.isOutbound || original.senderId === selfId;
    return {
      name: mine ? 'You' : nameOf(original.senderId, original.senderAlias),
      snippet: replySnippet(original),
      targetId: loaded ? loaded.id : null,
      unverified: false,
    };
  }
  const who = replyTo.senderId === selfId ? 'Someone' : nameOf(replyTo.senderId);
  return {name: `${who}${UNVERIFIED_SUFFIX}`, snippet: replyTo.snippet, targetId: null, unverified: true};
}
