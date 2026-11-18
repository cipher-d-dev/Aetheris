/**
 * routingTable.ts
 *
 * Shortest-path routing for the mesh, using a small distance-vector protocol
 * (the same family as DSDV / Babel, kept deliberately simple).
 *
 * How it works:
 *   - Every node periodically tells its direct neighbours "here is everyone I
 *     can reach, and how many hops away they are".
 *   - Each node originates an entry for itself with hops = 0 and a sequence
 *     number that only ever goes up (even numbers). Fresher sequence numbers
 *     always win, which is what prevents routing loops and stale routes.
 *   - When we hear a route from neighbour N, the cost through N is hops + 1.
 *     We keep it if it is fresher, or equally fresh and shorter.
 *   - When a neighbour disappears, every route through it is marked
 *     unreachable with an odd sequence number (seq + 1) so the bad news
 *     spreads instead of being overwritten by stale good news.
 *
 * Every node signs its own (sequence number, display name) pair. Relays pass
 * the signature along unchanged, so nobody can invent a fresher sequence
 * number for someone else (which would let them black-hole that node's
 * traffic) or spoof another node's display name. Signatures are checked by
 * MeshNode before an advert reaches this table.
 *
 * The result: for each destination we know the next hop on the shortest
 * currently-known path. Pure TypeScript, no React Native imports, so it can
 * be unit-tested and simulated.
 */

export const INFINITY_HOPS = 16;

export interface RouteEntry {
  /** Destination node ID */
  dest: string;
  /** Direct neighbour to forward to */
  nextHop: string;
  /** Hop count to destination (INFINITY_HOPS = unreachable) */
  hops: number;
  /** Destination-originated sequence number */
  seq: number;
  /** Display name the destination advertises for itself (signed by it) */
  alias?: string;
  /** Destination's signature over routeOriginText(dest, evenSeq(seq), alias) */
  sig?: string;
  /** Local time this entry was last refreshed */
  updatedAt: number;
}

/** One line of a routing advertisement on the wire. */
export interface AdvertEntry {
  d: string; // dest
  h: number; // hops
  s: number; // seq
  a?: string; // alias
  g?: string; // destination's signature over (d, even seq, a)
}

/** Odd sequence numbers mean "broken"; they derive from the even one before. */
export function evenSeq(seq: number): number {
  return seq - (seq % 2);
}

/** The text a node signs to originate its routing entry. */
export function routeOriginText(dest: string, seq: number, alias?: string): string {
  return `aetheris-route-v1|${dest}|${evenSeq(seq)}|${alias ?? ''}`;
}

export class RoutingTable {
  private routes = new Map<string, RouteEntry>();
  private ownSeq: number;

  constructor(
    private readonly selfId: string,
    private readonly now: () => number = Date.now,
    /** Routes not refreshed within this window are dropped */
    private readonly routeTimeoutMs = 60_000,
  ) {
    // Start from the clock so a restarted node doesn't reuse old numbers.
    // Must be even: even = originated by the destination, odd = "broken".
    const t = Math.floor(now() / 1000) * 2;
    this.ownSeq = t;
  }

  get ownSeqNumber(): number {
    return this.ownSeq;
  }

  /** Bump our own sequence number; called before each periodic advert. */
  nextOwnSeq(): number {
    this.ownSeq += 2;
    return this.ownSeq;
  }

  /** A neighbour link came up (authenticated): it is 1 hop away. */
  addNeighbour(id: string, alias?: string): boolean {
    const existing = this.routes.get(id);
    const t = this.now();
    if (existing && existing.hops === 1 && existing.nextHop === id) {
      existing.updatedAt = t;
      if (alias) existing.alias = alias;
      return false;
    }
    this.routes.set(id, {
      dest: id,
      nextHop: id,
      hops: 1,
      // Keep the freshest seq we know of; the neighbour's next advert will
      // refresh it. Using an odd seq would be wrong (it means "broken").
      seq: existing ? existing.seq : 0,
      alias: existing?.alias ?? alias,
      sig: existing?.sig,
      updatedAt: t,
    });
    return true;
  }

