/**
 * meshService.ts
 *
 * Central orchestrator for the Aetheris mesh network.
 *
 * Responsibilities:
 * 1. Send pipeline: encrypt message → sign → serialize → transmit via Wi-Fi Direct
 * 2. Receive pipeline: deserialize → verify signature → decrypt if for us OR relay
 * 3. Connection management: track peers, manage Wi-Fi Direct lifecycle
 * 4. Event emission: notify UI of incoming messages, delivery status, connection changes
 */

import { create } from 'zustand';
import { MeshMessage, MessageContent } from '../types/message';
import { AetherisBridge, MessageReceivedEvent, ConnectionStateEvent } from '../native/AetherisBridge';
import {
  buildMessage,
  openMessage,
  serializeMessage,
  deserializeMessage,
} from '../crypto/messageBuilder';
import { loadPrivateKey } from '../crypto/identity';
import { decideMessageFate, prepareForRelay } from './messageRelay';
import { dbInsertMessage } from '../db/database';
import { useIdentityStore } from './identityStore';
import { useMessagesStore } from './messagesStore';
import { Buffer } from 'buffer';

interface ConnectedPeer {
  id: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

interface MeshServiceState {
  // State
  isRunning: boolean;
  connectedPeers: Record<string, ConnectedPeer>;
  pendingMessages: Record<string, { retries: number; lastRetry: number }>;

