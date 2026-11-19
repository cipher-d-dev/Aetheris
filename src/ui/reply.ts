import type {ChatMessage} from '../store/messagesStore';

const SNIPPET_MAX = 100;

/** Short preview of a message for a reply quote: its text, or a label for media. */
export function replySnippet(m: Pick<ChatMessage, 'kind' | 'text'>): string {
  if (m.kind === 'image') return 'Photo';
  if (m.kind === 'audio') return 'Voice message';
  const t = m.text.trim();
  return t.length > SNIPPET_MAX ? t.slice(0, SNIPPET_MAX - 1) + '…' : t;
}
