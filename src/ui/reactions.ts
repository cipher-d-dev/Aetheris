/** The only reactions the mesh carries. Anything else received is dropped. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type ReactionEmoji = (typeof REACTIONS)[number];
