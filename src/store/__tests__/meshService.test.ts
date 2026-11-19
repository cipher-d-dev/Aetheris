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
import {initDatabase, dbGetConversation, dbGetGroup} from '../../db/database';
import {useMeshService} from '../meshService';
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
  });

  it('stores incoming messages in the right conversation and notifies', async () => {
    await bobNode.send({recipientId: me.id, content: {kind: 'text', text: 'hi from bob', alias: 'Bob'}});
    await settle();
    const conv = dbGetConversation(bob.id);
    expect(conv.at(-1)).toMatchObject({text: 'hi from bob', isOutbound: false, senderAlias: 'Bob'});
    const list = useMessagesStore.getState().conversations;
    expect(list[0]).toMatchObject({id: bob.id, title: 'Bob', unread: 1});
    expect(bridge.showMessageNotification).toHaveBeenCalledWith(bob.id, 'Bob', 'hi from bob');
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
