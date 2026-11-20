/**
 * Service-level test: the real meshService + real SQL (sql.js) + real crypto
 * (libsodium), talking over a fake radio to a second phone that runs a bare
 * MeshNode. Covers the paths the UI relies on: delivery status, incoming
 * messages landing in conversations, aliases, and group fan-out.
 */
import {beforeAll, describe, expect, it, jest} from '@jest/globals';

const mockState: {db: any; sk: string} = {db: null, sk: ''};

jest.mock('react-native-sodium', () => require('../../mesh/testing/sodiumShim').default);
jest.mock('react-native-quick-sqlite', () => ({
  open: () => ({
    execute: (sql: string, params: any[] = []) => {
      const stmt = mockState.db.prepare(sql);
      stmt.bind(params.map((p: any) => (p === undefined ? null : p)));
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return {rows: {_array: rows}};
    },
  }),
}));
jest.mock('../../crypto/identity', () => ({
  loadPrivateKey: () => Promise.resolve(mockState.sk),
}));

import initSqlJs from 'sql.js';
import sodium from 'react-native-sodium';
import {Buffer} from 'buffer';
import {AetherisBridge} from '../../native/AetherisBridge';
import {initDatabase, dbDeleteMessage, dbPruneOrphanReactions, dbFindByRef, dbReactionsFor, dbSetReaction, dbGroupDeliveries, dbGetConversation, dbGetGroup, dbListConversations} from '../../db/database';
import {groupRef, useMeshService} from '../meshService';
import {useAvatarStore} from '../avatarStore';
import {displayName, useMessagesStore} from '../messagesStore';
import {
  dbAddGroupDelivery,
  dbExpireGroupCopy,
  dbExpireOverdueOutbound,
  dbGetMessageStatus,
  dbGetPeer,
  dbInsertMessage,
  dbMarkGroupDelivered,
  dbSetNickname,
  dbUpdateMessageStatus,
} from '../../db/database';
import {MESSAGE_TTL_MS} from '../../crypto/messageBuilder';
import {MeshNode} from '../../mesh/meshNode';
import {createRnCrypto} from '../../mesh/rnCrypto';
import {MemoryStore} from '../../mesh/testing/simNetwork';
import {toBase58} from '../../crypto/encoding';
import {MeshMessage, MessageContent} from '../../types/message';

const bridge = AetherisBridge as jest.Mocked<typeof AetherisBridge>;
const handler = (fn: jest.Mock): any => (fn.mock.calls.at(-1) as any[])[0];

async function keypair() {
  const kp = await sodium.crypto_sign_keypair();
  return {id: toBase58(Buffer.from(kp.pk, 'base64')), sk: kp.sk};
}

