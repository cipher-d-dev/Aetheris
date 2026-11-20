/**
 * meshService.ts
 *
 * Glue between the radio (Kotlin / Nearby Connections), the mesh brain
 * (src/mesh/meshNode.ts), SQLite and the UI.
 *
 *   radio link up / frame / link down ──▶ MeshNode ──▶ deliver / ack / sent
 *                                                         │
 *                                     SQLite + messagesStore ◀┘
 */
import {create} from 'zustand';
import {AppState, EmitterSubscription} from 'react-native';
import {useDraftsStore} from './draftsStore';
import {AetherisBridge} from '../native/AetherisBridge';
import {MeshConfig, MeshNode} from '../mesh/meshNode';
import {createRnCrypto} from '../mesh/rnCrypto';
import {loadPrivateKey} from '../crypto/identity';
import {
  dbGetGroup,
  dbGetMessageConversation,
  dbGetMessageStatus,
  dbGetSetting,
  dbGroupParent,
  dbExpireGroupCopy,
  dbInsertMessage,
  dbMarkGroupDelivered,
  dbMeshStore,
  dbSetSetting,
  dbUpdateMessageStatus,
  dbUpsertGroup,
  dbUpsertPeer,
  dbAddGroupDelivery,
  dbDeleteMessage,
  dbDeleteConversation,
  dbGetMessage,
  dbFindByRef,
  dbRefUsedByOther,
  dbSetReaction,
} from '../db/database';
import {
  displayName,
  GROUP_PREFIX,
  groupIdOf,
  isGroupConversation,
  useMessagesStore,
} from './messagesStore';
import {ContentKind, GroupInfo, MediaAttachment, MessageContent, MeshMessage, ReplyRef} from '../types/message';
import {REACTIONS} from '../ui/reactions';
import {replySnippet} from '../ui/reply';
import {uuid} from '../utils/uuid';
import {logEvent} from '../utils/logBuffer';
import {
  checkRadioPermissions,
  RadioPermissionState,
  requestRadioPermissions,
} from '../native/permissions';

// ─── Power profiles (battery tuning) ──────────────────────────────────────────
//
// Discovery scanning is the main battery cost. Once we have neighbours we
// mostly need to notice *new* phones, so we scan in short bursts. Advertising
// stays on so others can always find us. Routing adverts slow down too.

export type PowerMode = 'performance' | 'balanced' | 'saver';

interface PowerProfile {
  label: string;
  description: string;
  tickMs: number;
  /** [scanOnMs, restMs] when we have no neighbours. [0,0] = continuous. */
  dutyAlone: [number, number];
  /** [scanOnMs, restMs] when we have at least one neighbour. */
  dutyLinked: [number, number];
  mesh: Partial<MeshConfig>;
}

export const POWER_PROFILES: Record<PowerMode, PowerProfile> = {
  performance: {
    label: 'Performance',
    description: 'Scan non-stop. Fastest to find people, uses the most battery.',
    tickMs: 2_000,
    dutyAlone: [0, 0],
    dutyLinked: [0, 0],
    mesh: {advertIntervalMs: 10_000},
  },
  balanced: {
    label: 'Balanced',
    description: 'Scan non-stop when alone, in bursts once connected.',
    tickMs: 3_000,
    dutyAlone: [0, 0],
    dutyLinked: [10_000, 30_000],
    mesh: {advertIntervalMs: 15_000},
  },
  saver: {
    label: 'Battery saver',
    description: 'Short scans every minute. Slower to find people.',
    tickMs: 5_000,
    dutyAlone: [10_000, 30_000],
    dutyLinked: [5_000, 55_000],
    mesh: {advertIntervalMs: 30_000},
  },
};

// Same everywhere so phones in different modes still agree on route lifetime.
const ROUTE_TIMEOUT_MS = 100_000;

/** Largest attachment we'll send (base64 chars). Every relay has to carry it. */
export const MAX_MEDIA_BASE64 = 400_000;

// ─── State ────────────────────────────────────────────────────────────────────

