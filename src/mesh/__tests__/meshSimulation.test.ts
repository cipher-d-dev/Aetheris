import {describe, expect, it} from '@jest/globals';
import {SimNetwork} from '../testing/simNetwork';
import {INFINITY_HOPS} from '../routingTable';

async function build(ids: string[], edges: [string, string][], net = new SimNetwork()) {
  ids.forEach(id => net.add(id));
  for (const [a, b] of edges) await net.link(a, b);
  await net.advance(30_000); // let routing converge
  return net;
}

describe('mesh routing', () => {
  it('learns multi-hop routes along a line', async () => {
    const net = await build(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const r = net.get('A').node.table.get('D')!;
    expect(r.hops).toBe(3);
    expect(r.nextHop).toBe('B');
    expect(net.get('D').node.table.get('A')!.hops).toBe(3);
  });

  it('delivers across hops and ACKs back with the path taken', async () => {
    const net = await build(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const m = await net.get('A').node.send({recipientId: 'D', content: {text: 'hi'}});
    await net.settle();

    expect(net.get('D').delivered.map(d => d.content.text)).toEqual(['hi']);
    expect(net.get('D').delivered[0].message.routing.hops).toEqual(['B', 'C']);
    expect(net.get('A').sent).toContain(m.id);
    expect(net.get('A').acks).toEqual([{id: m.id, path: ['B', 'C']}]);
    expect(net.get('A').node.carryCount()).toBe(0);
  });

  it('picks the shortest of several paths', async () => {
    // Long way: A-B-C-D-E (4 hops). Short way: A-X-E (2 hops).
    const net = await build(
      ['A', 'B', 'C', 'D', 'E', 'X'],
      [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['A', 'X'], ['X', 'E']],
    );
    expect(net.get('A').node.table.get('E')).toMatchObject({hops: 2, nextHop: 'X'});

    await net.get('A').node.send({recipientId: 'E', content: {text: 'shortcut'}});
    await net.settle();
    expect(net.get('E').delivered[0].message.routing.hops).toEqual(['X']);
    // Long-path relays never saw it
    expect(net.get('C').node.carryCount()).toBe(0);
  });

  it('reroutes when a link on the shortest path breaks', async () => {
    const net = await build(
      ['A', 'B', 'C', 'D', 'E'],
      [['A', 'B'], ['B', 'C'], ['A', 'D'], ['D', 'E'], ['E', 'C']],
    );
    expect(net.get('A').node.table.get('C')).toMatchObject({hops: 2, nextHop: 'B'});

    await net.unlink('B', 'C');
    await net.advance(30_000);

    expect(net.get('A').node.table.get('C')).toMatchObject({hops: 3, nextHop: 'D'});
    await net.get('A').node.send({recipientId: 'C', content: {text: 'detour'}});
    await net.settle();
    expect(net.get('C').delivered[0].message.routing.hops).toEqual(['D', 'E']);
  });

  it('marks a vanished node unreachable everywhere (no count-to-infinity)', async () => {
    const net = await build(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'C']]);
    await net.unlink('C', 'D');
    await net.advance(60_000);
    for (const id of ['A', 'B', 'C']) {
      expect(net.get(id).node.table.nextHopFor('D')).toBeNull();
    }
    const entry = net.get('A').node.table.get('D');
    expect(entry === undefined || entry.hops === INFINITY_HOPS).toBe(true);
  });
});

describe('store-carry-forward', () => {
  it('carries a message to a recipient who was out of reach', async () => {
    // A and B together; C is far away and not connected to anyone.
    const net = await build(['A', 'B', 'C'], [['A', 'B']]);
    const m = await net.get('A').node.send({recipientId: 'C', content: {text: 'later'}});
    await net.settle();

    expect(net.get('C').delivered).toHaveLength(0);
    expect(net.get('A').sent).toContain(m.id); // a copy left A (to B)
    expect(net.get('B').node.carryCount()).toBe(1);

    // B walks away from A and meets C.
    await net.unlink('A', 'B');
    await net.link('B', 'C');
    await net.advance(5_000);
    expect(net.get('C').delivered.map(d => d.content.text)).toEqual(['later']);

    // The ACK rides back with B when B meets A again.
    expect(net.get('A').acks).toHaveLength(0);
    await net.unlink('B', 'C');
    await net.link('A', 'B');
    await net.advance(5_000);
    expect(net.get('A').acks.map(a => a.id)).toEqual([m.id]);
    expect(net.get('A').node.carryCount()).toBe(0);
  });

  it('counts only other people\'s messages as carried for others', async () => {
    const net = await build(['A', 'B', 'C'], [['A', 'B']]);
    await net.get('A').node.send({recipientId: 'C', content: {text: 'later'}});
    await net.settle();

    expect(net.get('B').node.carryForOthersCount()).toBe(1);
    expect(net.get('A').node.carryForOthersCount()).toBe(0);
    expect(net.get('A').node.carryCount()).toBe(1);
  });

  it('queues on the sender when it has no neighbours at all', async () => {
    const net = await build(['A', 'B'], []);
    await net.get('A').node.send({recipientId: 'B', content: {text: 'queued'}});
    await net.settle();
    expect(net.get('A').sent).toHaveLength(0);
    await net.link('A', 'B');
    expect(net.get('B').delivered.map(d => d.content.text)).toEqual(['queued']);
    expect(net.get('A').acks).toHaveLength(1);
  });
});

