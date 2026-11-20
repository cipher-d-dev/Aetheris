import {create} from 'zustand';
import {AppState} from 'react-native';
import {dbDeleteSetting, dbListSettings, dbSetSetting} from '../db/database';

const PREFIX = 'draft:';
const REPLY_PREFIX = 'reply:';
const PERSIST_DELAY_MS = 500;

interface DraftsState {
  drafts: Record<string, string>;
  /** Id of the message each chat's composer is replying to. */
  replies: Record<string, string>;
  setReply: (conversationId: string, messageId: string | null) => void;
  setDraft: (conversationId: string, text: string) => void;
  clearDraft: (conversationId: string) => void;
  /** Write any pending drafts to the database right now. */
  flushDrafts: () => void;
  /** Read saved drafts; call once at startup. */
  loadDrafts: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let appStateSub: {remove: () => void} | null = null;

function persist(id: string, text: string | undefined) {
  try {
    if (text && text.trim()) dbSetSetting(PREFIX + id, text);
    else dbDeleteSetting(PREFIX + id);
  } catch (e) {
    console.warn('[drafts] save failed', e);
  }
}

export const useDraftsStore = create<DraftsState>((set, get) => {
  const flushOne = (id: string) => {
    const timer = timers.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timers.delete(id);
    persist(id, get().drafts[id]);
  };

  return {
    drafts: {},
    replies: {},

    setReply: (id, messageId) => {
      if ((get().replies[id] ?? null) === messageId) return;
      set(s => {
        const replies = {...s.replies};
        if (messageId) replies[id] = messageId;
        else delete replies[id];
        return {replies};
      });
      // Rare and tiny, so it is saved straight away.
      try {
        if (messageId) dbSetSetting(REPLY_PREFIX + id, messageId);
        else dbDeleteSetting(REPLY_PREFIX + id);
      } catch (e) {
        console.warn('[drafts] reply save failed', e);
      }
    },

    setDraft: (id, text) => {
      set(s => {
        const drafts = {...s.drafts};
        if (text.trim()) drafts[id] = text;
        else delete drafts[id];
        return {drafts};
      });
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => flushOne(id), PERSIST_DELAY_MS));
    },

    clearDraft: id => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      set(s => {
        if (!(id in s.drafts)) return s;
        const drafts = {...s.drafts};
        delete drafts[id];
        return {drafts};
      });
      persist(id, undefined);
    },

    flushDrafts: () => {
      for (const id of [...timers.keys()]) flushOne(id);
    },

    loadDrafts: () => {
      const drafts: Record<string, string> = {};
      try {
        for (const r of dbListSettings(PREFIX)) {
          if (r.value.trim()) drafts[r.key.slice(PREFIX.length)] = r.value;
        }
      } catch (e) {
        console.warn('[drafts] load failed', e);
      }
      const replies: Record<string, string> = {};
      try {
        for (const r of dbListSettings(REPLY_PREFIX)) {
          if (r.value) replies[r.key.slice(REPLY_PREFIX.length)] = r.value;
        }
      } catch (e) {
        console.warn('[drafts] reply load failed', e);
      }
      set({drafts, replies});
      // Android may kill the app once it is backgrounded.
      appStateSub ??= AppState.addEventListener('change', state => {
        if (state === 'background') get().flushDrafts();
      });
    },
  };
});
