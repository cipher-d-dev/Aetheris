import {create} from 'zustand';
import {getDb} from '../db/database';
import {dbDeleteConversation} from '../db/database';

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  isOutbound: boolean;
  createdAt: number;
}

export interface Conversation {
  peerId: string;
  peerAlias?: string;
  lastMessage?: string;
  lastTime?: number;
  unread: number;
}

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>; // keyed by peerId
  loadConversations: (myId: string) => void;
  loadMessages: (myId: string, peerId: string) => void;
  sendMessage: (params: {
    myId: string;
    peerId: string;
    text: string;
  }) => Message;
  receiveMessage: (msg: Message) => void;
  updateStatus: (messageId: string, status: Message['status']) => void;
  deleteConversation: (myId: string, peerId: string) => void;
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  conversations: [],
  messages: {},

  loadConversations: (myId: string) => {
    try {
      const db = getDb();
      const result = db.execute(
        `SELECT
           CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS peer_id,
           MAX(created_at) AS last_time
         FROM messages
         WHERE sender_id = ? OR recipient_id = ?
         GROUP BY CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END
         ORDER BY last_time DESC`,
        [myId, myId, myId, myId],
      );

      const rows = result.rows?._array ?? [];
      const conversations: Conversation[] = rows.map((row: any) => ({
        peerId: row.peer_id,
        lastMessage: '',
        lastTime: row.last_time,
        unread: 0,
      }));

      set({conversations});
    } catch (e) {
      console.log('[messagesStore] loadConversations error:', e);
    }
  },

  loadMessages: (myId: string, peerId: string) => {
    try {
      const db = getDb();
      const result = db.execute(
        `SELECT * FROM messages
         WHERE (sender_id = ? AND recipient_id = ?)
            OR (sender_id = ? AND recipient_id = ?)
         ORDER BY created_at ASC
         LIMIT 200`,
        [myId, peerId, peerId, myId],
      );

      const rows = result.rows?._array ?? [];
      const messages: Message[] = rows.map((row: any) => ({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        text: row.text ?? '', 
        status: row.status,
        isOutbound: row.is_outbound === 1,
        createdAt: row.created_at,
      }));

      set(state => ({
        messages: {...state.messages, [peerId]: messages},
      }));
    } catch (e) {
      console.log('[messagesStore] loadMessages error:', e);
    }
  },

  sendMessage: ({myId, peerId, text}) => {
    const id = generateId();
    const now = Date.now();

    const newMessage: Message = {
      id,
      senderId: myId,
      recipientId: peerId,
      text,
      status: 'pending',
      isOutbound: true,
      createdAt: now,
    };

    // Note: The actual message encryption, signing, and DB storage
    // is handled by meshService.sendMessage(). This just updates UI state.
    // The encrypted message will be inserted into DB by meshService.

    // Update in-memory state
    set(state => {
      const existing = state.messages[peerId] ?? [];
      const updated = [...existing, newMessage];

      const convs = state.conversations.filter(c => c.peerId !== peerId);
      const updatedConvs: Conversation[] = [
        {peerId, lastMessage: text, lastTime: now, unread: 0},
        ...convs,
      ];

      return {
        messages: {...state.messages, [peerId]: updated},
        conversations: updatedConvs,
      };
    });

    return newMessage;
  },

  receiveMessage: (msg: Message) => {
    const peerId = msg.senderId;

    // Note: The DB storage (with encrypted payload) is handled by meshService.
    // This just updates UI state with the decrypted text.

    set(state => {
      const existing = state.messages[peerId] ?? [];
      if (existing.find(m => m.id === msg.id)) return state;

      const updated = [...existing, msg];
      const convs = state.conversations.filter(c => c.peerId !== peerId);
      const updatedConvs: Conversation[] = [
        {peerId, lastMessage: msg.text, lastTime: msg.createdAt, unread: 1},
        ...convs,
      ];

      return {
        messages: {...state.messages, [peerId]: updated},
        conversations: updatedConvs,
      };
    });
  },

  updateStatus: (messageId: string, status: Message['status']) => {
    try {
      getDb().execute('UPDATE messages SET status = ? WHERE id = ?', [
        status,
        messageId,
      ]);
    } catch (e) {}

    set(state => {
      const updatedMessages = {...state.messages};
      for (const peerId of Object.keys(updatedMessages)) {
        updatedMessages[peerId] = updatedMessages[peerId].map(m =>
          m.id === messageId ? {...m, status} : m,
        );
      }
      return {messages: updatedMessages};
    });
  },

  deleteConversation: (myId: string, peerId: string) => {
    try {
      dbDeleteConversation(myId, peerId);
    } catch (e) {
      console.log('[messagesStore] deleteConversation error:', e);
    }

    set(state => ({
      conversations: state.conversations.filter(c => c.peerId !== peerId),
      messages: (() => {
        const updated = {...state.messages};
        delete updated[peerId];
        return updated;
      })(),
    }));
  },
}));
