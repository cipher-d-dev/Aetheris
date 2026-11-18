/**
 * In-memory ring buffer of mesh events for the Diagnostics screen, so field
 * testers can export what happened without a laptop and adb.
 */
export interface LogLine {
  t: number;
  msg: string;
}

const MAX_LINES = 600;
const lines: LogLine[] = [];
const listeners = new Set<() => void>();

export function logEvent(msg: string): void {
  lines.push({t: Date.now(), msg});
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  listeners.forEach(l => l());
}

export function getLogLines(): LogLine[] {
  return lines.slice();
}

export function clearLog(): void {
  lines.length = 0;
  listeners.forEach(l => l());
}

export function subscribeLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatLogTime(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
