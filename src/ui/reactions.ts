/** The only reactions the mesh carries. Anything else received is dropped. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type ReactionEmoji = (typeof REACTIONS)[number];

/** Spoken names, for accessibility labels. */
export const REACTION_NAMES: Record<ReactionEmoji, string> = {
  '👍': 'thumbs up',
  '❤️': 'heart',
  '😂': 'laughing',
  '😮': 'surprised',
  '😢': 'sad',
  '🙏': 'thanks',
};

export interface ReactionGroup {
  emoji: ReactionEmoji;
  count: number;
  mine: boolean;
}

/** Group a message's reactions by emoji, in REACTIONS order. Unknown emoji are skipped. */
export function groupReactions(
  list: readonly {emoji: string; reactorId: string}[],
  selfId: string,
): ReactionGroup[] {
  const groups: ReactionGroup[] = [];
  for (const emoji of REACTIONS) {
    const hits = list.filter(r => r.emoji === emoji);
    if (hits.length) groups.push({emoji, count: hits.length, mine: hits.some(r => r.reactorId === selfId)});
  }
  return groups;
}

/** What to send when `tapped` is chosen: '' removes it if it is already your reaction. */
export function nextReaction(current: string | null | undefined, tapped: string): string {
  return current === tapped ? '' : tapped;
}
