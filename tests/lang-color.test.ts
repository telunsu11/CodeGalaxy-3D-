import { describe, expect, it } from 'vitest';
import { colorForPath } from '../src/lib/lang-color';

describe('colorForPath', () => {
  it('按扩展名返回语言色', () => {
    expect(colorForPath('src/a.ts')).toBe('#3178c6');
    expect(colorForPath('b.py')).toBe('#3572A5');
    expect(colorForPath('c.md')).toBe('#8b949e');
  });
  it('未知扩展名返回中性灰', () => {
    expect(colorForPath('weird.xyz')).toBe('#7d8590');
    expect(colorForPath('noext')).toBe('#7d8590');
  });
});
