import type {ChatMessage} from '../store/messagesStore';
import {formatClock} from './presence';

/** An inbound message that reached this phone this long after it was sent counts as late. */
export const LATE_ARRIVAL_MS = 10 * 60 * 1000;

type Timed = Pick<ChatMessage, 'isOutbound' | 'createdAt' | 'receivedAt'>;

export function isLate(m: Timed): boolean {
  return !m.isOutbound && m.receivedAt != null && m.receivedAt - m.createdAt > LATE_ARRIVAL_MS;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sentStamp(sent: number, arrived: number): string {
  const d = new Date(sent);
  if (d.toDateString() === new Date(arrived).toDateString()) return formatClock(sent);
  const day =
    arrived - sent < 6 * 86400000
      ? WEEKDAYS[d.getDay()]
      : d.toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
  return `${day} ${formatClock(sent)}`;
}

/** "Sent 14:14 · arrived 16:40", or "Sent Tue 14:14 · arrived 09:02" across days. */
export function lateLabel(m: Pick<Timed, 'createdAt' | 'receivedAt'>): string {
  // A clock time, not "just now": bubbles don't re-render as time passes.
  const arrived = m.receivedAt ?? m.createdAt;
  return `Sent ${sentStamp(m.createdAt, arrived)} · arrived ${formatClock(arrived)}`;
}

export function lateAccessibilityLabel(m: Pick<Timed, 'createdAt' | 'receivedAt'>): string {
  const arrived = m.receivedAt ?? m.createdAt;
  return `Sent ${sentStamp(m.createdAt, arrived)}, arrived ${formatClock(arrived)}, delayed on the way`;
}
