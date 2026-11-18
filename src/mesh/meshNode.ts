/**
 * meshNode.ts
 *
 * The heart of Aetheris: one node of the mesh. It knows nothing about
 * React Native, Bluetooth or SQLite — those are injected — so the exact same
 * code runs on a phone and inside the multi-node simulation tests.
 *
 * Responsibilities:
 *   1. Link authentication: every new radio link proves it owns the node ID
 *      (Ed25519 challenge/response) before we trust anything it says.
 *   2. Routing: exchange distance-vector adverts so each node knows the next
 *      hop on the shortest path to every reachable node (see routingTable.ts).
 *   3. Forwarding:
 *        - recipient is a neighbour      → send straight to it
 *        - a route is known              → send to the next hop (shortest path)
 *        - no route yet                  → store-carry-forward: keep the
 *          message, spray a few copies to new neighbours, and deliver when a
 *          route appears or the carrier walks into range of the recipient.
 *   4. Delivery + ACKs: decrypt messages for us, send an ACK back through the
 *      mesh, retransmit our own messages if no ACK arrives.
 */

import {MeshMessage, MessageContent, MessageType} from '../types/message';
import {AdvertEntry, evenSeq, routeOriginText, RoutingTable} from './routingTable';

// ─── Tunables ─────────────────────────────────────────────────────────────────

export interface MeshConfig {
  /** Periodic routing advert interval */
  advertIntervalMs: number;
  /** Routes not refreshed for this long are dropped */
  routeTimeoutMs: number;
  /** Minimum gap between triggered (change-driven) adverts */
  triggeredAdvertGapMs: number;
  /** First retransmit of our own un-ACKed message; doubles each attempt */
  ackTimeoutMs: number;
  /** Cap on retransmit backoff */
  maxRetryGapMs: number;
  /** Copy budget for Spray-and-Wait when no route is known */
  sprayCopies: number;
  /** Hop limit */
  defaultTtl: number;
  /** Per-origin relay cap per minute (anti-spam) */
  relayRateLimitPerMin: number;
  /** Max routing entries we'll accept/advertise */
  maxRoutes: number;
  /** Max messages held for other people (our own are never evicted) */
  maxCarriedForOthers: number;
  /** Max total size (bytes of JSON) of messages held for other people */
  maxCarriedBytes: number;
}

export const DEFAULT_CONFIG: MeshConfig = {
  advertIntervalMs: 10_000,
  routeTimeoutMs: 45_000,
  triggeredAdvertGapMs: 1_000,
  ackTimeoutMs: 30_000,
  maxRetryGapMs: 10 * 60_000,
  sprayCopies: 4,
  defaultTtl: 16,
  relayRateLimitPerMin: 120,
  maxRoutes: 256,
  maxCarriedForOthers: 500,
  maxCarriedBytes: 40 * 1024 * 1024,
};

// ─── Injected dependencies ────────────────────────────────────────────────────

export interface MeshTransport {
  /** Send a frame over a radio link. Rejects if the link is gone. */
  send(linkId: string, data: string): Promise<void>;
  /** Drop a link (e.g. failed authentication). */
  disconnect(linkId: string): void;
}

export interface MeshCrypto {
  randomNonce(): Promise<string>;
  /** Sign arbitrary text with our identity key. */
  signText(text: string): Promise<string>;
  /** Verify text was signed by the node whose public key is `signerId`. */
  verifyText(text: string, signature: string, signerId: string): Promise<boolean>;
  /** Encrypt + sign a new message from us. */
  buildMessage(params: {
    id?: string;
    recipientId: string;
    content: MessageContent;
    type: MessageType;
    ttl: number;
  }): Promise<MeshMessage>;
  verifyMessage(message: MeshMessage): Promise<boolean>;
  /** Decrypt a message addressed to us; null if it can't be opened. */
  openMessage(message: MeshMessage): Promise<MessageContent | null>;
}

export interface CarryRecord {
  message: MeshMessage;
  /** We originated it (retransmit until ACKed) */
  own: boolean;
  /** Last time we handed it off along a route / directly */
  lastAttemptAt: number;
  /** Neighbours we already sprayed copies to */
  sprayedTo: string[];
}

export interface MeshStore {
  hasSeen(key: string): boolean;
  markSeen(key: string): void;
  carryPut(record: CarryRecord): void;
  carryRemove(messageId: string): void;
  carryList(): CarryRecord[];
}

