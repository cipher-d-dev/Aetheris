const MAX_NAMES = 5;

/**
 * Sentence describing the relay phones a message passed through, or '' when the
 * route is unknown (undefined). `route` holds relay ids only: for outbound
 * messages it comes from the ACK path, for inbound ones from routing.hops.
 */
export function routeText(
  route: string[] | undefined,
  isOutbound: boolean,
  selfId: string,
  nameOf: (id: string) => string,
): string {
  if (!route) return '';
  const relays = route.filter(id => id !== selfId);
  if (relays.length === 0) return isOutbound ? 'It went straight to them.' : 'Came directly from them.';
  const names = relays.slice(0, MAX_NAMES).map(nameOf).join(', ');
  const more = relays.length > MAX_NAMES ? ` and ${relays.length - MAX_NAMES} more` : '';
  return `${isOutbound ? 'Reached them through' : 'Came through'}: ${names}${more}.`;
}
