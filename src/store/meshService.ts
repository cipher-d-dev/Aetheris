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

import {create} from 'zustand';
import {MeshMessage, MessageContent} from '../types/message';
import {
  AetherisBridge,
  MessageReceivedEvent,
  ConnectionStateEvent,
} from '../native/AetherisBridge';
import {
  buildMessage,
  openMessage,
  serializeMessage,
  deserializeMessage,
} from '../crypto/messageBuilder';
import {loadPrivateKey} from '../crypto/identity';
import {decideMessageFate, prepareForRelay} from './messageRelay';
import {dbInsertMessage} from '../db/database';
import {getPendingOutboundMessages} from '../db/messages';
import {useMessagesStore} from './messagesStore';
import {Buffer} from 'buffer';

import sodium from 'react-native-sodium';
import {base58ToBase64} from '../crypto/encoding';

interface ConnectedPeer {
  id: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'authenticating' | 'authenticated';
  challenge?: string;
}

interface MeshServiceState {
  // State
  isRunning: boolean;
  connectedPeers: Record<string, ConnectedPeer>;
  pendingMessages: Record<string, {message: MeshMessage, retries: number, lastRetry: number, text?: string}>;

  // Methods
  start: (nodeId: string, publicKeyBase58: string) => Promise<void>;
  stop: () => Promise<void>;
  sendMessage: (params: {
    recipientId: string;
    recipientPublicKeyBase64: string;
    text: string;
    messageId?: string;
  }) => Promise<{messageId: string; handedOff: boolean}>;
  retryPendingMessages: () => Promise<void>;
  getConnectedPeerIds: () => string[];
  isConnectedTo: (peerId: string) => boolean;
}

