import {describe, expect, it} from '@jest/globals';
import {shouldClaimSwipe, swipeOffset, swipeTriggersReply} from '../swipe';

describe('shouldClaimSwipe', () => {
  it('claims a clear rightward horizontal drag', () => {
    expect(shouldClaimSwipe({dx: 20, dy: 3, x0: 100})).toBe(true);
  });
  it('ignores small drags', () => {
    expect(shouldClaimSwipe({dx: 12, dy: 0, x0: 100})).toBe(false);
  });
  it('ignores leftward drags', () => {
    expect(shouldClaimSwipe({dx: -40, dy: 0, x0: 100})).toBe(false);
  });
  it('leaves mostly vertical drags to the list', () => {
    expect(shouldClaimSwipe({dx: 30, dy: 20, x0: 100})).toBe(false);
    expect(shouldClaimSwipe({dx: 30, dy: 15, x0: 100})).toBe(false);
  });
  it('leaves the left edge to the system back gesture', () => {
    expect(shouldClaimSwipe({dx: 40, dy: 0, x0: 10})).toBe(false);
    expect(shouldClaimSwipe({dx: 40, dy: 0, x0: 24})).toBe(false);
    expect(shouldClaimSwipe({dx: 40, dy: 0, x0: 25})).toBe(true);
  });
});

describe('swipeTriggersReply', () => {
  it('needs more than 60px', () => {
    expect(swipeTriggersReply(60)).toBe(false);
    expect(swipeTriggersReply(61)).toBe(true);
    expect(swipeTriggersReply(-80)).toBe(false);
  });
});

describe('swipeOffset', () => {
  it('follows 1:1, resists past 60 and clamps at 80', () => {
    expect(swipeOffset(-5)).toBe(0);
    expect(swipeOffset(40)).toBe(40);
    expect(swipeOffset(80)).toBe(70);
    expect(swipeOffset(500)).toBe(80);
  });
});