export interface MeshPeer {
  id: string;
  alias?: string;
}

export interface MeshRoute extends MeshPeer {
  hops: number;
  nextHop: string;
}

export type MeshStatus = 'stopped' | 'starting' | 'running' | 'error';

/** Strict check of a replyTo from another phone. Anything malformed is dropped. */
function parseReplyTo(r: unknown): ReplyRef | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const {id, senderId, snippet} = r as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;
  if (!ok(id) || !ok(senderId) || typeof snippet !== 'string') return undefined;
  return {id, senderId, snippet: snippet.slice(0, 100)};
}

/** Shared id of a group message on every phone: the verified sender plus its groupMessageId. */
export const groupRef = (senderId: string, groupMessageId: string) => `${senderId}:${groupMessageId}`;

/** Strict check of a reaction from another phone: a known emoji, or '' to remove. */
function parseReaction(r: unknown): {messageId: string; emoji: string} | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const {messageId, emoji} = r as Record<string, unknown>;
  if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 128) return undefined;
  if (typeof emoji !== 'string' || (emoji !== '' && !(REACTIONS as readonly string[]).includes(emoji))) return undefined;
  return {messageId, emoji};
}

export interface OutgoingContent {
  kind: ContentKind;
  text?: string;
  media?: MediaAttachment;
  replyTo?: ReplyRef;
}

interface MeshState {
  status: MeshStatus;
  error?: string;
  /** Radio error code (e.g. ADVERTISE_FAILED) when error came from the radio */
  errorCode?: string;
  selfId?: string;
  alias: string;
  powerMode: PowerMode;
  neighbours: MeshPeer[];
  routes: MeshRoute[];
  /** Aetheris phones seen by the radio (linked or not) */
  nearbyCount: number;
  /** Messages this phone is holding for others (or for later) */
  carrying: number;
  /** Messages carried for other people (not our own, not ACKs) */
  carryingForOthers: number;
  permission: RadioPermissionState | 'unknown';
  bluetoothOn: boolean;

  /** Ask for radio permissions (if needed) and start the mesh. */
  bootstrap: (selfId: string) => Promise<void>;
  start: (selfId: string) => Promise<void>;
  stop: () => Promise<void>;
  setAlias: (alias: string) => void;
  setPowerMode: (mode: PowerMode) => void;
  sendToConversation: (conversationId: string, content: OutgoingContent) => Promise<string>;
  /** React to a message (by its refId) with one of REACTIONS, or '' to remove ours. */
  sendReaction: (conversationId: string, messageRef: string, emoji: string) => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => string;
  /** Delete on this phone; also stops delivery if it hasn't arrived yet. */
  deleteMessage: (messageId: string) => void;
  deleteConversation: (conversationId: string) => void;
  /** Send a failed message again as a new message. */
  retryMessage: (messageId: string) => Promise<void>;
}

let node: MeshNode | null = null;
let subs: EmitterSubscription[] = [];
const nearbyEndpoints = new Set<string>();
let lastLinked = -1;

