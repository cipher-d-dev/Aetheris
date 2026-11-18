import {AetherisBridge} from '../native/AetherisBridge';
import {dbAddContact} from '../db/database';
import {ContactCard, parseContactLink} from './contactLink';

export type AddResult =
  | {ok: true; contact: ContactCard}
  | {ok: false; reason: 'cancelled' | 'invalid' | 'self' | 'unavailable'; message?: string};

/**
 * Save a contact from a link or QR payload.
 * `verified` = scanned in person (the ID *is* their key, so this proves it).
 */
export function addContactFromText(text: string | null, selfId: string, verified: boolean): AddResult {
  const contact = parseContactLink(text);
  if (!contact) return {ok: false, reason: 'invalid'};
  if (contact.id === selfId) return {ok: false, reason: 'self'};
  dbAddContact(contact.id, contact.name, verified);
  return {ok: true, contact};
}

export async function scanContact(selfId: string): Promise<AddResult> {
  let text: string | null;
  try {
    text = await AetherisBridge.scanQrCode();
  } catch (e: any) {
    return {ok: false, reason: 'unavailable', message: e?.message};
  }
  if (text === null) return {ok: false, reason: 'cancelled'};
  return addContactFromText(text, selfId, true);
}

export function addResultMessage(r: AddResult): string {
  if (r.ok) return 'Contact added.';
  switch (r.reason) {
    case 'invalid':
      return "That isn't an Aetheris contact code.";
    case 'self':
      return "That's your own code.";
    case 'unavailable':
      return 'The QR scanner is not available on this phone. Ask them to share their link instead.';
    default:
      return '';
  }
}