  /**
   * A neighbour link went down. Every route through it becomes unreachable.
   * Returns true if anything changed (caller should send a triggered update).
   */
  removeNeighbour(id: string): boolean {
    let changed = false;
    for (const r of this.routes.values()) {
      if (r.nextHop === id && r.hops < INFINITY_HOPS) {
        r.hops = INFINITY_HOPS;
        // Odd seq = "broken link", beats the even seq it replaces but loses to
        // the next even seq the destination originates.
        r.seq = r.seq % 2 === 0 ? r.seq + 1 : r.seq;
        r.updatedAt = this.now();
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Apply an advertisement received from direct neighbour `from`.
   * Returns true if the table changed.
   */
  applyAdvert(from: string, entries: AdvertEntry[]): boolean {
    let changed = false;
    const t = this.now();

    for (const e of entries) {
      if (!e || typeof e.d !== 'string' || e.d === this.selfId) continue;
      if (typeof e.h !== 'number' || typeof e.s !== 'number') continue;

      const hops = Math.min(INFINITY_HOPS, Math.max(0, e.h) + 1);
      const current = this.routes.get(e.d);

      // The neighbour's own entry: it is always 1 hop away while linked.
      if (e.d === from) {
        if (!current || current.nextHop !== from || current.hops !== 1 || current.seq < e.s) {
          changed = true;
        }
        const newer = !current || e.s >= current.seq;
        this.routes.set(from, {
          dest: from,
          nextHop: from,
          hops: 1,
          seq: newer ? e.s : current!.seq,
          alias: newer ? e.a : current!.alias,
          sig: newer ? e.g : current!.sig,
          updatedAt: t,
        });
        continue;
      }

      if (!current) {
        if (hops >= INFINITY_HOPS) continue; // don't learn dead routes
        this.routes.set(e.d, {dest: e.d, nextHop: from, hops, seq: e.s, alias: e.a, sig: e.g, updatedAt: t});
        changed = true;
        continue;
      }

      const fresher = e.s > current.seq;
      const sameSeqShorter = e.s === current.seq && hops < current.hops;
      const fromCurrentNextHop = current.nextHop === from && e.s >= current.seq;

      if (fresher || sameSeqShorter || fromCurrentNextHop) {
        const differs =
          current.nextHop !== from || current.hops !== hops || current.seq !== e.s;
        current.nextHop = from;
        current.hops = hops;
        current.seq = e.s;
        current.alias = e.a;
        current.sig = e.g;
        current.updatedAt = t;
        if (differs) changed = true;
      } else if (current.nextHop === from) {
        current.updatedAt = t;
      }
    }
    return changed;
  }

  /** Drop entries that have not been refreshed. Returns true if changed. */
  expire(): boolean {
    const t = this.now();
    let changed = false;
    for (const [id, r] of this.routes) {
      if (t - r.updatedAt > this.routeTimeoutMs) {
        if (r.hops < INFINITY_HOPS) {
          r.hops = INFINITY_HOPS;
          r.seq = r.seq % 2 === 0 ? r.seq + 1 : r.seq;
          r.updatedAt = t;
          changed = true;
        } else {
          this.routes.delete(id);
        }
      }
    }
    return changed;
  }

  /**
   * Build the advertisement to send to `neighbour`.
   * Split horizon with poisoned reverse: routes learned through that
   * neighbour are advertised back to it as unreachable.
   */
  buildAdvert(neighbour: string, self: {alias?: string; sig?: string} = {}): AdvertEntry[] {
    const own: AdvertEntry = {d: this.selfId, h: 0, s: this.ownSeq};
    if (self.alias) own.a = self.alias;
    if (self.sig) own.g = self.sig;
    const out: AdvertEntry[] = [own];
    for (const r of this.routes.values()) {
      if (r.dest === neighbour || !r.sig) continue; // unsigned entries can't be checked
      const poisoned = r.nextHop === neighbour;
      const entry: AdvertEntry = {d: r.dest, h: poisoned ? INFINITY_HOPS : r.hops, s: r.seq, g: r.sig};
      if (r.alias) entry.a = r.alias;
      out.push(entry);
    }
    return out;
  }

  /** Next hop toward `dest`, or null if unreachable. */
  nextHopFor(dest: string): string | null {
    const r = this.routes.get(dest);
    if (!r || r.hops >= INFINITY_HOPS) return null;
    return r.nextHop;
  }

  get(dest: string): RouteEntry | undefined {
    return this.routes.get(dest);
  }

  /** All reachable destinations, closest first. */
  reachable(): RouteEntry[] {
    return [...this.routes.values()]
      .filter(r => r.hops < INFINITY_HOPS)
      .sort((a, b) => a.hops - b.hops || a.dest.localeCompare(b.dest));
  }
}