describe('reliability and safety', () => {
  it('retransmits when the ACK is lost, without duplicating delivery', async () => {
    const net = await build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    // Drop C→B frames right after delivery so the ACK is lost.
    const nodeB = net.get('B').node;
    const realOnFrame = nodeB.onFrame.bind(nodeB);
    let dropAcks = true;
    nodeB.onFrame = async (linkId, data) => {
      if (dropAcks && linkId === 'B->C' && data.includes('"type":"ACK"')) return;
      return realOnFrame(linkId, data);
    };

    const m = await net.get('A').node.send({recipientId: 'C', content: {text: 'once'}});
    await net.settle();
    expect(net.get('C').delivered).toHaveLength(1);
    expect(net.get('A').acks).toHaveLength(0);

    dropAcks = false;
    await net.advance(40_000);
    expect(net.get('A').acks.map(a => a.id)).toEqual([m.id]);
    expect(net.get('C').delivered).toHaveLength(1);
  });

  it('rejects a link that cannot prove its identity', async () => {
    const net = new SimNetwork();
    net.add('A');
    const evil = net.add('EVIL');
    // EVIL claims to be "B" but can only sign as EVIL.
    (evil.node as any).selfId = 'B';
    await net.link('A', 'EVIL');
    expect(net.get('A').node.getNeighbours()).toHaveLength(0);
    expect(net.isLinked('A', 'EVIL')).toBe(false);
  });

  it('drops tampered messages at the first relay', async () => {
    const net = await build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const m = await net.get('A').node.send({recipientId: 'C', content: {text: 'x'}});
    await net.settle();
    const tampered = {...m, id: 'other', routing: {...m.routing, attempt: 9}};
    await net.get('B').node.onFrame('B->A', JSON.stringify({t: 'MSG', m: tampered}));
    await net.settle();
    expect(net.get('C').delivered.map(d => d.message.id)).toEqual([m.id]);
  });

  it('does not loop messages forever in a dense mesh', async () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
    const edges: [string, string][] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) if ((i + j) % 2) edges.push([ids[i], ids[j]]);
    const net = await build(ids, edges);
    const before = net.framesSent;
    await net.get('A').node.send({recipientId: 'F', content: {text: 'x'}});
    await net.settle();
    expect(net.get('F').delivered).toHaveLength(1);
    expect(net.framesSent - before).toBeLessThan(20);
  });
});

describe('randomised meshes', () => {
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  function bfs(edges: [string, string][], from: string): Map<string, number> {
    const dist = new Map([[from, 0]]);
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      for (const [a, b] of edges) {
        const nxt = a === cur ? b : b === cur ? a : null;
        if (nxt && !dist.has(nxt)) {
          dist.set(nxt, dist.get(cur)! + 1);
          q.push(nxt);
        }
      }
    }
    return dist;
  }

  for (const seed of [1, 7, 42, 99, 2024]) {
    it(`delivers every message along a shortest path (seed ${seed})`, async () => {
      const rand = rng(seed);
      const ids = Array.from({length: 14}, (_, i) => `N${i}`);
      const edges: [string, string][] = [];
      // spanning chain in random order keeps it connected, plus random extras
      const order = [...ids].sort(() => rand() - 0.5);
      for (let i = 1; i < order.length; i++) edges.push([order[i - 1], order[i]]);
      for (let k = 0; k < 8; k++) {
        const a = ids[Math.floor(rand() * ids.length)];
        const b = ids[Math.floor(rand() * ids.length)];
        if (a !== b && !edges.some(e => e.includes(a) && e.includes(b))) edges.push([a, b]);
      }
      const net = await build(ids, edges);

      for (let k = 0; k < 20; k++) {
        const from = ids[Math.floor(rand() * ids.length)];
        let to = ids[Math.floor(rand() * ids.length)];
        if (to === from) to = ids[(ids.indexOf(from) + 1) % ids.length];
        const m = await net.get(from).node.send({recipientId: to, content: {text: `${k}`}});
        await net.settle();
        const got = net.get(to).delivered.find(d => d.message.id === m.id);
        expect(got).toBeDefined();
        const shortest = bfs(edges, from).get(to)!;
        expect(got!.message.routing.hops.length).toBe(shortest - 1);
        expect(net.get(from).acks.some(a => a.id === m.id)).toBe(true);
      }
    });
  }
});

