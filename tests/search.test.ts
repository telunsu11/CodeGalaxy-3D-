import { describe, expect, it } from 'vitest';
import { searchNodes } from '../src/features/search/SearchPanel';
import type { GalaxyNode } from '../src/lib/types';

const N = (id: string, type: GalaxyNode['type']): GalaxyNode => ({
  id, name: id.split('/').pop()!, type, depth: 1, size: 0, langColor: '#7d8590',
  childCount: 0, overflowCount: 0, x: 0, y: 0, z: 0,
});

describe('searchNodes', () => {
  const nodes = [
    N('repo:o/r', 'star'),
    N('src', 'planet'),
    N('src/utils', 'planet'),
    N('src/utils/store.ts', 'moon'),
    N('src/store.ts', 'moon'),
    N('README.md', 'moon'),
  ];

  it('空查询返回空数组', () => {
    expect(searchNodes(nodes, '')).toEqual([]);
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });
  it('大小写不敏感子串匹配 name 与 id', () => {
    const r = searchNodes(nodes, 'STORE').map((n) => n.id);
    expect(r).toContain('src/utils/store.ts');
    expect(r).toContain('src/store.ts'); // id 'src/store.ts' 含 'store'
  });
  it('name 命中优先于仅路径命中', () => {
    const r = searchNodes(nodes, 'store');
    expect(r[0]!.id).toBe('src/utils/store.ts'); // name 直接命中排最前
  });
  it('moon 排在 planet/star 之前（同命中层级）', () => {
    const r = searchNodes(nodes, 'src');
    expect(r[r.length - 1]!.type).not.toBe('moon');
  });
  it('结果上限 30', () => {
    const many = Array.from({ length: 50 }, (_, i) => N(`f/mod-${i}.ts`, 'moon'));
    expect(searchNodes(many, 'mod-')).toHaveLength(30);
  });
  it('无匹配返回空数组', () => {
    expect(searchNodes(nodes, 'zzz-not-exist')).toEqual([]);
  });
});
