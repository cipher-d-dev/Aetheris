/**
 * Profile photos (base64 JPEG) by node ID, kept in memory for fast rendering.
 * SQLite (peers.avatar, settings 'photo') is the source of truth.
 */
import {create} from 'zustand';
import {dbListAvatars} from '../db/database';

interface AvatarState {
  avatars: Record<string, string>;
  load: (self?: {id: string; data: string | null}) => void;
  setAvatar: (id: string, data: string | null) => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  avatars: {},
  load: self => {
    const avatars: Record<string, string> = {};
    try {
      for (const a of dbListAvatars()) avatars[a.id] = a.data;
    } catch {}
    if (self?.data) avatars[self.id] = self.data;
    set({avatars});
  },
  setAvatar: (id, data) => {
    const avatars = {...get().avatars};
    if (data) avatars[id] = data;
    else delete avatars[id];
    set({avatars});
  },
}));

/** Short, stable version id for a photo (FNV-1a over the base64 text). */
export function photoHash(data: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${data.length.toString(16)}`;
}
