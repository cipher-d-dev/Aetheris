/**
 * messageRelay.ts
 *
 * Implements Spray-and-Wait routing for Aetheris mesh messages.
 *
 * When a peer receives a message NOT addressed to them, they relay it to
 * a limited number of random neighbors (default: 2). This reduces congestion
 * vs. flooding while ensuring messages eventually reach their destination.
 *
 * TTL (Time-To-Live) decrements with each hop; messages expire when TTL=0.
 * Hop chain tracks the path: [sender] → [relay1] → [relay2] → [recipient]
 */

import { MeshMessage } from '../types/message';
import { dbHasSeenMessage, dbMarkMessageSeen } from '../db/database';

// Tracks incoming messages per peer ID for rate limiting
const rateLimits: Record<string, {count: number, resetAt: number}> = {};

export interface RelayDecision {
  shouldDeliver: boolean; // message is for us
  shouldRelay: boolean;   // message should be forwarded
  reason: string;         // why we made this decision
  nextHops?: string[];    // if relaying, which peers to forward to
}

/**
 * Select up to count peers, optionally excluding a peer that just forwarded
 * the message to us.
 */
export function selectRelayPeers(
  peers: string[],
  count: number,
  excludePeerId?: string,
): string[] {
  const candidates = peers.filter(peerId => peerId !== excludePeerId);
  if (candidates.length <= count) {
    return [...candidates];
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Determine if we should deliver, relay, or drop a received message.
 *
 * @param message         The received MeshMessage
 * @param ourNodeId       Our Aetheris node ID (Base58 public key)
 * @param connectedPeers  List of currently connected peer IDs
 * @returns               RelayDecision with action and reasoning
 */
export function decideMessageFate(
  message: MeshMessage,
  ourNodeId: string,
  connectedPeers: string[],
): RelayDecision {
  // 0. Rate limiting check
  const now = Date.now();
  const senderId = message.sender.id;
  
  if (!rateLimits[senderId] || now > rateLimits[senderId].resetAt) {
    rateLimits[senderId] = { count: 1, resetAt: now + 60000 }; // 1 min window
  } else {
    rateLimits[senderId].count += 1;
    if (rateLimits[senderId].count > 50) {
      return {
        shouldDeliver: false,
        shouldRelay: false,
        reason: 'Rate limit exceeded for sender (max 50/min)',
      };
    }
  }

  // 1. Check if already expired
  if (Date.now() > message.routing.expiresAt) {
    return {
      shouldDeliver: false,
      shouldRelay: false,
      reason: 'Message expired',
    };
  }

  // 2. Check if we've seen this message before (prevent loops)
  if (dbHasSeenMessage(message.id)) {
    return {
      shouldDeliver: false,
      shouldRelay: false,
      reason: 'Duplicate (already seen)',
    };
  }

  // 3. Mark as seen (register that we've processed it)
  dbMarkMessageSeen(message.id);

  // 4. Check if message is for us
  if (message.recipient.id === ourNodeId) {
    return {
      shouldDeliver: true,
      shouldRelay: false,
      reason: 'Message is for us',
    };
  }

  // 5. Check if TTL expired (no more hops available)
  if (message.routing.ttl <= 0) {
    return {
      shouldDeliver: false,
      shouldRelay: false,
      reason: 'TTL exhausted',
    };
  }

  // 6. Check if we have any neighbors to relay to
  // (exclude sender to avoid bouncing back immediately)
  const lastHopFromMessage = message.routing.hops.length > 0
    ? message.routing.hops[message.routing.hops.length - 1]
    : message.sender.id;

  const relayTargets = connectedPeers.filter(p => p !== lastHopFromMessage);

  if (relayTargets.length === 0) {
    return {
      shouldDeliver: false,
      shouldRelay: false,
      reason: 'No available relay peers',
    };
  }

  // 7. Select random peers for Spray-and-Wait
  const sprayCount = Math.min(2, relayTargets.length); // forward to up to 2 peers
  const nextHops = selectRelayPeers(relayTargets, sprayCount);

  return {
    shouldDeliver: false,
    shouldRelay: true,
    reason: `Relaying to ${nextHops.length} peer(s)`,
    nextHops,
  };
}

/**
 * Prepare a message for relaying: decrement TTL, add ourselves to hop chain.
 *
 * @param message The received MeshMessage to relay
 * @param ourNodeId Our node ID to add to the hop chain
 * @returns Modified message ready for transmission (signature invalid after modification!)
 */
export function prepareForRelay(
  message: MeshMessage,
  ourNodeId: string,
): MeshMessage {
  return {
    ...message,
    routing: {
      ...message.routing,
      ttl: message.routing.ttl - 1,
      hops: [...message.routing.hops, ourNodeId],
    },
  };
}

/**
 * Format a routing path for UI display.
 * Example: "You → Peer-A → Peer-B → Recipient"
 */
export function formatRoutingPath(
  hops: string[],
  senderAlias?: string,
  recipientAlias?: string,
): string {
  const shortId = (id: string) => id.slice(0, 5) + '...' + id.slice(-5);

  const sender = senderAlias || shortId(hops[0] || 'unknown');
  const relay = hops.slice(1, -1).map(h => shortId(h)).join(' → ');
  const recipient = recipientAlias || shortId(hops[hops.length - 1] || 'unknown');

  if (relay) {
    return `${sender} → ${relay} → ${recipient}`;
  }
  return `${sender} → ${recipient}`;
}