  // Methods
  start: (nodeId: string, publicKeyBase58: string) => Promise<void>;
  stop: () => Promise<void>;
  sendMessage: (params: {
    recipientId: string;
    recipientPublicKeyBase64: string;
    text: string;
  }) => Promise<void>;
  getConnectedPeerIds: () => string[];
  isConnectedTo: (peerId: string) => boolean;
}

// State references (closure)
let ourNodeId = '';
let ourPrivateKeyBase64 = '';
let ourPublicKeyBase58 = '';

export const useMeshService = create<MeshServiceState>((set, get) => {
  let messageReceivedListener: any = null;
  let connectionStateListener: any = null;

  return {
    isRunning: false,
    connectedPeers: {},
    pendingMessages: {},

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    start: async (nodeId: string, publicKeyBase58: string) => {
      try {
        ourNodeId = nodeId;
        ourPublicKeyBase58 = publicKeyBase58;
        ourPrivateKeyBase64 = await loadPrivateKey();

        // Start native discovery (BLE + Wi-Fi Direct)
        await AetherisBridge.startDiscovery(nodeId);

        // Register event listeners
        messageReceivedListener = AetherisBridge.onMessageReceived((event: MessageReceivedEvent) => {
          handleMessageReceived(event, get, set);
        });

        connectionStateListener = AetherisBridge.onConnectionStateChanged((event: ConnectionStateEvent) => {
          set(state => ({
            connectedPeers: {
              ...state.connectedPeers,
              [event.peerId]: {
                id: event.peerId,
                state: event.state,
              },
            },
          }));
          console.log(`[meshService] Peer ${event.peerId} state: ${event.state}`);
        });

        set({ isRunning: true });
        console.log('[meshService] Started');
      } catch (e) {
        console.error('[meshService] Start failed:', e);
        throw e;
      }
    },

    stop: async () => {
      try {
        await AetherisBridge.stopDiscovery();
        messageReceivedListener?.remove();
        connectionStateListener?.remove();
        set({ isRunning: false, connectedPeers: {} });
        console.log('[meshService] Stopped');
      } catch (e) {
        console.error('[meshService] Stop failed:', e);
      }
    },

    // ─── Send Pipeline ────────────────────────────────────────────────────────

    sendMessage: async (params: {
      recipientId: string;
      recipientPublicKeyBase64: string;
      text: string;
    }) => {
      try {
        const { recipientId, recipientPublicKeyBase64, text } = params;

        // 1. Build message (encrypt + sign)
        const message = await buildMessage(
          ourPublicKeyBase58,
          undefined, // no alias
          recipientId,
          recipientPublicKeyBase64,
          { text },
          'MSG',
        );

        // 2. Serialize to JSON
        const serialized = serializeMessage(message);
        const base64Data = Buffer.from(serialized, 'utf8').toString('base64');

        // 3. Store in DB
        dbInsertMessage({
          id: message.id,
          sender_id: message.sender.id,
          recipient_id: message.recipient.id,
          encrypted_payload: message.payload.encrypted,
          nonce: message.payload.nonce,
          ephemeral_public_key: message.payload.ephemeralPublicKey,
          signature: message.signature,
          is_outbound: 1,
          ttl: message.routing.ttl,
          expires_at: message.routing.expiresAt,
        });

        // 4. Send to all connected peers (they will decide to relay or deliver)
        const connectedPeerIds = get().getConnectedPeerIds();
        console.log(
          `[meshService] Sending message ${message.id} to ${connectedPeerIds.length} peer(s)`,
        );

        for (const peerId of connectedPeerIds) {
          try {
            await AetherisBridge.sendRawBytes(peerId, base64Data);
          } catch (e) {
            console.warn(`[meshService] Send to ${peerId} failed:`, e);
          }
        }

        // 5. Update message store UI
        const messagesStore = useMessagesStore.getState();
        messagesStore.updateStatus(message.id, 'sent');
      } catch (e) {
        console.error('[meshService] Send failed:', e);
        throw e;
      }
    },

    // ─── Peer Queries ─────────────────────────────────────────────────────────

    getConnectedPeerIds: () => {
      return Object.values(get().connectedPeers)
        .filter(p => p.state === 'connected')
        .map(p => p.id);
    },

    isConnectedTo: (peerId: string) => {
      const peer = get().connectedPeers[peerId];
      return peer?.state === 'connected';
    },
  };
});

// ─── Receive Pipeline ─────────────────────────────────────────────────────────

async function handleMessageReceived(
  event: MessageReceivedEvent,
  get: any,
  set: any,
) {
  try {
    const { peerId, data: base64Data } = event;

    // 1. Decode from Base64
    const serialized = Buffer.from(base64Data, 'base64').toString('utf8');

    // 2. Deserialize from JSON
    const message = deserializeMessage(serialized);
    if (!message) {
      console.warn('[meshService] Deserialization failed');
      return;
    }

    console.log(`[meshService] Received message ${message.id} from ${peerId}`);

    // 3. Decide: deliver, relay, or drop
    const connectedPeerIds = get().getConnectedPeerIds();
    const decision = decideMessageFate(message, ourNodeId, connectedPeerIds);

    console.log(`[meshService] Decision: ${decision.reason}`);

    // 4. If for us, decrypt and deliver
    if (decision.shouldDeliver) {
      try {
        const privateKey = ourPrivateKeyBase64;
        const content = await openMessage(message, privateKey);

        if (content) {
          // Store in DB
          dbInsertMessage({
            id: message.id,
            sender_id: message.sender.id,
            recipient_id: message.recipient.id,
            encrypted_payload: message.payload.encrypted,
            nonce: message.payload.nonce,
            ephemeral_public_key: message.payload.ephemeralPublicKey,
            signature: message.signature,
            is_outbound: 0,
            ttl: message.routing.ttl,
            expires_at: message.routing.expiresAt,
          });

          // Update messages store
          const messagesStore = useMessagesStore.getState();
          const textContent = (content as { text?: string }).text || '';
          messagesStore.receiveMessage({
            id: message.id,
            senderId: message.sender.id,
            recipientId: message.recipient.id,
            text: textContent,
            status: 'delivered',
            isOutbound: false,
            createdAt: message.routing.originTimestamp,
          });

          console.log(`[meshService] Message delivered to UI`);
        }
      } catch (e) {
        console.warn('[meshService] Decryption failed:', e);
      }
    }

    // 5. If should relay, forward to next hops
    if (decision.shouldRelay && decision.nextHops) {
      try {
        const relayMessage = prepareForRelay(message, ourNodeId);
        const relaySerialized = serializeMessage(relayMessage);
        const relayBase64 = Buffer.from(relaySerialized, 'utf8').toString('base64');

        console.log(
          `[meshService] Relaying message to ${decision.nextHops.length} peer(s)`,
        );

        for (const nextPeerId of decision.nextHops) {
          try {
            await AetherisBridge.sendRawBytes(nextPeerId, relayBase64);
          } catch (e) {
            console.warn(`[meshService] Relay to ${nextPeerId} failed:`, e);
          }
        }
      } catch (e) {
        console.error('[meshService] Relay failed:', e);
      }
    }
  } catch (e) {
    console.error('[meshService] Receive handler crashed:', e);
  }
}
