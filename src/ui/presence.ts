import {dbGetPeer} from '../db/database';
import type {MeshRoute} from '../store/meshService';

/** Human wording for whether someone can get messages right now. */
export function presenceText(id: string, routes: MeshRoute[]): string {
  if (routes.some(r => r.id === id)) return 'nearby';
  let lastSeen = 0;
  try {
    lastSeen = dbGetPeer(id)?.lastSeen ?? 0;
  } catch {}
  return lastSeen ? `last seen ${formatLastSeen(lastSeen)}` : 'not nearby';
}

export function isNearby(id: string, routes: MeshRoute[]): boolean {
  return routes.some(r => r.id === id);
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatLastSeen(ts: number, now = Date.now()): string {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(ts);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `today at ${formatClock(ts)}`;
  if (d.toDateString() === yesterday.toDateString()) return `yesterday at ${formatClock(ts)}`;
  return d.toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}

/** Chat-list style timestamp: 14:02 / Yesterday / Mon / 12 Mar */
export function formatListTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return formatClock(ts);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now - ts < 6 * 86400000) return d.toLocaleDateString(undefined, {weekday: 'short'});
  return d.toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}
