/**
 * End-to-end over real libsodium: three phones in a line, A → B → C.
 * Proves signing, link authentication, encryption, relaying and decryption
 * all agree with each other — the parts the simulation fakes.
 */
import {describe, expect, it, jest} from '@jest/globals';

jest.mock('react-native-sodium', () => require('../testing/sodiumShim').default);

import sodium from 'react-native-sodium';
import {Buffer} from 'buffer';
import {toBase58} from '../../crypto/encoding';
import {createRnCrypto} from '../rnCrypto';
import {MeshNode} from '../meshNode';
import {MemoryStore} from '../testing/simNetwork';
import {MessageContent} from '../../types/message';

async function makePhone() {
  const kp = await sodium.crypto_sign_keypair();
  const id = toBase58(Buffer.from(kp.pk, 'base64'));
  return {id, sk: kp.sk};
}

describe('real crypto over the mesh', () => {
  it('relays an encrypted, signed message that only the recipient can read', async () => {
    const phones = await Promise.all([makePhone(), makePhone(), makePhone()]);
    const [, b, c] = phones;
    const links = new Set(['A|B', 'B|C']);
    const names = ['A', 'B', 'C'];
    const queue: (() => Promise<void>)[] = [];
    const delivered: Record<string, MessageContent[]> = {A: [], B: [], C: []};
    const opened: Record<string, number> = {A: 0, B: 0, C: 0};
    const acks: string[] = [];
    const nodes: Record<string, MeshNode> = {};

    phones.forEach((p, i) => {
      const name = names[i];
      const crypto = createRnCrypto(p.id, p.sk);
      const realOpen = crypto.openMessage;
      crypto.openMessage = async m => {
        const r = await realOpen(m);
        if (r) opened[name]++;
        return r;
      };
      nodes[name] = new MeshNode(
        p.id,
        {
          send: async (linkId, data) => {
            const [from, to] = linkId.split('->');
            if (!links.has([from, to].sort().join('|'))) throw new Error('down');
            queue.push(() => nodes[to].onFrame(`${to}->${from}`, data));
          },
          disconnect: () => undefined,
        },
        crypto,
        new MemoryStore(),
        {
          onDeliver: (_m, content) => delivered[name].push(content),
          onAck: id => acks.push(id),
        },
      );
    });

    const settle = async () => {
      while (queue.length) await queue.shift()!();
    };
    for (const l of links) {
      const [x, y] = l.split('|');
      await nodes[x].onLinkUp(`${x}->${y}`);
      await nodes[y].onLinkUp(`${y}->${x}`);
    }
    await settle();
    await nodes.A.tick();
    await nodes.B.tick();
    await nodes.C.tick();
    await settle();

    expect(nodes.A.table.get(c.id)).toMatchObject({hops: 2, nextHop: b.id});

    const m = await nodes.A.send({recipientId: c.id, content: {kind: 'text', text: 'secret'}});
    await settle();

    expect(delivered.C.map(x => x.text)).toEqual(['secret']);
    expect(delivered.B).toHaveLength(0);
    expect(opened.B).toBe(0); // the relay could not decrypt anything
    expect(acks).toEqual([m.id]);
    expect(Buffer.from(m.payload.encrypted, 'base64').toString('utf8')).not.toContain('secret');
  });
});
