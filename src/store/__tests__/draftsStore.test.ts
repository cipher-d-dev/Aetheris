import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';

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
import {dbGetSetting, initDatabase} from '../../db/database';
import {useDraftsStore} from '../draftsStore';

describe('draftsStore', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    if (!mockState.db) {
      const SQL = await initSqlJs();
      mockState.db = new SQL.Database();
      await initDatabase();
    }
    useDraftsStore.setState({drafts: {}});
  });
  afterEach(() => {
    useDraftsStore.getState().flushDrafts();
    useDraftsStore.getState().clearDraft('a');
    jest.useRealTimers();
  });

  it('updates memory at once and persists after 500 ms', () => {
    useDraftsStore.getState().setDraft('a', 'hello');
    expect(useDraftsStore.getState().drafts.a).toBe('hello');
    expect(dbGetSetting('draft:a')).toBeNull();
    jest.advanceTimersByTime(499);
    expect(dbGetSetting('draft:a')).toBeNull();
    jest.advanceTimersByTime(1);
    expect(dbGetSetting('draft:a')).toBe('hello');
  });

  it('writes only the latest text when typing quickly', () => {
    const {setDraft} = useDraftsStore.getState();
    setDraft('a', 'h');
    jest.advanceTimersByTime(300);
    setDraft('a', 'hi');
    jest.advanceTimersByTime(300);
    expect(dbGetSetting('draft:a')).toBeNull();
    jest.advanceTimersByTime(200);
    expect(dbGetSetting('draft:a')).toBe('hi');
  });

  it('flushDrafts writes pending drafts immediately', () => {
    useDraftsStore.getState().setDraft('a', 'soon');
    useDraftsStore.getState().flushDrafts();
    expect(dbGetSetting('draft:a')).toBe('soon');
  });

  it('empty or whitespace text removes the draft and the key', () => {
    useDraftsStore.getState().setDraft('a', 'x');
    useDraftsStore.getState().flushDrafts();
    useDraftsStore.getState().setDraft('a', '   ');
    expect(useDraftsStore.getState().drafts.a).toBeUndefined();
    jest.advanceTimersByTime(500);
    expect(dbGetSetting('draft:a')).toBeNull();
  });

  it('clearDraft removes memory and DB at once', () => {
    useDraftsStore.getState().setDraft('a', 'x');
    useDraftsStore.getState().flushDrafts();
    useDraftsStore.getState().clearDraft('a');
    expect(useDraftsStore.getState().drafts.a).toBeUndefined();
    expect(dbGetSetting('draft:a')).toBeNull();
  });

  it('loadDrafts restores saved drafts', () => {
    useDraftsStore.getState().setDraft('a', 'kept');
    useDraftsStore.getState().flushDrafts();
    useDraftsStore.setState({drafts: {}});
    useDraftsStore.getState().loadDrafts();
    expect(useDraftsStore.getState().drafts).toEqual({a: 'kept'});
  });
});
