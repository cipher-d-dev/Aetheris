/**
 * UI state for chats. SQLite is the source of truth; this store caches what
 * the screens show and is refreshed by meshService when anything changes.
 *
 * Conversation IDs: a peer's node ID for 1:1 chats, "group:<id>" for groups.
 */
import {create} from 'zustand';
import {
  dbGetConversation,
  dbGetGroup,
  dbGetPeer,
  dbGroupDeliveryCounts,
  dbListConversations,
  dbMarkConversationRead,
  MessageRow,
} from '../db/database';
import {formatShortId} from '../crypto/encoding';

export interface ChatMessage extends MessageRow {
  /** Group messages only: how many members have ACKed */
  deliveredCount?: number;
  recipientCount?: number;
}

export interface Conversation {
  id: string;
  title: string;
  isGroup: boolean;
  lastMessage: string;
  lastOutboundStatus?: ChatMessage['status'];
  lastTime: number;
  unread: number;
}

export const GROUP_PREFIX = 'group:';

export function isGroupConversation(id: string): boolean {
  return id.startsWith(GROUP_PREFIX);
}

export function groupIdOf(conversationId: string): string {
  return conversationId.slice(GROUP_PREFIX.length);
}

/**
 * Best display name for a node: the nickname you gave them, else the name
 * they chose (alias), else their short ID.
 */
export function displayName(nodeId: string, alias?: string): string {
  let peer = null;
  try {
    peer = dbGetPeer(nodeId);
  } catch {}
  return peer?.nickname ?? alias ?? peer?.alias ?? formatShortId(nodeId);
}

export function conversationTitle(id: string): string {
  if (isGroupConversation(id)) {
    try {
      return dbGetGroup(groupIdOf(id))?.name ?? 'Group';
    } catch {
      return 'Group';
    }
  }
  return displayName(id);
}

function previewText(kind: string, text: string): string {
  if (kind === 'image') return text ? `📷 ${text}` : '📷 Photo';
  if (kind === 'audio') return '🎤 Voice message';
  return text;
}

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  /** Conversation currently on screen (no notifications / unread for it) */
  activeConversation: string | null;
  loadConversations: () => void;
  loadMessages: (conversationId: string) => void;
  setActiveConversation: (id: string | null) => void;
  /** Re-read a conversation (and the list) from the DB after a change. */
  refresh: (conversationId?: string) => void;
  /** Drop a conversation from state only; the DB delete lives in meshService.deleteConversation. */
  dropConversation: (conversationId: string) => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversation: null,

  loadConversations: () => {
    try {
      const conversations: Conversation[] = dbListConversations().map(c => ({
        id: c.id,
        title: conversationTitle(c.id),
        isGroup: isGroupConversation(c.id),
        lastMessage: previewText(c.lastKind, c.lastText),
        lastOutboundStatus: c.lastOutboundStatus,
        lastTime: c.lastTime,
        unread: c.id === get().activeConversation ? 0 : c.unread,
      }));
      set({conversations});
    } catch (e) {
      console.warn('[messagesStore] loadConversations failed', e);
    }
  },

  loadMessages: (conversationId: string) => {
    try {
      const group = isGroupConversation(conversationId);
      const list: ChatMessage[] = dbGetConversation(conversationId).map(m => {
        if (!group || !m.isOutbound) return m;
        const c = dbGroupDeliveryCounts(m.id);
        return {...m, deliveredCount: c.delivered, recipientCount: c.total};
      });
      set(state => ({messages: {...state.messages, [conversationId]: list}}));
    } catch (e) {
      console.warn('[messagesStore] loadMessages failed', e);
    }
  },

  setActiveConversation: id => {
    set({activeConversation: id});
    if (id) {
      try {
        dbMarkConversationRead(id);
      } catch {}
      get().loadConversations();
    }
  },

  refresh: conversationId => {
    const active = get().activeConversation;
    if (active && conversationId === active) {
      try {
        dbMarkConversationRead(active);
      } catch {}
    }
    if (conversationId && get().messages[conversationId]) get().loadMessages(conversationId);
    get().loadConversations();
  },

  dropConversation: conversationId => {
    set(state => {
      const messages = {...state.messages};
      delete messages[conversationId];
      return {
        messages,
        conversations: state.conversations.filter(c => c.id !== conversationId),
      };
    });
  },
}));
