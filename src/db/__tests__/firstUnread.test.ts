import {beforeAll, describe, expect, it, jest} from '@jest/globals';

const mockState: {db: any} = {db: null};

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

import initSqlJs from 'sql.js';
import {dbFirstUnread, dbInsertMessage, dbMarkConversationRead, initDatabase} from '../database';

const insert = (id: string, conv: string, createdAt: number, o: {out?: boolean; read?: boolean} = {}) =>
  dbInsertMessage({
    id,
    conversationId: conv,
    senderId: 'a',
    recipientId: 'b',
    kind: 'text',
    text: id,
    status: 'delivered',
    isOutbound: !!o.out,
    createdAt,
    read: o.read ?? true,
  });

describe('dbFirstUnread', () => {
  beforeAll(async () => {
    const SQL = await initSqlJs();
    mockState.db = new SQL.Database();
    await initDatabase();
  });

  it('is null when nothing is unread', () => {
    insert('r1', 'c1', 100);
    expect(dbFirstUnread('c1')).toBeNull();
  });

  it('returns the earliest unread by created_at, even if it was inserted last, and counts all', () => {
    insert('u2', 'c2', 300, {read: false});
    insert('u3', 'c2', 400, {read: false});
    insert('late', 'c2', 200, {read: false});
    insert('mine', 'c2', 150, {out: true, read: false});
    insert('old', 'c2', 100);
    expect(dbFirstUnread('c2')).toEqual({id: 'late', count: 3});
  });

  it('ignores other conversations and is null once marked read', () => {
    expect(dbFirstUnread('c3')).toBeNull();
    dbMarkConversationRead('c2');
    expect(dbFirstUnread('c2')).toBeNull();
  });
});
