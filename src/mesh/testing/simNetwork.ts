/**
 * simNetwork.ts
 *
 * An in-memory mesh of MeshNodes for tests: fake radio links, fake (but
 * strict) crypto, a shared virtual clock and a deterministic delivery queue.
 * Lets us prove multi-hop routing works without owning five phones.
 */

import {MeshMessage, MessageContent} from '../../types/message';
import {
  CarryRecord,
  MeshConfig,
  MeshCrypto,
  MeshEvents,
  MeshNode,
  MeshStore,
} from '../meshNode';

export class MemoryStore implements MeshStore {
  seen = new Set<string>();
  carried = new Map<string, CarryRecord>();
  hasSeen(k: string) {
    return this.seen.has(k);
  }
  markSeen(k: string) {
    this.seen.add(k);
  }
  carryPut(r: CarryRecord) {
    this.carried.set(r.message.id, JSON.parse(JSON.stringify(r)));
  }
  carryRemove(id: string) {
    this.carried.delete(id);
  }
  carryList() {
    return [...this.carried.values()];
  }
}

let idCounter = 0;

/** Signatures are "<signer>|<text>": unforgeable within the sim's rules. */
export class FakeCrypto implements MeshCrypto {
  constructor(private selfId: string, private clock: () => number) {}

  async randomNonce() {
    return `nonce-${this.selfId}-${++idCounter}`;
  }
  async signText(text: string) {
    return `${this.selfId}|${text}`;
  }
  async verifyText(text: string, sig: string, signerId: string) {
    return sig === `${signerId}|${text}`;
  }
  async buildMessage(p: {
    id?: string;
    recipientId: string;
    content: MessageContent;
    type: MeshMessage['type'];
    ttl: number;
  }): Promise<MeshMessage> {
    const t = this.clock();
    const m: MeshMessage = {
      id: p.id ?? `m${++idCounter}`,
      version: 1,
      type: p.type,
      sender: {id: this.selfId},
      recipient: {id: p.recipientId},
      payload: {
        encrypted: Buffer.from(JSON.stringify({for: p.recipientId, c: p.content})).toString('base64'),
        nonce: 'n',
        ephemeralPublicKey: 'e',
      },
      routing: {ttl: p.ttl, hops: [], originTimestamp: t, expiresAt: t + 72 * 3600_000},
      signature: '',
    };
    m.signature = signatureFor(m);
    return m;
  }
  async verifyMessage(m: MeshMessage) {
    return m.signature === signatureFor(m);
  }
  async openMessage(m: MeshMessage) {
    const body = JSON.parse(Buffer.from(m.payload.encrypted, 'base64').toString());
    return body.for === this.selfId ? (body.c as MessageContent) : null;
  }
}

function signatureFor(m: MeshMessage) {
  return `${m.sender.id}|${m.id}|${m.type}|${m.recipient.id}|${m.payload.encrypted}|${m.routing.expiresAt}`;
}

export interface SimNode {
  id: string;
  node: MeshNode;
  store: MemoryStore;
  delivered: {message: MeshMessage; content: MessageContent}[];
  acks: {id: string; path: string[]}[];
  sent: string[];
}

export class SimNetwork {
  time = 1_000_000;
  nodes = new Map<string, SimNode>();
  private links = new Set<string>(); // "a|b" sorted
  private queue: (() => Promise<void>)[] = [];
  framesSent = 0;

  constructor(private config: Partial<MeshConfig> = {}) {}

  clock = () => this.time;

  add(id: string, events: MeshEvents = {}): SimNode {
    const store = new MemoryStore();
    const sim: SimNode = {id, node: null as any, store, delivered: [], acks: [], sent: []};
    const transport = {
      send: async (linkId: string, data: string) => {
        const [from, to] = linkId.split('->');
        if (!this.isLinked(from, to)) throw new Error('link down');
        this.framesSent++;
        this.queue.push(async () => {
          if (!this.isLinked(from, to)) return;
          await this.nodes.get(to)!.node.onFrame(`${to}->${from}`, data);
        });
      },
      disconnect: (linkId: string) => {
        const [from, to] = linkId.split('->');
        this.unlink(from, to);
      },
    };
    sim.node = new MeshNode(
      id,
      transport,
      new FakeCrypto(id, this.clock),
      store,
      {
        onDeliver: (message, content) => sim.delivered.push({message, content}),
        onAck: (mid, path) => sim.acks.push({id: mid, path}),
        onSent: mid => sim.sent.push(mid),
        ...events,
      },
      this.config,
      this.clock,
    );
    this.nodes.set(id, sim);
    return sim;
  }

  private key(a: string, b: string) {
    return [a, b].sort().join('|');
  }

  isLinked(a: string, b: string) {
    return this.links.has(this.key(a, b));
  }

  async link(a: string, b: string) {
    this.links.add(this.key(a, b));
    await this.nodes.get(a)!.node.onLinkUp(`${a}->${b}`);
    await this.nodes.get(b)!.node.onLinkUp(`${b}->${a}`);
    await this.settle();
  }

  async unlink(a: string, b: string) {
    if (!this.links.delete(this.key(a, b))) return;
    this.nodes.get(a)!.node.onLinkDown(`${a}->${b}`);
    this.nodes.get(b)!.node.onLinkDown(`${b}->${a}`);
    await this.settle();
  }

  /** Run queued frame deliveries until the network is quiet. */
  async settle(maxSteps = 100_000) {
    let steps = 0;
    while (this.queue.length) {
      if (++steps > maxSteps) throw new Error('network did not settle');
      const job = this.queue.shift()!;
      await job();
    }
  }

  /** Advance virtual time, ticking every node at `stepMs`. */
  async advance(ms: number, stepMs = 1_000) {
    const end = this.time + ms;
    while (this.time < end) {
      this.time += stepMs;
      for (const n of this.nodes.values()) await n.node.tick();
      await this.settle();
    }
  }

  get(id: string) {
    return this.nodes.get(id)!;
  }
}