export interface MeshEvents {
  /** A message for us was decrypted. Called once per message ID. */
  onDeliver?(message: MeshMessage, content: MessageContent): void;
  /** One of our messages was ACKed by its recipient. */
  onAck?(messageId: string, path: string[]): void;
  /** One of our messages left this device for the first time. */
  onSent?(messageId: string): void;
  /** One of our messages expired without an ACK. */
  onExpired?(messageId: string): void;
  /** Number of messages held on this phone changed. */
  onCarryChanged?(count: number): void;
  /** Neighbours or routes changed — refresh UI. */
  onTopologyChanged?(): void;
  log?(msg: string): void;
}

// ─── Wire frames ──────────────────────────────────────────────────────────────

export const LINK_PROTOCOL_VERSION = 2;

export type Frame =
  | {t: 'HELLO'; v: number; id: string; nonce: string; alias?: string}
  | {t: 'PROOF'; id: string; sig: string}
  | {t: 'ROUTES'; r: AdvertEntry[]}
  | {t: 'MSG'; m: MeshMessage};

function proofText(challenge: string, proverId: string): string {
  return `aetheris-link-v${LINK_PROTOCOL_VERSION}|${challenge}|${proverId}`;
}

interface Link {
  linkId: string;
  /** Nonce we challenged the peer with */
  ourNonce?: string;
  /** Node ID the peer claims (from HELLO / PROOF) */
  claimedId?: string;
  alias?: string;
  authenticated: boolean;
  /** Frames that arrived before our nonce was ready */
  early: string[];
}

export interface NeighbourInfo {
  id: string;
  alias?: string;
  linkId: string;
}

// ─── MeshNode ─────────────────────────────────────────────────────────────────

export class MeshNode {
  readonly table: RoutingTable;
  private readonly cfg: MeshConfig;
  private links = new Map<string, Link>(); // linkId → link
  private neighbours = new Map<string, string>(); // nodeId → linkId
  private carry = new Map<string, CarryRecord>();
  private delivered = new Set<string>();
  private rate = new Map<string, {count: number; resetAt: number}>();
  private nextAdvertAt = 0;
  private lastTriggeredAt = -Infinity;
  private triggeredPending = false;
  private processingCarry = false;
  private carryDirty = false;
  private carrySizes = new Map<string, number>();
  private verifiedOrigins = new Set<string>();
  private ownSig?: {seq: number; alias?: string; sig: string};
  alias?: string;

  constructor(
    readonly selfId: string,
    private readonly transport: MeshTransport,
    private readonly crypto: MeshCrypto,
    private readonly store: MeshStore,
    private readonly events: MeshEvents = {},
    config: Partial<MeshConfig> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.cfg = {...DEFAULT_CONFIG, ...config};
    this.table = new RoutingTable(selfId, now, this.cfg.routeTimeoutMs);
    for (const rec of store.carryList()) {
      this.carry.set(rec.message.id, rec);
      this.carrySizes.set(rec.message.id, JSON.stringify(rec.message).length);
    }
  }

