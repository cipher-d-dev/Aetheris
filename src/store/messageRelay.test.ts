import {
  decideMessageFate,
  prepareForRelay,
  selectRelayPeers,
} from './messageRelay';
import {beforeAll, describe, expect, it} from '@jest/globals';
import {initDatabase} from '../db/database';

describe('message relay', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  it('limits peer selection to the requested fan-out and excludes the sender', () => {
    const peers = selectRelayPeers(['a', 'b', 'c'], 2, 'a');

    expect(peers).toHaveLength(2);
    expect(peers).not.toContain('a');
    expect(new Set(peers).size).toBe(2);
  });

  it('decrements TTL and appends the relay node to the hop chain', () => {
    const message = {
      id: 'message-1',
      version: 1,
      type: 'MSG' as const,
      sender: {id: 'sender'},
      recipient: {id: 'recipient'},
      payload: {
        encrypted: 'ciphertext',
        nonce: 'nonce',
        ephemeralPublicKey: 'ephemeral',
      },
      routing: {
        ttl: 3,
        hops: ['sender'],
        originTimestamp: 1,
        expiresAt: Date.now() + 60_000,
      },
      signature: 'signature',
    };

    const relayed = prepareForRelay(message, 'relay');

    expect(relayed.routing).toEqual({
      ...message.routing,
      ttl: 2,
      hops: ['sender', 'relay'],
    });
  });

  it('selects at most two next hops', () => {
    const message = {
      id: 'message-2',
      version: 1,
      type: 'MSG' as const,
      sender: {id: 'sender'},
      recipient: {id: 'recipient'},
      payload: {
        encrypted: 'ciphertext',
        nonce: 'nonce',
        ephemeralPublicKey: 'ephemeral',
      },
      routing: {
        ttl: 3,
        hops: [],
        originTimestamp: 1,
        expiresAt: Date.now() + 60_000,
      },
      signature: 'signature',
    };

    const decision = decideMessageFate(message, 'relay', [
      'peer-1',
      'peer-2',
      'peer-3',
    ]);

    expect(decision.shouldRelay).toBe(true);
    expect(decision.nextHops).toHaveLength(2);
  });
});
