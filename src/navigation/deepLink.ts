const PREFIX = 'aetheris://chat/';

/** Extracts the conversation id from an `aetheris://chat/<encoded id>` link. */
export function chatIdFromUrl(url: string): string | null {
  if (!url || !url.startsWith(PREFIX)) return null;
  try {
    const id = decodeURIComponent(url.slice(PREFIX.length));
    return id || null;
  } catch {
    return null;
  }
}

/** The activity is exported, so only open conversations that exist locally. */
export function isKnownConversation(
  id: string,
  lookups: {group: (groupId: string) => unknown; peer: (peerId: string) => unknown},
): boolean {
  return id.startsWith('group:') ? !!lookups.group(id.slice('group:'.length)) : !!lookups.peer(id);
}