describe('meshService with a peer phone', () => {
  let me: {id: string; sk: string};
  let bob: {id: string; sk: string};
  let bobNode: MeshNode;
  const bobInbox: {m: MeshMessage; c: MessageContent}[] = [];
  const queue: (() => Promise<void>)[] = [];
  const settle = async () => {
    for (let i = 0; i < 50; i++) {
      while (queue.length) await queue.shift()!();
      await new Promise(r => setImmediate(r));
      if (!queue.length) return;
    }
  };

  beforeAll(async () => {
    const SQL = await initSqlJs();
    mockState.db = new SQL.Database();
    me = await keypair();
    bob = await keypair();
    mockState.sk = me.sk;
    await initDatabase();

    await useMeshService.getState().bootstrap(me.id);
    expect(useMeshService.getState().status).toBe('running');

    // Wire the fake radio: our sendFrame → Bob, Bob's send → our onFrame.
    const onFrame = handler(bridge.onFrame as any);
    bobNode = new MeshNode(
      bob.id,
      {
        send: async (_link, data) => {
          queue.push(async () => onFrame({linkId: 'L1', data}));
        },
        disconnect: () => undefined,
      },
      createRnCrypto(bob.id, bob.sk),
      new MemoryStore(),
      {onDeliver: (m, c) => bobInbox.push({m, c})},
    );
    bobNode.alias = 'Bob';
    bridge.sendFrame.mockImplementation(async (_link: string, data: string) => {
      queue.push(() => bobNode.onFrame('L0', data));
    });

    useMeshService.getState().setAlias('Me');
    handler(bridge.onLinkUp as any)({linkId: 'L1', nodeId: bob.id});
    await bobNode.onLinkUp('L0');
    await settle();
  });

  it('links up and sees Bob as a direct neighbour', () => {
    const s = useMeshService.getState();
    expect(s.neighbours.map(n => n.id)).toEqual([bob.id]);
    expect(s.routes).toEqual([expect.objectContaining({id: bob.id, hops: 1, alias: 'Bob'})]);
  });

  it('sends a message, Bob decrypts it, and it is marked delivered', async () => {
    const id = await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 'hello bob'});
    await settle();
    expect(bobInbox.at(-1)!.c).toMatchObject({text: 'hello bob', alias: 'Me'});
    const row = dbGetConversation(bob.id).find(m => m.id === id)!;
    expect(row.status).toBe('delivered');
    expect(row.route).toEqual([]);
    // Bob's phone stores the mesh id as-is, so his reference id is this same id.
    expect(row.refId).toBe(id);
    expect(bobInbox.at(-1)!.m.id).toBe(id);
    expect(dbFindByRef(bob.id, id)?.id).toBe(id);
  });

  it('stores incoming messages in the right conversation and notifies', async () => {
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'hi from bob', alias: 'Bob'}});
    await settle();
    const conv = dbGetConversation(bob.id);
    expect(conv.at(-1)).toMatchObject({text: 'hi from bob', isOutbound: false, senderAlias: 'Bob'});
    expect(conv.at(-1)!.refId).toBe(conv.at(-1)!.id); // 1:1: the mesh id
    const list = useMessagesStore.getState().conversations;
    expect(list[0]).toMatchObject({id: bob.id, title: 'Bob', unread: 1});
    expect(bridge.showMessageNotification).toHaveBeenCalledWith(bob.id, 'Bob', 'hi from bob');
  });

  it('stamps arrival time and moves a late message to the top of the chat list', async () => {
    const carl = await keypair();
    const svc = useMeshService.getState();
    await svc.sendToConversation(carl.id, {kind: 'text', text: 'newer outbound'});
    expect(useMessagesStore.getState().conversations[0].id).toBe(carl.id);

    const origin = Date.now() - 3 * 3600000;
    const before = Date.now();
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'late news', alias: 'Bob'}});
    // Backdate by rewriting the row the way an old origin timestamp would store it.
    await settle();
    const row = dbGetConversation(bob.id).at(-1)!;
    expect(row.receivedAt).toBeGreaterThanOrEqual(before);
    mockState.db.run('UPDATE messages SET created_at = ? WHERE id = ?', [origin, row.id]);

    const list = dbListConversations();
    expect(list[0]).toMatchObject({id: bob.id, lastText: 'late news'});
    expect(list[0].lastTime).toBe(row.receivedAt);
    expect(dbGetConversation(bob.id).at(0)!.createdAt).toBeLessThanOrEqual(origin);
    svc.deleteConversation(carl.id);
  });

  it('fans group messages out per member and counts delivery receipts', async () => {
    const carol = await keypair(); // not reachable: her copy is carried
    const conversationId = useMeshService.getState().createGroup('Camp', [bob.id, carol.id]);
    const id = await useMeshService.getState().sendToConversation(conversationId, {kind: 'text', text: 'to all'});
    await settle();

    const toBob = bobInbox.at(-1)!.c;
    expect(toBob.text).toBe('to all');
    expect(toBob.group).toMatchObject({name: 'Camp', members: [me.id, bob.id, carol.id]});

    useMessagesStore.getState().loadMessages(conversationId);
    const msg = useMessagesStore.getState().messages[conversationId].find(m => m.id === id)!;
    expect(msg).toMatchObject({deliveredCount: 1, recipientCount: 2, status: 'sent'});
    expect(useMeshService.getState().carrying).toBeGreaterThan(0);

    // The sender's row and every copy carry one shared id, scoped to the sender.
    expect(toBob.groupMessageId).toBe(id);
    expect(dbFindByRef(conversationId, groupRef(me.id, id))).toMatchObject({id, refId: groupRef(me.id, id), isOutbound: true});
  });

  it('stores a received group copy under its shared refId, not its own id', async () => {
    const gid = 'g-ref';
    await bobNode.send({
      recipientId: me.id,
      content: {
        kind: 'text',
        text: 'group ref',
        group: {id: gid, name: 'Refs', members: [bob.id, me.id]},
        groupMessageId: 'shared-1',
      },
    });
    await settle();
    const row = dbGetConversation(`group:${gid}`).at(-1)!;
    expect(row.id).not.toBe('shared-1');
    expect(row.refId).toBe(groupRef(bob.id, 'shared-1'));
    expect(dbFindByRef(`group:${gid}`, groupRef(bob.id, 'shared-1'))?.id).toBe(row.id);
    expect(dbFindByRef(`group:${gid}`, 'nope')).toBeNull();
  });

  it('ignores groupMessageId on a 1:1 message', async () => {
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'spoof', groupMessageId: 'victim-ref'}});
    await settle();
    const row = dbGetConversation(bob.id).at(-1)!;
    expect(row.text).toBe('spoof');
    expect(row.refId).toBe(row.id);
    expect(dbFindByRef(bob.id, 'victim-ref')).toBeNull();
  });

  it("can't take over another sender's group ref, even by sending first", async () => {
    const carol = await keypair();
    const conv = 'group:g-spoof';
    dbInsertMessage({
      id: 'carol-row', refId: groupRef(carol.id, 'shared-x'), conversationId: conv, senderId: carol.id, recipientId: me.id,
      kind: 'text', text: 'carol original', status: 'delivered', isOutbound: false, createdAt: Date.now(),
    });
    const group = {id: 'g-spoof', name: 'Spoof', members: [bob.id, me.id]};
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'spoof', group, groupMessageId: 'shared-x'}});
    await settle();
    const spoof = dbGetConversation(conv).find(m => m.text === 'spoof')!;
    expect(spoof.refId).toBe(groupRef(bob.id, 'shared-x'));
    expect(dbFindByRef(conv, groupRef(carol.id, 'shared-x'))?.text).toBe('carol original');
    // Claiming Carol's full ref still lands under Bob's own id.
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'spoof2', group, groupMessageId: groupRef(carol.id, 'shared-x')}});
    await settle();
    expect(dbFindByRef(conv, groupRef(carol.id, 'shared-x'))?.text).toBe('carol original');
  });

  it('delivers a 1:1 reply with replyTo intact', async () => {
    const replyTo = {id: 'orig-1', senderId: bob.id, snippet: 'hi from bob'};
    const id = await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 're', replyTo});
    await settle();
    expect(bobInbox.at(-1)!.c.replyTo).toEqual(replyTo);
    expect(dbGetConversation(bob.id).find(m => m.id === id)!.replyTo).toEqual(replyTo);
    // Bob replies to us: the inbound row keeps it.
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'ok', replyTo}});
    await settle();
    expect(dbGetConversation(bob.id).at(-1)!.replyTo).toEqual(replyTo);
  });

  it('drops or truncates a malformed replyTo but still stores the message', async () => {
    const send = async (text: string, replyTo: unknown) => {
      await bobNode.send({recipientId: me.id, content: {kind: 'text', text, replyTo} as any});
      await settle();
      return dbGetConversation(bob.id).at(-1)!;
    };
    expect(await send('bad1', 'str')).toMatchObject({text: 'bad1', replyTo: undefined});
    expect(await send('bad2', {id: 5, senderId: 'x', snippet: 's'})).toMatchObject({text: 'bad2', replyTo: undefined});
    expect(await send('bad3', {id: '', senderId: 'x', snippet: 's'})).toMatchObject({replyTo: undefined});
    expect(await send('bad4', {id: 'a'.repeat(129), senderId: 'x', snippet: 's'})).toMatchObject({replyTo: undefined});
    expect(await send('bad5', {id: 'a', senderId: 'x', snippet: 7})).toMatchObject({replyTo: undefined});
    const big = await send('big', {id: 'a', senderId: 'x', snippet: 'z'.repeat(5000)});
    expect(big.text).toBe('big');
    expect(big.replyTo).toEqual({id: 'a', senderId: 'x', snippet: 'z'.repeat(100)});
  });

  it('carries replyTo on every group copy', async () => {
    const carol = await keypair();
    const conversationId = useMeshService.getState().createGroup('Replies', [bob.id, carol.id]);
    const replyTo = {id: 'g-orig', senderId: carol.id, snippet: 'earlier'};
    const id = await useMeshService.getState().sendToConversation(conversationId, {kind: 'text', text: 'gr', replyTo});
    await settle();
    expect(bobInbox.at(-1)!.c.replyTo).toEqual(replyTo);
    expect(dbFindByRef(conversationId, groupRef(me.id, id))!.replyTo).toEqual(replyTo);
    // Carol is unreachable: her copy sits in the carry store with replyTo inside the content.
    expect(dbGetConversation(conversationId).find(m => m.id === id)!.replyTo).toEqual(replyTo);
  });

  it('retry keeps replyTo', async () => {
    const erin = await keypair();
    const replyTo = {id: 'r-1', senderId: erin.id, snippet: 'Photo'};
    const id = await useMeshService.getState().sendToConversation(erin.id, {kind: 'text', text: 'again', replyTo});
    dbUpdateMessageStatus(id, 'failed');
    await useMeshService.getState().retryMessage(id);
    const conv = dbGetConversation(erin.id);
    expect(conv).toHaveLength(1);
    expect(conv[0].replyTo).toEqual(replyTo);
  });

  describe('reactions', () => {
    const rx = async (c: any) => {
      await bobNode.send({recipientId: me.id, content: {kind: 'text', text: '', alias: 'Bob', ...c}});
      await settle();
    };
    const unreadOf = (id: string) => useMessagesStore.getState().conversations.find(c => c.id === id)?.unread ?? 0;

    it('stores a reaction without a message row, notification or unread', async () => {
      await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'react to me', alias: 'Bob'}});
      await settle();
      const target = dbGetConversation(bob.id).at(-1)!;
      const rows = dbGetConversation(bob.id).length;
      const unread = unreadOf(bob.id);
      bridge.showMessageNotification.mockClear();

      await rx({reaction: {messageId: target.refId, emoji: '👍'}, text: 'Reacted 👍 to "react to me"'});
      expect(dbGetConversation(bob.id)).toHaveLength(rows);
      expect(unreadOf(bob.id)).toBe(unread);
      expect(bridge.showMessageNotification).not.toHaveBeenCalled();
      expect(dbReactionsFor(bob.id)[target.refId]).toEqual([{emoji: '👍', reactorId: bob.id}]);
      expect(useMessagesStore.getState().reactions[bob.id][target.refId]).toHaveLength(1);

      // Change, then remove.
      await new Promise(r => setTimeout(r, 5));
      await rx({reaction: {messageId: target.refId, emoji: '❤️'}});
      expect(dbReactionsFor(bob.id)[target.refId]).toEqual([{emoji: '❤️', reactorId: bob.id}]);
      await new Promise(r => setTimeout(r, 5));
      await rx({reaction: {messageId: target.refId, emoji: ''}});
      expect(dbReactionsFor(bob.id)[target.refId]).toBeUndefined();
    });

    it('ignores an older reaction that arrives after a newer one', () => {
      dbSetReaction('c-order', 'm1', 'zed', '❤️', 2000);
      dbSetReaction('c-order', 'm1', 'zed', '👍', 1000);
      expect(dbReactionsFor('c-order').m1).toEqual([{emoji: '❤️', reactorId: 'zed'}]);
      dbSetReaction('c-order', 'm1', 'zed', '', 3000);
      dbSetReaction('c-order', 'm1', 'zed', '😂', 2500); // stale, after the removal
      expect(dbReactionsFor('c-order').m1).toBeUndefined();
    });

    it('drops an invalid reaction instead of storing it as text', async () => {
      const rows = dbGetConversation(bob.id).length;
      const before = JSON.stringify(dbReactionsFor(bob.id));
      await rx({reaction: {messageId: 'x', emoji: '💩'}, text: 'bad emoji'});
      await rx({reaction: {messageId: '', emoji: '👍'}, text: 'bad id'});
      await rx({reaction: {messageId: 'a'.repeat(129), emoji: '👍'}, text: 'long id'});
      await rx({reaction: 'str', text: 'not an object'});
      await rx({reaction: {messageId: 5, emoji: '👍'}, text: 'num id'});
      expect(dbGetConversation(bob.id)).toHaveLength(rows);
      expect(JSON.stringify(dbReactionsFor(bob.id))).toBe(before);
    });

    it('sends a 1:1 reaction with a readable fallback for old versions', async () => {
      const id = await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 'my words'});
      const rows = dbGetConversation(bob.id).length;
      await useMeshService.getState().sendReaction(bob.id, id, '😮');
      await settle();
      expect(bobInbox.at(-1)!.c).toMatchObject({reaction: {messageId: id, emoji: '😮'}, text: 'Reacted 😮 to "my words"'});
      expect(dbGetConversation(bob.id)).toHaveLength(rows);
      expect(dbReactionsFor(bob.id)[id]).toEqual([{emoji: '😮', reactorId: me.id}]);
      await useMeshService.getState().sendReaction(bob.id, id, '');
      await settle();
      expect(bobInbox.at(-1)!.c.text).toBe('Removed a reaction');
      expect(dbReactionsFor(bob.id)[id]).toBeUndefined();
    });

    it('fans a group reaction out to every member with no delivery rows', async () => {
      const carol = await keypair();
      const conversationId = useMeshService.getState().createGroup('Rx', [bob.id, carol.id]);
      const id = await useMeshService.getState().sendToConversation(conversationId, {kind: 'text', text: 'grp'});
      await settle();
      const carryBefore = useMeshService.getState().carrying;
      const deliveries = dbGroupDeliveries(id).length;
      await useMeshService.getState().sendReaction(conversationId, id, '🙏');
      await settle();
      expect(bobInbox.at(-1)!.c).toMatchObject({reaction: {messageId: id, emoji: '🙏'}, group: {name: 'Rx'}});
      expect(useMeshService.getState().carrying).toBe(carryBefore + 1); // Carol's copy is carried
      expect(dbGroupDeliveries(id)).toHaveLength(deliveries);
      expect(dbGetConversation(conversationId)).toHaveLength(1);
      expect(dbReactionsFor(conversationId)[id]).toEqual([{emoji: '🙏', reactorId: me.id}]);
    });

    it('stores a group reaction from a member and drops reactions with the chat', async () => {
      const gid = 'g-rx';
      const conversationId = `group:${gid}`;
      await rx({reaction: {messageId: 'shared-9', emoji: '😢'}, group: {id: gid, name: 'G', members: [bob.id, me.id]}});
      expect(dbReactionsFor(conversationId)['shared-9']).toEqual([{emoji: '😢', reactorId: bob.id}]);
      useMeshService.getState().deleteConversation(conversationId);
      expect(dbReactionsFor(conversationId)).toEqual({});
      expect(useMessagesStore.getState().reactions[conversationId]).toBeUndefined();
    });
  });

  describe('reaction cleanup', () => {
    const msg = (id: string, conversationId: string) =>
      dbInsertMessage({
        id, refId: id, conversationId, senderId: 'x', recipientId: me.id, kind: 'text', text: 't',
        status: 'delivered', isOutbound: false, createdAt: Date.now(),
      });

    it('deleting a message deletes its reactions only', () => {
      msg('del-1', 'c-del');
      msg('keep-1', 'c-del');
      dbSetReaction('c-del', 'del-1', 'a', '👍', 1000);
      dbSetReaction('c-del', 'keep-1', 'a', '👍', 1000);
      dbSetReaction('c-other', 'del-1', 'a', '👍', 1000);
      dbDeleteMessage('del-1');
      expect(dbReactionsFor('c-del')['del-1']).toBeUndefined();
      expect(dbReactionsFor('c-del')['keep-1']).toHaveLength(1);
      expect(dbReactionsFor('c-other')['del-1']).toHaveLength(1);
    });

    it('prunes old reactions and tombstones with no message, keeping the rest', () => {
      const now = Date.now();
      const old = now - MESSAGE_TTL_MS - 1000;
      msg('live-1', 'c-prune');
      dbSetReaction('c-prune', 'gone', 'a', '👍', old);
      dbSetReaction('c-prune', 'gone', 'b', '', old); // tombstone
      dbSetReaction('c-prune', 'live-1', 'a', '👍', old); // message exists
      dbSetReaction('c-prune', 'early', 'a', '👍', now); // recent, message may still come
      dbSetReaction('c-prune2', 'live-1', 'a', '👍', old); // same ref, other conversation
      dbPruneOrphanReactions(now);
      const r = dbReactionsFor('c-prune');
      expect(r.gone).toBeUndefined();
      expect(r['live-1']).toHaveLength(1);
      expect(r.early).toHaveLength(1);
      expect(dbReactionsFor('c-prune2')).toEqual({});
      dbSetReaction('c-prune', 'gone', 'b', '😂', old + 1); // tombstone really gone: nothing blocks this
      expect(dbReactionsFor('c-prune').gone).toHaveLength(1);
    });

    it('keys reactions per conversation', () => {
      dbSetReaction('c-k1', 'same', 'a', '👍', 1000);
      dbSetReaction('c-k2', 'same', 'a', '❤️', 1000);
      expect(dbReactionsFor('c-k1').same).toEqual([{emoji: '👍', reactorId: 'a'}]);
      expect(dbReactionsFor('c-k2').same).toEqual([{emoji: '❤️', reactorId: 'a'}]);
    });
  });

  it('learns a group from the first message a member sends', async () => {
    const gid = 'g-from-bob';
    await bobNode.send({
      recipientId: me.id,
      content: {kind: 'text', text: 'new group!', group: {id: gid, name: 'Hikers', members: [bob.id, me.id]}},
    });
    await settle();
    expect(dbGetGroup(gid)).toMatchObject({name: 'Hikers'});
    expect(dbGetConversation(`group:${gid}`).at(-1)!.text).toBe('new group!');
  });

  it("doesn't let a message rename a known group or change its members", async () => {
    const carol = await keypair();
    const conversationId = useMeshService.getState().createGroup('Family', [carol.id]);
    const gid = conversationId.slice('group:'.length);
    const before = dbGetGroup(gid);

    // Bob isn't a member: his message claiming the group is dropped.
    await bobNode.send({
      recipientId: me.id,
      content: {kind: 'text', text: 'let me in', group: {id: gid, name: 'Taken', members: [bob.id, me.id]}},
    });
    await settle();
    expect(dbGetGroup(gid)).toEqual(before);
    expect(dbGetConversation(conversationId).some(m => m.text === 'let me in')).toBe(false);
  });

  it("ignores a reaction from someone who isn't in the group", async () => {
    const carol = await keypair();
    const conversationId = useMeshService.getState().createGroup('Book club', [carol.id]);
    const gid = conversationId.slice('group:'.length);
    const before = dbGetGroup(gid);
    const id = await useMeshService.getState().sendToConversation(conversationId, {kind: 'text', text: 'chapter 3?'});
    const ref = dbGetConversation(conversationId).find(m => m.id === id)!.refId;

    // Bob isn't a member but lists himself in the group to react.
    await bobNode.send({
      recipientId: me.id,
      content: {
        kind: 'text',
        text: 'Reacted',
        reaction: {messageId: ref, emoji: '👍'},
        group: {id: gid, name: 'Hijacked', members: [bob.id, me.id, carol.id]},
      },
    });
    await settle();
    expect(dbReactionsFor(conversationId)[ref]).toBeUndefined();
    expect(dbGetGroup(gid)).toEqual(before);
  });

  it('keeps a known group as stored when a member sends different details', async () => {
    const carol = await keypair();
    const conversationId = useMeshService.getState().createGroup('Trip', [bob.id, carol.id]);
    const gid = conversationId.slice('group:'.length);
    const before = dbGetGroup(gid);

    await bobNode.send({
      recipientId: me.id,
      content: {kind: 'text', text: 'hi all', group: {id: gid, name: 'Renamed', members: [bob.id, me.id]}},
    });
    await settle();
    expect(dbGetGroup(gid)).toEqual(before);
    expect(dbGetConversation(conversationId).at(-1)!.text).toBe('hi all');
  });

  it('shows the name people chose, unless you renamed them', async () => {
    expect(displayName(bob.id)).toBe('Bob');
    dbSetNickname(bob.id, 'Bobby (work)');
    expect(displayName(bob.id, 'Bob')).toBe('Bobby (work)');
    expect(dbGetPeer(bob.id)).toMatchObject({alias: 'Bob', nickname: 'Bobby (work)'});
    dbSetNickname(bob.id, '');
    expect(displayName(bob.id)).toBe('Bob');
  });

  it('deleting an undelivered message stops its delivery; retry resends it', async () => {
    const erin = await keypair(); // nowhere on the mesh: the message is carried
    const svc = useMeshService.getState();
    const before = svc.carrying;
    const id = await svc.sendToConversation(erin.id, {kind: 'text', text: 'are you there?'});
    await settle();
    // Bob may hold a sprayed copy; our own copy is what we can cancel.
    expect(useMeshService.getState().carrying).toBeGreaterThan(before);

    useMeshService.getState().deleteMessage(id);
    expect(dbGetConversation(erin.id).find(m => m.id === id)).toBeUndefined();
    expect(useMeshService.getState().carrying).toBe(before);

    const id2 = await svc.sendToConversation(erin.id, {kind: 'text', text: 'second try'});
    dbUpdateMessageStatus(id2, 'failed');
    await useMeshService.getState().retryMessage(id2);
    const conv = dbGetConversation(erin.id);
    expect(conv.map(m => m.text)).toEqual(['second try']);
    expect(conv[0].id).not.toBe(id2);
    expect(conv[0].status).not.toBe('failed'); // queued again (and sprayed to Bob)
  });

  it('a retry that cannot send keeps the failed message', async () => {
    const erin = await keypair();
    const id = await useMeshService.getState().sendToConversation(erin.id, {kind: 'text', text: 'keep me'});
    dbUpdateMessageStatus(id, 'failed');
    const realSend = useMeshService.getState().sendToConversation;
    useMeshService.setState({
      sendToConversation: async () => {
        throw new Error('Mesh is not running yet');
      },
    });
    try {
      await expect(useMeshService.getState().retryMessage(id)).rejects.toThrow('Mesh is not running yet');
    } finally {
      useMeshService.setState({sendToConversation: realSend});
    }
    const conv = dbGetConversation(erin.id);
    expect(conv.map(m => [m.id, m.text, m.status])).toEqual([[id, 'keep me', 'failed']]);
  });

  it('deleting a chat stops delivery of its pending messages', async () => {
    const erin = await keypair();
    const svc = useMeshService.getState();
    const before = svc.carrying;
    await svc.sendToConversation(erin.id, {kind: 'text', text: 'one'});
    await svc.sendToConversation(erin.id, {kind: 'text', text: 'two'});
    expect(useMeshService.getState().carrying).toBe(before + 2);

    useMeshService.getState().deleteConversation(erin.id);
    expect(dbGetConversation(erin.id)).toEqual([]);
    expect(useMeshService.getState().carrying).toBe(before);
    expect(useMessagesStore.getState().messages[erin.id]).toBeUndefined();
  });

  describe('profile photos', () => {
    const jpeg = (seed: string) => Buffer.from(`fake-jpeg-${seed}`).toString('base64');

    it('sends my photo with the first message to someone, then only after it changes', async () => {
      await useMeshService.getState().setPhoto(jpeg('1'));
      const before = bobInbox.length;
      await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 'pic 1'});
      await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 'pic 2'});
      await settle();
      const [first, second] = bobInbox.slice(before).map(x => x.c);
      expect(first.avatar).toMatchObject({data: jpeg('1')});
      expect(second.avatar).toBeUndefined();

      await useMeshService.getState().setPhoto(jpeg('2'));
      await useMeshService.getState().sendToConversation(bob.id, {kind: 'text', text: 'pic 3'});
      await settle();
      expect(bobInbox.at(-1)!.c.avatar).toMatchObject({data: jpeg('2')});
      expect(useAvatarStore.getState().avatars[me.id]).toBe(jpeg('2'));
    });

    it("stores a neighbour's photo and a photo carried in a message", async () => {
      await bobNode.setPhoto({hash: 'bob-1', data: jpeg('bob')});
      await settle();
      expect(useAvatarStore.getState().avatars[bob.id]).toBe(jpeg('bob'));
      expect(dbGetPeer(bob.id)!.avatarHash).toBe('bob-1');

      await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'new pic', avatar: {hash: 'bob-2', data: jpeg('bob2')}}});
      await settle();
      expect(useAvatarStore.getState().avatars[bob.id]).toBe(jpeg('bob2'));

      // Removal
      await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'no pic', avatar: {hash: '', data: ''}}});
      await settle();
      expect(useAvatarStore.getState().avatars[bob.id]).toBeUndefined();
    });

    it('ignores a malformed photo in a message', async () => {
      await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'x', avatar: {hash: 'bad', data: '<svg onload=1>'}}});
      await settle();
      expect(dbGetPeer(bob.id)!.avatarHash).not.toBe('bad');
    });
  });

  it('marks routes down when the link drops', async () => {
    handler(bridge.onLinkDown as any)({linkId: 'L1'});
    expect(useMeshService.getState().neighbours).toEqual([]);
    expect(useMeshService.getState().routes).toEqual([]);
  });

  describe('expiry bookkeeping', () => {
    const outbound = (id: string, createdAt: number, status: 'pending' | 'sent' = 'pending') =>
      dbInsertMessage({
        id,
        conversationId: 'x',
        senderId: me.id,
        recipientId: bob.id,
        kind: 'text',
        text: id,
        status,
        isOutbound: true,
        createdAt,
      });
    const group = (parent: string, subs: string[]) => {
      outbound(parent, Date.now(), 'sent');
      subs.forEach((s, i) => dbAddGroupDelivery(s, parent, `m${i}`));
    };

    it('fails a group message when every copy expires undelivered', () => {
      group('gp1', ['gp1a', 'gp1b']);
      expect(dbExpireGroupCopy('gp1a')).toEqual({parent: 'gp1', failed: false});
      expect(dbExpireGroupCopy('gp1b')).toEqual({parent: 'gp1', failed: true});
    });

    it('does not fail a group message that was delivered to someone', () => {
      group('gp2', ['gp2a', 'gp2b']);
      dbMarkGroupDelivered('gp2a');
      expect(dbExpireGroupCopy('gp2b')).toEqual({parent: 'gp2', failed: false});
      expect(dbGetMessageStatus('gp2')).toBe('sent');
    });

    it('sweeps old pending messages at startup and leaves recent ones', () => {
      const now = Date.now();
      const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
      outbound('old1', now - MESSAGE_TTL_MS - 1000);
      outbound('new1', now - 1000);
      dbExpireOverdueOutbound(Date.now());
      spy.mockRestore();
      expect(dbGetMessageStatus('old1')).toBe('failed');
      expect(dbGetMessageStatus('new1')).toBe('pending');
    });

    it('sweeps group parents by the same rule', () => {
      const old = Date.now() - MESSAGE_TTL_MS - 1000;
      outbound('gp3', old, 'sent');
      outbound('gp4', old, 'sent');
      dbAddGroupDelivery('gp3a', 'gp3', 'm0');
      dbAddGroupDelivery('gp3b', 'gp3', 'm1');
      dbAddGroupDelivery('gp4a', 'gp4', 'm0');
      dbAddGroupDelivery('gp4b', 'gp4', 'm1');
      dbMarkGroupDelivered('gp4a');
      dbExpireOverdueOutbound(Date.now());
      expect(dbGetMessageStatus('gp3')).toBe('failed');
      expect(dbGetMessageStatus('gp4')).toBe('sent');
    });
  });
});