export const useMeshService = create<MeshState>((set, get) => {
  const refreshTopology = () => {
    if (!node) return;
    const neighbours = node.getNeighbours().map(n => ({id: n.id, alias: n.alias}));
    const routes = node.table.reachable().map(r => ({
      id: r.dest,
      alias: r.alias,
      hops: r.hops,
      nextHop: r.nextHop,
    }));
    for (const r of routes) {
      try {
        dbUpsertPeer(r.id, r.alias);
      } catch {}
    }
    set({neighbours, routes, carrying: node.carryCount(), carryingForOthers: node.carryForOthersCount(), nearbyCount: nearbyEndpoints.size});
    applyDutyCycle(false);
  };

  const applyDutyCycle = (force: boolean) => {
    const linked = node ? node.getNeighbours().length : 0;
    const bucket = linked > 0 ? 1 : 0;
    if (!force && bucket === lastLinked) return;
    lastLinked = bucket;
    const p = POWER_PROFILES[get().powerMode];
    const [on, off] = linked > 0 ? p.dutyLinked : p.dutyAlone;
    AetherisBridge.setDiscoveryDutyCycle(on, off).catch(() => undefined);
  };

  // ─── Mesh events → DB/UI ────────────────────────────────────────────────

  const onDeliver = (m: MeshMessage, content: MessageContent) => {
    const self = get().selfId!;
    const senderId = m.sender.id;
    logEvent(`delivered ${m.id.slice(0, 8)} from ${senderId.slice(0, 6)} after ${m.routing.hops.length + 1} hop(s)`);
    const alias = typeof content.alias === 'string' ? content.alias.slice(0, 32) : undefined;
    dbUpsertPeer(senderId, alias);

    let conversationId = senderId;
    let isGroupMessage = false;
    const g = content.group;
    if (
      g &&
      typeof g.id === 'string' &&
      typeof g.name === 'string' &&
      Array.isArray(g.members) &&
      g.members.includes(senderId) &&
      g.members.includes(self)
    ) {
      const group: GroupInfo = {
        id: g.id.slice(0, 64),
        name: g.name.slice(0, 64),
        members: g.members.filter(x => typeof x === 'string').slice(0, 64),
      };
      dbUpsertGroup(group);
      conversationId = GROUP_PREFIX + group.id;
      isGroupMessage = true;
    }

    if (content.reaction !== undefined) {
      // A reaction is not a message: no row, unread count, notification or preview.
      const reaction = parseReaction(content.reaction);
      if (!reaction) return;
      dbSetReaction(conversationId, reaction.messageId, senderId, reaction.emoji, Math.min(m.routing.originTimestamp, Date.now()));
      useMessagesStore.getState().loadReactions(conversationId);
      return;
      const id = g.id.slice(0, 64);
      const known = dbGetGroup(id);
      if (known) {
        // Groups don't change after they are created, so a message can't rename
        // one or change its members, and only a stored member can post to it.
        if (!known.members.includes(senderId)) {
          logEvent(`dropped ${m.id.slice(0, 8)}: ${senderId.slice(0, 6)} is not in group ${id.slice(0, 8)}`);
          return;
        }
      } else {
        dbUpsertGroup({
          id,
          name: g.name.slice(0, 64),
          members: g.members.filter(x => typeof x === 'string').slice(0, 64),
        });
      }
      conversationId = GROUP_PREFIX + id;
    }

    const kind: ContentKind =
      content.kind === 'image' || content.kind === 'audio' ? content.kind : 'text';
    const media =
      kind !== 'text' &&
      content.media &&
      typeof content.media.data === 'string' &&
      content.media.data.length <= MAX_MEDIA_BASE64 * 1.1
        ? content.media
        : undefined;
    if (kind !== 'text' && !media) return; // malformed attachment

    const store = useMessagesStore.getState();
    const visible = store.activeConversation === conversationId && AppState.currentState === 'active';

    const text = typeof content.text === 'string' ? content.text.slice(0, 4000) : '';
    // Only group messages carry a shared ref. It is scoped to the verified
    // sender, so no other phone can claim it, even by racing the original.
    let refId = m.id;
    if (isGroupMessage && typeof content.groupMessageId === 'string') {
      const claimed = groupRef(senderId, content.groupMessageId.slice(0, 64));
      if (!dbRefUsedByOther(conversationId, claimed, senderId)) refId = claimed;
    }

    dbInsertMessage({
      id: m.id,
      refId,
      conversationId,
      senderId,
      recipientId: self,
      senderAlias: alias,
      kind,
      text,
      media,
      replyTo: parseReplyTo(content.replyTo),
      status: 'delivered',
      isOutbound: false,
      route: m.routing.hops,
      createdAt: Math.min(m.routing.originTimestamp, Date.now()),
      receivedAt: Date.now(),
      expiresAt: m.routing.expiresAt,
      read: visible,
    });
    store.refresh(conversationId);

    if (!visible) {
      const who = displayName(senderId, alias);
      const title = isGroupConversation(conversationId)
        ? `${who} · ${dbGetGroup(groupIdOf(conversationId))?.name ?? 'Group'}`
        : who;
      const body = kind === 'image' ? '📷 Photo' : kind === 'audio' ? '🎤 Voice message' : text;
      AetherisBridge.showMessageNotification(conversationId, title, body).catch(() => undefined);
    }
  };

  const setStatusFor = (messageId: string, status: 'sent' | 'delivered' | 'failed', route?: string[]) => {
    const current = dbGetMessageStatus(messageId);
    if (!current) return;
    if (current === 'delivered') return;
    if (status === 'sent' && current !== 'pending') return;
    dbUpdateMessageStatus(messageId, status, route);
    useMessagesStore.getState().refresh(dbGetMessageConversation(messageId) ?? undefined);
  };

  const onAck = (id: string, path: string[]) => {
    logEvent(`ack for ${id.slice(0, 8)} via ${path.length} relay(s)`);
    const parent = dbGroupParent(id);
    if (parent) {
      const {delivered, total} = dbMarkGroupDelivered(id);
      if (delivered >= total) setStatusFor(parent, 'delivered');
      else {
        setStatusFor(parent, 'sent');
        useMessagesStore.getState().refresh(dbGetMessageConversation(parent) ?? undefined);
      }
      return;
    }
    setStatusFor(id, 'delivered', path);
  };

  const onSent = (id: string) => setStatusFor(dbGroupParent(id) ?? id, 'sent');

  const onExpired = (id: string) => {
    const {parent, failed} = dbExpireGroupCopy(id);
    if (!parent) setStatusFor(id, 'failed');
    else if (failed) setStatusFor(parent, 'failed');
  };

  /** Who a send to this conversation goes to. Throws if it can't be sent. */
  const resolveTargets = (conversationId: string, self: string) => {
    const isGroup = isGroupConversation(conversationId);
    const group = isGroup ? dbGetGroup(groupIdOf(conversationId)) : null;
    if (isGroup && !group) throw new Error('Unknown group');
    const recipients = group ? group.members.filter(mId => mId !== self) : [conversationId];
    if (recipients.length === 0) throw new Error('Nobody to send to');
    if (!group && conversationId === self) throw new Error("You can't message yourself");
    return {group, recipients};
  };

  return {
    status: 'stopped',
    alias: '',
    powerMode: 'balanced',
    neighbours: [],
    routes: [],
    nearbyCount: 0,
    carrying: 0,
    carryingForOthers: 0,
    permission: 'unknown',
    bluetoothOn: true,

    bootstrap: async (selfId: string) => {
      let permission = await checkRadioPermissions().catch(() => 'denied' as const);
      if (permission !== 'granted') {
        permission = await requestRadioPermissions().catch(() => 'denied' as const);
      }
      const bluetoothOn = await AetherisBridge.isBluetoothEnabled().catch(() => true);
      set({permission, bluetoothOn});
      if (permission === 'granted') await get().start(selfId);
    },

    start: async (selfId: string) => {
      if (node && get().status === 'running') return;
      set({status: 'starting', error: undefined, errorCode: undefined, selfId});
      try {
        const alias = dbGetSetting('alias') ?? '';
        const powerMode = (dbGetSetting('powerMode') as PowerMode) || 'balanced';
        set({alias, powerMode});
        const profile = POWER_PROFILES[powerMode] ?? POWER_PROFILES.balanced;

        const privateKey = await loadPrivateKey();
        node = new MeshNode(
          selfId,
          {
            send: (linkId, data) => AetherisBridge.sendFrame(linkId, data),
            disconnect: linkId => void AetherisBridge.disconnect(linkId).catch(() => undefined),
          },
          createRnCrypto(selfId, privateKey),
          dbMeshStore,
          {
            onDeliver,
            onAck,
            onSent,
            onExpired,
            onTopologyChanged: refreshTopology,
            onCarryChanged: count => {
              const others = node?.carryForOthersCount() ?? 0;
              if (get().carrying !== count || get().carryingForOthers !== others) {
                set({carrying: count, carryingForOthers: others});
              }
            },
            log: msg => {
              logEvent(msg);
              if (__DEV__) console.log(msg);
            },
          },
          {...profile.mesh, routeTimeoutMs: ROUTE_TIMEOUT_MS},
        );
        node.alias = alias || undefined;

        subs.forEach(s => s.remove());
        subs = [
          AetherisBridge.onPeerFound(e => {
            nearbyEndpoints.add(e.endpointId);
            set({nearbyCount: nearbyEndpoints.size});
          }),
          AetherisBridge.onPeerLost(e => {
            nearbyEndpoints.delete(e.endpointId);
            set({nearbyCount: nearbyEndpoints.size});
          }),
          AetherisBridge.onLinkUp(e => {
            logEvent(`radio: link ${e.linkId} up (${e.nodeId.slice(0, 6)})`);
            if (get().error) set({error: undefined, errorCode: undefined});
            void node?.onLinkUp(e.linkId);
          }),
          AetherisBridge.onLinkDown(e => {
            logEvent(`radio: link ${e.linkId} down`);
            node?.onLinkDown(e.linkId);
          }),
          AetherisBridge.onFrame(e => void node?.onFrame(e.linkId, e.data)),
          AetherisBridge.onTick(() => {
            if (!node) return;
            node.tick().then(() => set({carrying: node?.carryCount() ?? 0, carryingForOthers: node?.carryForOthersCount() ?? 0}));
          }),
          AetherisBridge.onRadioError(e => {
            logEvent(`radio error ${e.code}: ${e.message}`);
            set({error: e.message, errorCode: e.code});
          }),
        ];

        await AetherisBridge.start(selfId);
        await AetherisBridge.setTickInterval(profile.tickMs);
        lastLinked = -1;
        applyDutyCycle(true);
        set({status: 'running', carrying: node.carryCount(), carryingForOthers: node.carryForOthersCount()});
        logEvent(`mesh started as ${selfId.slice(0, 6)} (${powerMode})`);
      } catch (e: any) {
        logEvent(`start failed: ${e?.message ?? e}`);
        set({status: 'error', error: e?.message ?? String(e), errorCode: undefined});
      }
    },

    stop: async () => {
      subs.forEach(s => s.remove());
      subs = [];
      nearbyEndpoints.clear();
      node = null;
      await AetherisBridge.stop().catch(() => undefined);
      set({status: 'stopped', neighbours: [], routes: [], nearbyCount: 0});
    },

    setAlias: (alias: string) => {
      const clean = alias.trim().slice(0, 32);
      dbSetSetting('alias', clean);
      set({alias: clean});
      if (node) node.alias = clean || undefined;
    },

    setPowerMode: (mode: PowerMode) => {
      dbSetSetting('powerMode', mode);
      set({powerMode: mode});
      const p = POWER_PROFILES[mode];
      node?.setConfig(p.mesh);
      if (get().status === 'running') {
        AetherisBridge.setTickInterval(p.tickMs).catch(() => undefined);
        applyDutyCycle(true);
      }
    },

    sendToConversation: async (conversationId, content) => {
      const self = get().selfId;
      if (!node || !self) throw new Error('Mesh is not running yet');
      if (content.media && content.media.data.length > MAX_MEDIA_BASE64) {
        throw new Error('Attachment is too large for the mesh');
      }
      const id = uuid();
      const alias = get().alias || undefined;
      const base: MessageContent = {
        kind: content.kind,
        ...(content.text ? {text: content.text} : {}),
        ...(content.media ? {media: content.media} : {}),
        ...(content.replyTo ? {replyTo: content.replyTo} : {}),
        ...(alias ? {alias} : {}),
      };

      const {group, recipients} = resolveTargets(conversationId, self);

      dbInsertMessage({
        id,
        // Groups: every member stores the same sender-scoped ref (see groupRef).
        refId: group ? groupRef(self, id) : id,
        conversationId,
        senderId: self,
        recipientId: group ? conversationId : conversationId,
        kind: content.kind,
        text: content.text ?? '',
        media: content.media,
        replyTo: content.replyTo,
        status: 'pending',
        isOutbound: true,
        createdAt: Date.now(),
      });
      useMessagesStore.getState().refresh(conversationId);

      try {
        if (group) {
          for (const member of recipients) {
            const subId = uuid();
            dbAddGroupDelivery(subId, id, member);
            await node.send({
              id: subId,
              recipientId: member,
              content: {...base, group, groupMessageId: id},
            });
          }
        } else {
          await node.send({id, recipientId: conversationId, content: base});
        }
      } catch (e) {
        dbUpdateMessageStatus(id, 'failed');
        useMessagesStore.getState().refresh(conversationId);
        throw e;
      }
      set({carrying: node.carryCount(), carryingForOthers: node.carryForOthersCount()});
      return id;
    },

    sendReaction: async (conversationId, messageRef, emoji) => {
      const self = get().selfId;
      if (!node || !self) throw new Error('Mesh is not running yet');
      if (emoji !== '' && !(REACTIONS as readonly string[]).includes(emoji)) throw new Error('Unknown reaction');
      const {group, recipients} = resolveTargets(conversationId, self);
      const target = dbFindByRef(conversationId, messageRef);
      const snippet = target ? replySnippet(target).slice(0, 40) : '';
      const alias = get().alias || undefined;
      const base: MessageContent = {
        kind: 'text',
        reaction: {messageId: messageRef, emoji},
        // For old app versions, which would otherwise show an empty bubble.
        text: emoji ? `Reacted ${emoji} to "${snippet}"` : 'Removed a reaction',
        ...(alias ? {alias} : {}),
        ...(group ? {group} : {}),
      };
      // Group copies get their own ids but no group_deliveries rows and no messages
      // row: nothing to tick, and the ACKs/expiry of these ids find nothing to update.
      for (const member of recipients) {
        await node.send({id: uuid(), recipientId: member, content: base});
      }
      dbSetReaction(conversationId, messageRef, self, emoji, Date.now());
      useMessagesStore.getState().loadReactions(conversationId);
      set({carrying: node.carryCount(), carryingForOthers: node.carryForOthersCount()});
    },

    deleteMessage: (messageId: string) => {
      const conversationId = dbGetMessageConversation(messageId);
      const subs = dbDeleteMessage(messageId);
      for (const id of [messageId, ...subs]) node?.cancel(id);
      set({carrying: node?.carryCount() ?? 0, carryingForOthers: node?.carryForOthersCount() ?? 0});
      useMessagesStore.getState().refresh(conversationId ?? undefined);
    },

    deleteConversation: (conversationId: string) => {
      try {
        for (const id of dbDeleteConversation(conversationId)) node?.cancel(id);
      } catch (e) {
        console.warn('[meshService] deleteConversation failed', e);
      }
      set({carrying: node?.carryCount() ?? 0, carryingForOthers: node?.carryForOthersCount() ?? 0});
      useMessagesStore.getState().dropConversation(conversationId);
      useDraftsStore.getState().clearDraft(conversationId);
      useDraftsStore.getState().setReply(conversationId, null);
    },

    retryMessage: async (messageId: string) => {
      const m = dbGetMessage(messageId);
      if (!m || !m.isOutbound) return;
      // Queue the new copy first: if sending throws (mesh not running), the
      // failed message stays so nothing is lost.
      await get().sendToConversation(m.conversationId, {
        kind: m.kind,
        text: m.text || undefined,
        media: m.media,
        replyTo: m.replyTo,
      });
      get().deleteMessage(messageId);
    },

    createGroup: (name: string, memberIds: string[]) => {
      const self = get().selfId;
      if (!self) throw new Error('Identity not ready');
      const members = Array.from(new Set([self, ...memberIds]));
      const group: GroupInfo = {id: uuid(), name: name.trim().slice(0, 64) || 'Group', members};
      dbUpsertGroup(group);
      return GROUP_PREFIX + group.id;
    },
  };
});
