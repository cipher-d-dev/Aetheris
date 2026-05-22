import {create} from 'zustand';
import {getDb} from '../db/database';

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
           MAX(created_at) AS last_time,
           (SELECT encrypted_payload FROM messages m2
            WHERE (m2.sender_id = ? AND m2.recipient_id = peer_id)
               OR (m2.sender_id = peer_id AND m2.recipient_id = ?)
            ORDER BY created_at DESC LIMIT 1) AS last_msg
         FROM messages
         WHERE sender_id = ? OR recipient_id = ?
         GROUP BY peer_id
         ORDER BY last_time DESC`,
        [myId, myId, myId, myId, myId],
      );

      const rows = result.rows?._array ?? [];
      const conversations: Conversation[] = rows.map((row: any) => ({
        peerId: row.peer_id,
        lastMessage: row.last_msg ?? '',
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
        text: row.encrypted_payload, // plaintext stored here for now (Day 4 simplification)
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

    // Save to SQLite
    try {
      const db = getDb();
      db.execute(
        `INSERT INTO messages
          (id, sender_id, recipient_id, encrypted_payload, nonce,
           ephemeral_public_key, signature, is_outbound, ttl,
           hop_count, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, '', '', '', 1, 7, 0, 'pending', ?, ?)`,
        [id, myId, peerId, text, now, now + 72 * 60 * 60 * 1000],
      );
    } catch (e) {
      console.log('[messagesStore] insert error:', e);
    }

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

    // Save to SQLite
    try {
      const db = getDb();
      db.execute(
        `INSERT OR IGNORE INTO messages
          (id, sender_id, recipient_id, encrypted_payload, nonce,
           ephemeral_public_key, signature, is_outbound, ttl,
           hop_count, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, '', '', '', 0, 7, 0, 'delivered', ?, ?)`,
        [
          msg.id,
          msg.senderId,
          msg.recipientId,
          msg.text,
          msg.createdAt,
          msg.createdAt + 72 * 60 * 60 * 1000,
        ],
      );
    } catch (e) {
      console.log('[messagesStore] receive insert error:', e);
    }

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
}));