describe('routing security', () => {
  it('ignores a forged route that claims a fresher sequence number for someone else', async () => {
    // A - B - C - D. B turns malicious and claims D is right next to it,
    // with a huge (unsigned) sequence number, to swallow D's traffic.
    const net = await build(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const forged = {t: 'ROUTES', r: [{d: 'D', h: 0, s: 9e12, g: 'B|forged'}]};
    await net.get('A').node.onFrame('A->B', JSON.stringify(forged));
    await net.settle();
    expect(net.get('A').node.table.get('D')).toMatchObject({hops: 3});
    expect(net.get('A').node.table.get('D')!.seq).toBeLessThan(9e12);
  });

  it('only accepts display names signed by their owner', async () => {
    const net = new SimNetwork();
    ['A', 'B', 'C'].forEach(id => net.add(id));
    net.get('C').node.alias = 'Carol';
    for (const [a, b] of [['A', 'B'], ['B', 'C']] as const) await net.link(a, b);
    await net.advance(30_000);
    expect(net.get('A').node.table.get('C')!.alias).toBe('Carol');

    // B re-advertises C's current seq under a different name.
    const real = net.get('A').node.table.get('C')!;
    const spoof = {t: 'ROUTES', r: [{d: 'C', h: 0, s: real.seq, a: 'Mallory', g: real.sig}]};
    await net.get('A').node.onFrame('A->B', JSON.stringify(spoof));
    expect(net.get('A').node.table.get('C')!.alias).toBe('Carol');
  });
});

describe('storage limits', () => {
  it('evicts the oldest messages held for others, never our own', async () => {
    const net = new SimNetwork({maxCarriedForOthers: 3});
    ['A', 'B', 'X'].forEach(id => net.add(id));
    await net.link('A', 'B');
    await net.advance(20_000);
    // A has no route to X, so B ends up carrying A's messages for X.
    const own = await net.get('B').node.send({recipientId: 'X', content: {text: 'mine'}});
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      ids.push((await net.get('A').node.send({recipientId: 'X', content: {text: `${i}`}})).id);
    }
    await net.settle();
    const held = [...net.get('B').store.carried.keys()];
    expect(held).toContain(own.id);
    expect(held.filter(id => id !== own.id)).toEqual(ids.slice(-3));
  });
});

describe('profile photos', () => {
  const photo = (seed: string) => ({hash: `h-${seed}`, data: Buffer.from(`jpeg-${seed}`).toString('base64')});

  it('shares a photo with a neighbour on connect and when it changes', async () => {
    const net = new SimNetwork();
    const got: {from: string; hash: string}[] = [];
    net.add('A');
    net.add('B', {onProfile: (from, p) => got.push({from, hash: p.hash})});
    await net.get('A').node.setPhoto(photo('1'));
    await net.link('A', 'B');
    expect(got).toEqual([{from: 'A', hash: 'h-1'}]);

    await net.get('A').node.setPhoto(photo('2'));
    await net.settle();
    await net.get('A').node.setPhoto(null);
    await net.settle();
    expect(got.map(g => g.hash)).toEqual(['h-1', 'h-2', '']);
  });

  it('ignores oversized or malformed photos, and photos from unauthenticated links', async () => {
    const net = new SimNetwork();
    const got: string[] = [];
    net.add('A');
    net.add('B', {onProfile: (_f, p) => got.push(p.hash)});
    await net.link('A', 'B');
    const B = net.get('B').node;
    await B.onFrame('B->A', JSON.stringify({t: 'PROFILE', h: 'x', d: 'A'.repeat(30_000)}));
    await B.onFrame('B->A', JSON.stringify({t: 'PROFILE', h: 'x', d: '<script>'}));
    await B.onFrame('B->A', JSON.stringify({t: 'PROFILE', h: '', d: 'QUJD'}));
    await B.onLinkUp('B->Z'); // new, unauthenticated link
    await B.onFrame('B->Z', JSON.stringify({t: 'PROFILE', h: 'z', d: 'QUJD'}));
    expect(got).toEqual([]);
  });
});
