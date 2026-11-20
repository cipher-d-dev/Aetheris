/** Swipe-to-reply decisions, kept pure so they can be unit-tested. */
export const SWIPE_START_DX = 12;
export const SWIPE_EDGE_PX = 24;
export const SWIPE_TRIGGER_DX = 60;
export const SWIPE_MAX_DX = 80;

/** Claim only rightward, mostly horizontal drags that did not start at the system-back edge. */
export function shouldClaimSwipe({dx, dy, x0}: {dx: number; dy: number; x0: number}): boolean {
  return dx > SWIPE_START_DX && Math.abs(dx) > 2 * Math.abs(dy) && x0 > SWIPE_EDGE_PX;
}

export function swipeTriggersReply(dx: number): boolean {
  return dx > SWIPE_TRIGGER_DX;
}

/** Row offset for a drag: 1:1 up to the trigger, then half speed, never past the max. */
export function swipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  if (dx <= SWIPE_TRIGGER_DX) return dx;
  return Math.min(SWIPE_MAX_DX, SWIPE_TRIGGER_DX + (dx - SWIPE_TRIGGER_DX) / 2);
}
