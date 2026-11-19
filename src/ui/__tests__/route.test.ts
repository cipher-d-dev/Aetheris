import {describe, expect, it} from '@jest/globals';
import {routeText} from '../route';

const name = (id: string) => ({a: 'Ana', b: 'Ben'}[id] ?? id.toUpperCase());

describe('routeText', () => {
  it('is empty when the route is unknown', () => {
    expect(routeText(undefined, true, 'me', name)).toBe('');
  });
  it('names relays for outbound messages', () => {
    expect(routeText(['a', 'xyz'], true, 'me', name)).toBe('Reached them through: Ana, XYZ.');
  });
  it('names relays for inbound messages', () => {
    expect(routeText(['b'], false, 'me', name)).toBe('Came through: Ben.');
  });
  it('says direct for an empty route', () => {
    expect(routeText([], true, 'me', name)).toBe('It went straight to them.');
    expect(routeText([], false, 'me', name)).toBe('Came directly from them.');
  });
  it('hides your own id, and is direct if only that remains', () => {
    expect(routeText(['me', 'a'], false, 'me', name)).toBe('Came through: Ana.');
    expect(routeText(['me'], true, 'me', name)).toBe('It went straight to them.');
  });
  it('caps long routes', () => {
    expect(routeText(['1', '2', '3', '4', '5', '6', '7'], false, 'me', name)).toBe(
      'Came through: 1, 2, 3, 4, 5 and 2 more.',
    );
  });
});
