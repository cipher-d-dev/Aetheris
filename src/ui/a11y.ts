import {MessageStatus} from '../types/message';
import {MESSAGE_TTL_MS} from '../crypto/messageBuilder';
import type {ChatMessage} from '../store/messagesStore';
import {formatClock} from './presence';

export function statusLabel(status: MessageStatus): string {
  switch (status) {
    case 'pending':
      return 'Sending';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'failed':
      return 'Not delivered';
  }
}

export interface DeliveryExplanationOpts {
  /** Recipient's display name (1:1) */
  name: string;
  now: number;
  isGroup?: boolean;
  /** Group only: members who haven't received the message yet */
  waitingNames?: string[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDeadline(ts: number): string {
  // Same 24-hour clock as the rest of the app.
  return `${WEEKDAYS[new Date(ts).getDay()]} ${formatClock(ts)}`;
}

function nameList(names: string[]): string {
  const shown = names.slice(0, 3);
  if (names.length > 3) return `${shown.join(', ')} and ${names.length - 3} more`;
  if (shown.length < 2) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/**
 * Plain-language reason an outbound message is waiting or failed. Returns null
 * for inbound and delivered messages (callers keep their own wording).
 */
export function deliveryExplanation(
  m: Pick<ChatMessage, 'status' | 'isOutbound' | 'createdAt' | 'deliveredCount' | 'recipientCount'>,
  {name, now, isGroup, waitingNames = []}: DeliveryExplanationOpts,
): string | null {
  if (!m.isOutbound || m.status === 'delivered') return null;
  const hours = Math.round(MESSAGE_TTL_MS / 3600000);
  if (m.status === 'failed') {
    return `Not delivered: nobody reached ${isGroup ? nameList(waitingNames) || 'the group' : name} within ${hours} hours.`;
  }
  const deadline = m.createdAt + MESSAGE_TTL_MS;
  const retry =
    deadline > now
      ? `Aetheris keeps trying for ${hours} hours (until ${formatDeadline(deadline)}).`
      : 'Aetheris is still trying.';
  if (isGroup) {
    const head = `Delivered to ${m.deliveredCount ?? 0} of ${m.recipientCount ?? 0}.`;
    const waiting = waitingNames.length ? `Still waiting for ${nameList(waitingNames)}.` : 'Still waiting for the rest.';
    return `${head} ${waiting} ${retry}`;
  }
  return `Waiting until ${name}, or someone who can reach them, is nearby. ${retry}`;
}