// State references (closure)
let ourNodeId = '';
let ourPrivateKeyBase64 = '';
let ourPublicKeyBase58 = '';
let retryInterval: any = null;

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
        
        // Load private key - must succeed
        try {
          ourPrivateKeyBase64 = await loadPrivateKey();
        } catch (e) {
          console.error('[meshService] Failed to load private key:', e);
          throw new Error('Could not load private key from secure storage');
        }

        // Start native discovery (BLE + Wi-Fi Direct)
        await AetherisBridge.startDiscovery(nodeId);

        // Register event listeners
        messageReceivedListener = AetherisBridge.onMessageReceived(
          (event: MessageReceivedEvent) => {
            handleMessageReceived(event, get, set);
          },
        );

        connectionStateListener = AetherisBridge.onConnectionStateChanged(
          async (event: ConnectionStateEvent) => {
            if (event.state === 'connected') {
              // Transition to authenticating and send challenge
              set(state => ({
                connectedPeers: {
                  ...state.connectedPeers,
                  [event.peerId]: {
                    id: event.peerId,
                    state: 'authenticating',
                    challenge: '',
                  },
                },
              }));
              
              try {
                const challengeBase64 = await sodium.randombytes_buf(32);
                
                set(state => ({
                  connectedPeers: {
                    ...state.connectedPeers,
                    [event.peerId]: {
                      ...state.connectedPeers[event.peerId],
                      challenge: challengeBase64,
                    },
                  },
                }));

                const recipientPublicKeyBase64 = base58ToBase64(event.peerId);
                const message = await buildMessage(
                  ourPublicKeyBase58,
                  undefined,
                  event.peerId,
                  recipientPublicKeyBase64,
                  {text: challengeBase64},
                  'HANDSHAKE_CHALLENGE',
                );

                const serialized = serializeMessage(message);
                const base64Data = Buffer.from(serialized, 'utf8').toString('base64');
                await AetherisBridge.sendRawBytes(event.peerId, base64Data);
                console.log(`[meshService] Sent handshake challenge to ${event.peerId}`);
              } catch (e) {
                console.error(`[meshService] Handshake failed for ${event.peerId}`, e);
                AetherisBridge.disconnectFromPeer(event.peerId);
              }
            } else {
              set(state => ({
                connectedPeers: {
                  ...state.connectedPeers,
                  [event.peerId]: {
                    ...state.connectedPeers[event.peerId],
                    id: event.peerId,
                    state: event.state as any,
                  },
                },
              }));
            }
            console.log(
              `[meshService] Peer ${event.peerId} state: ${event.state}`,
            );
          },
        );

        // Load pending outbound messages from DB
        const pendingFromDb = getPendingOutboundMessages();
        const pendingMap: MeshServiceState['pendingMessages'] = {};
        for (const msg of pendingFromDb) {
          if (!msg.serializedMessage) continue;
          const messageObj = deserializeMessage(msg.serializedMessage);
          if (!messageObj) continue;
          pendingMap[msg.id] = {
            message: messageObj,
            retries: 0,
            lastRetry: 0,
            text: msg.text,
          };
        }
        set({pendingMessages: pendingMap});

        retryInterval = setInterval(() => {
          get().retryPendingMessages();
        }, 10000); // Retry every 10 seconds

        set({isRunning: true});
        console.log('[meshService] Started successfully');
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
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        set({isRunning: false, connectedPeers: {}});
        console.log('[meshService] Stopped');
      } catch (e) {
        console.error('[meshService] Stop failed:', e);
      }
    },

    retryPendingMessages: async () => {
      const state = get();
      const connectedPeerIds = state.getConnectedPeerIds();
      if (connectedPeerIds.length === 0) return;

      const now = Date.now();
      const updatedPending = { ...state.pendingMessages };
      let updated = false;

      for (const [id, pending] of Object.entries(updatedPending)) {
        if (now - pending.lastRetry > 5000) {
          console.log(`[meshService] Retrying message ${id}`);
          const base64Data = Buffer.from(serializeMessage(pending.message), 'utf8').toString('base64');
          let success = false;
          
          for (const peerId of connectedPeerIds) {
            try {
              await AetherisBridge.sendRawBytes(peerId, base64Data);
              success = true;
            } catch (e) {
              console.warn(`[meshService] Retry to ${peerId} failed:`, e);
            }
          }

          if (success) {
            useMessagesStore.getState().updateStatus(id, 'sent');
            delete updatedPending[id];
            updated = true;
          } else {
            pending.retries += 1;
            pending.lastRetry = now;
            updated = true;
          }
        }
      }

      if (updated) {
        set({ pendingMessages: updatedPending });
      }
    },

    // ─── Send Pipeline ────────────────────────────────────────────────────────

    sendMessage: async (params: {
      recipientId: string;
      recipientPublicKeyBase64: string;
      text: string;
      messageId?: string;
    }) => {
      try {
        const {recipientId, recipientPublicKeyBase64, text, messageId} = params;

        // 1. Build message (encrypt + sign)
        const message = await buildMessage(
          ourPublicKeyBase58,
          undefined, // no alias
          recipientId,
          recipientPublicKeyBase64,
          {text},
          'MSG',
          messageId,
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
          serialized_message: serialized,
          nonce: message.payload.nonce,
          ephemeral_public_key: message.payload.ephemeralPublicKey,
          signature: message.signature,
          is_outbound: 1,
          ttl: message.routing.ttl,
          expires_at: message.routing.expiresAt,
          text: text,
        });

        // 4. Send to all connected peers (they will decide to relay or deliver)
        const connectedPeerIds = get().getConnectedPeerIds();
        console.log(
          `[meshService] Sending message ${message.id} to ${connectedPeerIds.length} peer(s)`,
        );

        let success = false;
        for (const peerId of connectedPeerIds) {
          try {
            await AetherisBridge.sendRawBytes(peerId, base64Data);
            success = true;
          } catch (e) {
            console.warn(`[meshService] Send to ${peerId} failed:`, e);
          }
        }

        const messagesStore = useMessagesStore.getState();
        if (success) {
          messagesStore.updateStatus(message.id, 'sent');
        } else {
          // Keep as pending and add to retry queue
          set(state => ({
            pendingMessages: {
              ...state.pendingMessages,
              [message.id]: { message, retries: 0, lastRetry: Date.now(), text }
            }
          }));
        }
        return {messageId: message.id, handedOff: success};
      } catch (e) {
        console.error('[meshService] Send failed:', e);
        throw e;
      }
    },

    // ─── Peer Queries ─────────────────────────────────────────────────────────

    getConnectedPeerIds: () => {
      return Object.values(get().connectedPeers)
        .filter(p => p.state === 'authenticated')
        .map(p => p.id);
    },

    isConnectedTo: (peerId: string) => {
      const peer = get().connectedPeers[peerId];
      return peer?.state === 'authenticated';
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
    const {peerId, data: base64Data} = event;

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

    // Handle handshake messages specifically
    if (message.type === 'HANDSHAKE_CHALLENGE' && decision.shouldDeliver) {
      try {
        const content = await openMessage(message, ourPrivateKeyBase64);
        const challenge = (content as {text?: string}).text;
        if (challenge) {
          const signature = await sodium.crypto_sign_detached(
            challenge,
            ourPrivateKeyBase64
          );
          const recipientPublicKeyBase64 = base58ToBase64(message.sender.id);
          const responseMsg = await buildMessage(
            ourPublicKeyBase58,
            undefined,
            message.sender.id,
            recipientPublicKeyBase64,
            {text: signature},
            'HANDSHAKE_RESPONSE',
          );
          const serialized = serializeMessage(responseMsg);
          const base64Data = Buffer.from(serialized, 'utf8').toString('base64');
          await AetherisBridge.sendRawBytes(message.sender.id, base64Data);
          console.log(`[meshService] Sent handshake response to ${message.sender.id}`);
        }
      } catch (e) {
         console.warn('Failed to process challenge', e);
      }
      return;
    }

    if (message.type === 'HANDSHAKE_RESPONSE' && decision.shouldDeliver) {
      try {
        const content = await openMessage(message, ourPrivateKeyBase64);
        const signature = (content as {text?: string}).text;
        const peerRecord = get().connectedPeers[message.sender.id];
        
        if (peerRecord && peerRecord.challenge && signature) {
          const senderPublicKeyBase64 = base58ToBase64(message.sender.id);
          const isValid = await sodium.crypto_sign_verify_detached(
            signature,
            peerRecord.challenge,
            senderPublicKeyBase64
          );
          
          if (isValid) {
             set((state: MeshServiceState) => ({
               connectedPeers: {
                 ...state.connectedPeers,
                 [message.sender.id]: {
                   ...state.connectedPeers[message.sender.id],
                   state: 'authenticated'
                 }
               }
             }));
             console.log(`[meshService] Peer ${message.sender.id} authenticated!`);
             setTimeout(() => get().retryPendingMessages(), 500);
          } else {
             console.error(`[meshService] Handshake failed: invalid signature from ${message.sender.id}`);
             AetherisBridge.disconnectFromPeer(message.sender.id);
          }
        }
      } catch (e) {
         console.warn('Failed to process handshake response', e);
      }
      return;
    }

    // 4. If for us, decrypt and deliver
    if (decision.shouldDeliver) {
      try {
        const privateKey = ourPrivateKeyBase64;
        const content = await openMessage(message, privateKey);

        if (content) {
          const textContent = (content as {text?: string}).text || '';

          // Store in DB with FULL encrypted payload and text
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
            text: textContent,
          });

          // Update messages store with decrypted text for UI display
          const messagesStore = useMessagesStore.getState();
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
        } else {
          console.warn('[meshService] Decryption returned null - cannot parse content');
        }
      } catch (e) {
        console.warn('[meshService] Decryption failed:', e);
        // Store error state so we can show user
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
      }
    }

    // 5. If should relay, forward to next hops
    if (decision.shouldRelay && decision.nextHops) {
      try {
        const relayMessage = prepareForRelay(message, ourNodeId);
        const relaySerialized = serializeMessage(relayMessage);
        const relayBase64 = Buffer.from(relaySerialized, 'utf8').toString(
          'base64',
        );

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