  setConfig(partial: Partial<MeshConfig>) {
    Object.assign(this.cfg, partial);
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  getNeighbours(): NeighbourInfo[] {
    return [...this.neighbours.entries()].map(([id, linkId]) => ({
      id,
      linkId,
      // Prefer the signed alias from routing over the unsigned HELLO one.
      alias: this.table.get(id)?.alias ?? this.links.get(linkId)?.alias,
    }));
  }

  isNeighbour(nodeId: string): boolean {
    return this.neighbours.has(nodeId);
  }

  carryCount(): number {
    return this.carry.size;
  }

  // ─── Link lifecycle (called by the transport adapter) ───────────────────────

  async onLinkUp(linkId: string): Promise<void> {
    const link: Link = {linkId, authenticated: false, early: []};
    this.links.set(linkId, link);
    link.ourNonce = await this.crypto.randomNonce();
    await this.sendFrame(linkId, {
      t: 'HELLO',
      v: LINK_PROTOCOL_VERSION,
      id: this.selfId,
      nonce: link.ourNonce,
      ...(this.alias ? {alias: this.alias} : {}),
    });
    const early = link.early.splice(0);
    for (const data of early) {
      await this.onFrame(linkId, data);
    }
  }

  onLinkDown(linkId: string): void {
    const link = this.links.get(linkId);
    this.links.delete(linkId);
    if (!link?.claimedId) return;
    const nodeId = link.claimedId;
    if (this.neighbours.get(nodeId) !== linkId) return; // superseded link
    this.neighbours.delete(nodeId);
    this.log(`neighbour lost ${short(nodeId)}`);
    if (this.table.removeNeighbour(nodeId)) this.scheduleTriggeredAdvert();
    this.events.onTopologyChanged?.();
  }

  async onFrame(linkId: string, data: string): Promise<void> {
    const link = this.links.get(linkId);
    if (!link) return;
    if (!link.ourNonce) {
      link.early.push(data);
      return;
    }
    let frame: Frame;
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;

    switch (frame.t) {
      case 'HELLO':
        return this.handleHello(link, frame);
      case 'PROOF':
        return this.handleProof(link, frame);
      case 'ROUTES':
        if (!link.authenticated || !link.claimedId) return;
        return this.handleRoutes(link.claimedId, frame.r);
      case 'MSG':
        if (!link.authenticated || !link.claimedId) return;
        return this.handleMessage(link.claimedId, frame.m);
    }
  }

  private async handleHello(link: Link, f: Extract<Frame, {t: 'HELLO'}>) {
    if (typeof f.id !== 'string' || typeof f.nonce !== 'string') return;
    if (f.id === this.selfId) {
      this.transport.disconnect(link.linkId);
      return;
    }
    if (link.claimedId && link.claimedId !== f.id) return;
    link.claimedId = f.id;
    if (typeof f.alias === 'string') link.alias = f.alias.slice(0, 32);
    const sig = await this.crypto.signText(proofText(f.nonce, this.selfId));
    await this.sendFrame(link.linkId, {t: 'PROOF', id: this.selfId, sig});
  }

  private async handleProof(link: Link, f: Extract<Frame, {t: 'PROOF'}>) {
    if (link.authenticated || !link.ourNonce) return;
    if (typeof f.id !== 'string' || typeof f.sig !== 'string') return;
    if (link.claimedId && link.claimedId !== f.id) return;
    const ok = await this.crypto
      .verifyText(proofText(link.ourNonce, f.id), f.sig, f.id)
      .catch(() => false);
    if (!ok) {
      this.log(`link ${link.linkId}: bad proof, dropping`);
      this.transport.disconnect(link.linkId);
      return;
    }
    if (!this.links.has(link.linkId)) return; // went down meanwhile
    link.claimedId = f.id;
    link.authenticated = true;

    // If we already had a link to this node, the newest one wins.
    this.neighbours.set(f.id, link.linkId);
    this.table.addNeighbour(f.id, link.alias);
    this.log(`neighbour up ${short(f.id)}`);
    this.events.onTopologyChanged?.();

    await this.sendRoutes(f.id);
    this.scheduleTriggeredAdvert();
    await this.processCarry();
  }

  // ─── Routing ────────────────────────────────────────────────────────────────

  private async handleRoutes(fromId: string, entries: AdvertEntry[]) {
    if (!Array.isArray(entries)) return;
    const verified: AdvertEntry[] = [];
    for (const e of entries.slice(0, this.cfg.maxRoutes)) {
      if (await this.verifyOrigin(e)) verified.push(e);
    }
    const changed = this.table.applyAdvert(fromId, verified);
    if (changed) {
      this.events.onTopologyChanged?.();
      this.scheduleTriggeredAdvert();
      await this.processCarry();
    }
  }

  /**
   * Only the destination itself can originate (sequence number, alias) for
   * its own entry. Verified results are cached: each origination is checked
   * once, not once per advert.
   */
  private async verifyOrigin(e: AdvertEntry): Promise<boolean> {
    if (!e || typeof e.d !== 'string' || typeof e.s !== 'number' || typeof e.g !== 'string') {
      return false;
    }
    if (e.a !== undefined && (typeof e.a !== 'string' || e.a.length > 32)) return false;
    const key = `${e.d}|${evenSeq(e.s)}|${e.a ?? ''}|${e.g}`;
    if (this.verifiedOrigins.has(key)) return true;
    const ok = await this.crypto
      .verifyText(routeOriginText(e.d, e.s, e.a), e.g, e.d)
      .catch(() => false);
    if (ok) {
      if (this.verifiedOrigins.size > 4096) this.verifiedOrigins.clear();
      this.verifiedOrigins.add(key);
    }
    return ok;
  }

  private async ownSignature(): Promise<string> {
    const seq = this.table.ownSeqNumber;
    if (!this.ownSig || this.ownSig.seq !== seq || this.ownSig.alias !== this.alias) {
      const sig = await this.crypto.signText(routeOriginText(this.selfId, seq, this.alias));
      this.ownSig = {seq, alias: this.alias, sig};
    }
    return this.ownSig.sig;
  }

  private async sendRoutes(nodeId: string) {
    const linkId = this.neighbours.get(nodeId);
    if (!linkId) return;
    const sig = await this.ownSignature();
    const r = this.table.buildAdvert(nodeId, {alias: this.alias, sig}).slice(0, this.cfg.maxRoutes);
    await this.sendFrame(linkId, {t: 'ROUTES', r});
  }

  private async advertiseAll() {
    await Promise.all([...this.neighbours.keys()].map(id => this.sendRoutes(id)));
  }

  private scheduleTriggeredAdvert() {
    this.triggeredPending = true;
    this.flushTriggered();
  }

  private flushTriggered() {
    if (!this.triggeredPending) return;
    const t = this.now();
    if (t - this.lastTriggeredAt < this.cfg.triggeredAdvertGapMs) return;
    this.triggeredPending = false;
    this.lastTriggeredAt = t;
    void this.advertiseAll();
  }

  // ─── Periodic work ──────────────────────────────────────────────────────────

  /** Call every few seconds. */
  async tick(): Promise<void> {
    const t = this.now();
    if (t >= this.nextAdvertAt) {
      this.nextAdvertAt = t + this.cfg.advertIntervalMs;
      this.table.nextOwnSeq();
      this.triggeredPending = false;
      this.lastTriggeredAt = t;
      await this.advertiseAll();
    } else {
      this.flushTriggered();
    }
    if (this.table.expire()) {
      this.events.onTopologyChanged?.();
      this.scheduleTriggeredAdvert();
    }
    await this.processCarry();
  }

  // ─── Sending ────────────────────────────────────────────────────────────────

  /**
   * Encrypt, sign and send a message from us. It is kept until ACKed (or it
   * expires), and retransmitted with backoff, so the caller only needs to
   * listen for onSent / onAck.
   */
  async send(params: {
    recipientId: string;
    content: MessageContent;
    id?: string;
  }): Promise<MeshMessage> {
    const message = await this.crypto.buildMessage({
      id: params.id,
      recipientId: params.recipientId,
      content: params.content,
      type: 'MSG',
      ttl: this.cfg.defaultTtl,
    });
    message.routing.copies = this.cfg.sprayCopies;
    message.routing.attempt = 0;
    this.store.markSeen(seenKey(message));
    const rec: CarryRecord = {message, own: true, lastAttemptAt: 0, sprayedTo: []};
    this.putCarry(rec);
    await this.tryForward(rec);
    return message;
  }

  /** Stop trying to deliver one of our own messages. */
  cancel(messageId: string): void {
    if (this.carry.get(messageId)?.own) this.removeCarry(messageId);
  }

  /** Re-queue one of our earlier messages (e.g. after restart). */
  adoptOwnMessage(message: MeshMessage) {
    if (this.carry.has(message.id)) return;
    this.putCarry({message, own: true, lastAttemptAt: 0, sprayedTo: []});
  }

  // ─── Receiving ──────────────────────────────────────────────────────────────

  private async handleMessage(fromId: string, m: MeshMessage) {
    if (!isWellFormed(m)) return;
    const key = seenKey(m);
    if (this.store.hasSeen(key)) return;
    this.store.markSeen(key);

    if (this.now() > m.routing.expiresAt) return;
    if (!(await this.crypto.verifyMessage(m).catch(() => false))) {
      this.log(`rejecting forged message ${m.id}`);
      return;
    }

    if (m.recipient.id === this.selfId) {
      await this.deliverLocally(m);
      return;
    }

    if (m.routing.ttl <= 0) return;
    if (!this.allowRelay(m.sender.id)) return;

    const relayed: MeshMessage = {
      ...m,
      routing: {
        ...m.routing,
        ttl: m.routing.ttl - 1,
        hops: [...m.routing.hops, this.selfId],
      },
    };

    // A newer attempt replaces any older copy we were carrying.
    const rec: CarryRecord = {message: relayed, own: false, lastAttemptAt: 0, sprayedTo: [fromId]};
    const existing = this.carry.get(m.id);
    if (existing?.own) return; // our own message bounced back
    this.putCarry(rec);
    await this.tryForward(rec);
  }

  private async deliverLocally(m: MeshMessage) {
    const content = await this.crypto.openMessage(m).catch(() => null);
    if (!content) {
      this.log(`could not open ${m.id}`);
      return;
    }

    if (m.type === 'ACK') {
      const acked = content.ackedMessageId;
      if (!acked) return;
      const rec = this.carry.get(acked);
      if (rec?.own) this.removeCarry(acked);
      if (!this.delivered.has(`ack:${acked}`)) {
        this.delivered.add(`ack:${acked}`);
        this.events.onAck?.(acked, Array.isArray(content.path) ? content.path : []);
      }
      return;
    }

    if (m.type !== 'MSG') return;

    const deliveredKey = `d:${m.id}`;
    if (!this.delivered.has(deliveredKey) && !this.store.hasSeen(deliveredKey)) {
      this.delivered.add(deliveredKey);
      this.store.markSeen(deliveredKey);
      this.events.onDeliver?.(m, content);
    }

    // Always (re-)ACK: the sender retransmits because an earlier ACK was lost.
    try {
      const ack = await this.crypto.buildMessage({
        recipientId: m.sender.id,
        content: {ackedMessageId: m.id, path: m.routing.hops},
        type: 'ACK',
        ttl: this.cfg.defaultTtl,
      });
      ack.routing.copies = this.cfg.sprayCopies;
      ack.routing.attempt = 0;
      this.store.markSeen(seenKey(ack));
      const rec: CarryRecord = {message: ack, own: false, lastAttemptAt: 0, sprayedTo: []};
      this.putCarry(rec);
      await this.tryForward(rec);
    } catch (e) {
      this.log(`failed to build ACK: ${String(e)}`);
    }
  }

  private allowRelay(originId: string): boolean {
    const t = this.now();
    const r = this.rate.get(originId);
    if (!r || t > r.resetAt) {
      this.rate.set(originId, {count: 1, resetAt: t + 60_000});
      return true;
    }
    r.count += 1;
    return r.count <= this.cfg.relayRateLimitPerMin;
  }

  // ─── Forwarding ─────────────────────────────────────────────────────────────

  /**
   * Try to move a carried message closer to its recipient.
   * Removes it from the carry store once it has been fully handed off.
   */
  private async tryForward(rec: CarryRecord): Promise<void> {
    const m = rec.message;
    const t = this.now();

    if (t > m.routing.expiresAt) {
      this.removeCarry(m.id);
      if (rec.own) this.events.onExpired?.(m.id);
      return;
    }

    // Our own messages: after a hand-off, wait for the ACK before trying again.
    if (rec.own && rec.lastAttemptAt > 0) {
      const attempt = m.routing.attempt ?? 0;
      const gap = Math.min(this.cfg.ackTimeoutMs * 2 ** attempt, this.cfg.maxRetryGapMs);
      if (t - rec.lastAttemptAt < gap) return;
      // Retransmit as a new attempt so relays don't dedup it away.
      m.routing.attempt = attempt + 1;
      m.routing.copies = this.cfg.sprayCopies;
      rec.sprayedTo = [];
      rec.lastAttemptAt = 0;
      this.store.markSeen(seenKey(m));
    }

    const dest = m.recipient.id;
    const exclude = new Set<string>([m.sender.id, ...m.routing.hops]);

    // 1. Recipient is right here, or 2. we know the shortest path.
    let target: string | null = null;
    if (this.neighbours.has(dest)) {
      target = dest;
    } else {
      const nh = this.table.nextHopFor(dest);
      if (nh && this.neighbours.has(nh) && !exclude.has(nh)) target = nh;
    }

    if (target) {
      const ok = await this.sendMessageTo(target, m);
      if (ok) {
        this.handedOff(rec);
        return;
      }
    }

    // 3. No usable route: Spray-and-Wait. Give half our copies to each new
    //    neighbour while we hold more than one; with one copy, just wait.
    let copies = m.routing.copies ?? 1;
    if (copies > 1) {
      for (const nb of this.neighbours.keys()) {
        if (copies <= 1) break;
        if (exclude.has(nb) || rec.sprayedTo.includes(nb)) continue;
        const give = Math.floor(copies / 2);
        const ok = await this.sendMessageTo(nb, {
          ...m,
          routing: {...m.routing, copies: give},
        });
        rec.sprayedTo.push(nb);
        if (ok) {
          copies -= give;
          if (rec.own) this.events.onSent?.(m.id);
        }
      }
      m.routing.copies = copies;
      if (this.carry.has(m.id)) this.store.carryPut(rec);
    }
  }

  private handedOff(rec: CarryRecord) {
    if (rec.own) {
      const first = rec.lastAttemptAt === 0 && (rec.message.routing.attempt ?? 0) === 0;
      rec.lastAttemptAt = this.now();
      this.store.carryPut(rec);
      if (first) this.events.onSent?.(rec.message.id);
    } else {
      this.removeCarry(rec.message.id);
    }
  }

  private async processCarry() {
    if (this.processingCarry) {
      this.carryDirty = true;
      return;
    }
    this.processingCarry = true;
    try {
      do {
        this.carryDirty = false;
        for (const rec of [...this.carry.values()]) {
          if (this.carry.get(rec.message.id) !== rec) continue;
          await this.tryForward(rec);
        }
      } while (this.carryDirty);
    } finally {
      this.processingCarry = false;
    }
  }

  private async sendMessageTo(nodeId: string, m: MeshMessage): Promise<boolean> {
    const linkId = this.neighbours.get(nodeId);
    if (!linkId) return false;
    return this.sendFrame(linkId, {t: 'MSG', m});
  }

  private async sendFrame(linkId: string, frame: Frame): Promise<boolean> {
    try {
      await this.transport.send(linkId, JSON.stringify(frame));
      return true;
    } catch (e) {
      this.log(`send on ${linkId} failed: ${String(e)}`);
      return false;
    }
  }

  private putCarry(rec: CarryRecord) {
    this.carry.set(rec.message.id, rec);
    this.carrySizes.set(rec.message.id, JSON.stringify(rec.message).length);
    this.store.carryPut(rec);
    if (!rec.own) this.enforceCarryLimits(rec.message.id);
    this.events.onCarryChanged?.(this.carry.size);
  }

  private removeCarry(id: string) {
    this.carrySizes.delete(id);
    if (this.carry.delete(id)) {
      this.store.carryRemove(id);
      this.events.onCarryChanged?.(this.carry.size);
    }
  }

  /** Evict the oldest messages we hold for others when over budget. */
  private enforceCarryLimits(keepId: string) {
    let count = 0;
    let bytes = 0;
    for (const [id, r] of this.carry) {
      if (r.own) continue;
      count++;
      bytes += this.carrySizes.get(id) ?? 0;
    }
    for (const [id, r] of [...this.carry]) {
      if (count <= this.cfg.maxCarriedForOthers && bytes <= this.cfg.maxCarriedBytes) break;
      if (r.own || id === keepId) continue;
      bytes -= this.carrySizes.get(id) ?? 0;
      count--;
      this.removeCarry(id);
      this.log(`carry full: dropped ${id}`);
    }
  }

  private log(msg: string) {
    this.events.log?.(`[mesh ${short(this.selfId)}] ${msg}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function seenKey(m: MeshMessage): string {
  return `${m.id}:${m.routing.attempt ?? 0}`;
}

function short(id: string): string {
  return id.slice(0, 6);
}

function isWellFormed(m: any): m is MeshMessage {
  return (
    m &&
    typeof m.id === 'string' &&
    typeof m.type === 'string' &&
    typeof m.signature === 'string' &&
    m.sender && typeof m.sender.id === 'string' &&
    m.recipient && typeof m.recipient.id === 'string' &&
    m.payload && typeof m.payload.encrypted === 'string' &&
    m.routing &&
    typeof m.routing.ttl === 'number' &&
    Array.isArray(m.routing.hops) &&
    m.routing.hops.length <= 64 &&
    typeof m.routing.expiresAt === 'number'
  );
}
