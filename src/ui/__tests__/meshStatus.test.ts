import {describe, expect, it} from '@jest/globals';
import {meshStatusLine, MeshStatusInput} from '../meshStatus';

const base: MeshStatusInput = {status: 'running', permission: 'granted', bluetoothOn: true, routeCount: 0};

describe('meshStatusLine', () => {
  it('puts permission and Bluetooth problems first', () => {
    const e = {...base, status: 'error' as const, error: 'x'};
    expect(meshStatusLine({...e, permission: 'blocked'}).text).toMatch(/needs access/);
    expect(meshStatusLine({...e, permission: 'denied'}).text).toMatch(/Allow access/);
    expect(meshStatusLine({...e, bluetoothOn: false})).toMatchObject({tone: 'warning', tappable: true});
  });
  it('shows starting for any non-running status', () => {
    expect(meshStatusLine({...base, status: 'starting'})).toEqual({text: 'Starting…', tone: 'normal', tappable: false});
    expect(meshStatusLine({...base, status: 'stopped'}).text).toBe('Starting…');
  });
  it('shows a failed start', () => {
    expect(meshStatusLine({...base, status: 'error', error: 'boom'})).toEqual({
      text: "Couldn't start. Tap for help",
      tone: 'warning',
      tappable: true,
    });
  });
  it('maps radio errors while running', () => {
    expect(meshStatusLine({...base, error: 'm', errorCode: 'ADVERTISE_FAILED'}).text).toMatch(/^Other phones can't see you right now/);
    expect(meshStatusLine({...base, error: 'm', errorCode: 'DISCOVERY_FAILED'}).text).toMatch(/^Can't look for people nearby/);
    expect(meshStatusLine({...base, error: 'm', errorCode: 'WAT'})).toMatchObject({tone: 'warning', tappable: true});
  });
  it('keeps the existing copy when running cleanly', () => {
    expect(meshStatusLine(base).text).toBe('Looking for people nearby…');
    expect(meshStatusLine({...base, routeCount: 1}).text).toBe('1 person nearby');
    expect(meshStatusLine({...base, routeCount: 3})).toEqual({text: '3 people nearby', tone: 'normal', tappable: false});
  });
});
