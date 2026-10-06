import { parseRetentionDays } from './retention.util';

describe('parseRetentionDays', () => {
  it.each([
    [undefined, 90, 90],
    ['', 90, 90],
    [undefined, 7, 7],
    ['1', 90, 1],
    [' 365 ', 7, 365],
    ['0', 90, null],
    ['1e3', 7, null],
  ])('%p with fallback %p → %p', (raw, fallback, expected) => {
    expect(parseRetentionDays(raw, fallback)).toBe(expected);
  });
});
