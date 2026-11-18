/**
 * Contact links / QR payloads:  aetheris://add/<nodeId>?name=<display name>
 *
 * The node ID is the person's public key, so scanning someone's QR in
 * person is all it takes to know you're talking to the right phone.
 */
import {base58ToBase64} from '../crypto/encoding';

export const CONTACT_SCHEME = 'aetheris://add/';

export interface ContactCard {
  id: string;
  name?: string;
}

export function buildContactLink(id: string, name?: string): string {
  const clean = name?.trim();
  return `${CONTACT_SCHEME}${id}${clean ? `?name=${encodeURIComponent(clean.slice(0, 32))}` : ''}`;
}

export function isValidNodeId(id: string): boolean {
  try {
    base58ToBase64(id);
    return true;
  } catch {
    return false;
  }
}

/** Accepts a contact link, or a bare node ID. Returns null if invalid. */
export function parseContactLink(text: string | null | undefined): ContactCard | null {
  if (!text) return null;
  const raw = text.trim();
  let id = raw;
  let name: string | undefined;
  if (raw.toLowerCase().startsWith(CONTACT_SCHEME)) {
    const rest = raw.slice(CONTACT_SCHEME.length);
    const q = rest.indexOf('?');
    id = q >= 0 ? rest.slice(0, q) : rest;
    if (q >= 0) {
      for (const part of rest.slice(q + 1).split('&')) {
        const [k, v] = part.split('=');
        if (k === 'name' && v) {
          try {
            name = decodeURIComponent(v).slice(0, 32);
          } catch {}
        }
      }
    }
  }
  id = id.replace(/\/+$/, '');
  if (!isValidNodeId(id)) return null;
  return {id, ...(name ? {name} : {})};
}
