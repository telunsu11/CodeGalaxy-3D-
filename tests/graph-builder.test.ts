import { describe, expect, it } from 'vitest';
import { buildGraph, isIgnored } from '../src/lib/graph-builder';
import type { TreeEntry } from '../src/lib/types';

const E: (path: string, type: 'blob' | 'tree', size?: number) => TreeEntry = (path, type, size) => ({ path, type, size });

describe('isIgnored', () => {
  it('过滤依赖/构建产物/二进制/lock', () => {
    expect(isIgnored('node_modules/foo/index.js')).toBe(true);
    expect(isIgnored('src/.git/config')).toBe(true);
    expect(isIgnored('dist/bundle.js')).toBe(true);
    expect(isIgnored('logo.png')).toBe(true);
    expect(isIgnored('package-lock.json')).toBe(true);
    expect(isIgnored('src/App.tsx')).toBe(false);
    expect(isIgnored('src/components')).toBe(false);
  });

  it('嵌套依赖/构建目录同样被过滤（段匹配，非根锚定）', () => {
    expect(isIgnored('packages/a/node_modules/x.js')).toBe(true);
    expect(isIgnored('apps/web/dist/main.js')).toBe(true);
    expect(isIgnored('tools/pkg/build/out.js')).toBe(true);
    expect(isIgnored('libs/vendor/lib.js')).toBe(true);
    expect(isIgnored('tests/coverage/x.js')).toBe(true);
  });

  it('相似名目录不误伤', () => {
    expect(isIgnored('.github')).toBe(false);
    expect(isIgnored('.github/workflows/ci.yml')).toBe(false);
    expect(isIgnored('src/distribute/index.js')).toBe(false);
  });
});

describe('buildGraph', () => {
  const entries: TreeEntry[] = [
    E('src', 'tree'),
    E('src/utils', 'tree'),
    E('src/main.ts', 'blob', 100),
    E('src/utils/a.ts', 'blob', 300),
    E('src/utils/b.ts', 'blob', 200),
    E('src/utils/c.ts', 'blob', 150),
    E('README.md', 'blob', 50),
    E('node_modules/x.js', 'blob', 999),
  ];

  it('star/planet/moon 三类节点与归属边', () => {
    const g = buildGraph(entries, 'owner/repo');
    const star = g.nodes.find((n) => n.type === 'star')!;
    expect(star.id).toBe('repo:owner/repo');
    expect(star.depth).toBe(0);
    expect(g.nodes.filter((n) => n.type === 'planet').map((n) => n.id)).toEqual(['src', 'src/utils']);
    // top-K 未触发（5 < 8），未被 ignore 的 blob 全部成为 moon
    expect(g.nodes.filter((n) => n.type === 'moon')).toHaveLength(5);
    expect(g.links).toContainEqual({ source: 'src', target: 'src/utils' });
    expect(g.links).toContainEqual({ source: 'src/utils', target: 'src/utils/a.ts' });
    expect(g.links).toContainEqual({ source: 'repo:owner/repo', target: 'src' });
    expect(g.links).toContainEqual({ source: 'repo:owner/repo', target: 'README.md' });
  });

  it('planet 的 childCount 统计递归文件、overflowCount 统计被聚合文件', () => {
    const many: TreeEntry[] = [E('pkg', 'tree'), ...Array.from({ length: 10 }, (_, i) => E(`pkg/f${i}.ts`, 'blob', i))];
    const g = buildGraph(many, 'o/r');
    const pkg = g.nodes.find((n) => n.id === 'pkg')!;
    expect(pkg.childCount).toBe(10);
    expect(pkg.overflowCount).toBe(2);
    expect(g.nodes.filter((n) => n.type === 'moon')).toHaveLength(8);
    expect(g.nodes.some((n) => n.id === 'pkg/f0.ts')).toBe(false);
    expect(g.nodes.some((n) => n.id === 'pkg/f9.ts')).toBe(true);
  });

  it('全局 moon 上限 2500 触发时按比例缩减 K', () => {
    const many: TreeEntry[] = [];
    for (let d = 0; d < 400; d++) {
      many.push(E(`p${d}`, 'tree'));
      for (let f = 0; f < 10; f++) many.push(E(`p${d}/f${f}.ts`, 'blob', f));
    }
    const g = buildGraph(many, 'o/r');
    expect(g.nodes.filter((n) => n.type === 'moon').length).toBeLessThanOrEqual(2500);
  });

  it('深度正确（根目录文件 depth=1，子目录文件 depth=2）', () => {
    const g = buildGraph(entries, 'owner/repo');
    expect(g.nodes.find((n) => n.id === 'README.md')!.depth).toBe(1);
    expect(g.nodes.find((n) => n.id === 'src/utils/a.ts')!.depth).toBe(2);
  });

  it('commit（子模块）条目被过滤', () => {
    const withSub: TreeEntry[] = [...entries, { path: 'vendor/lib', type: 'commit' }];
    const g = buildGraph(withSub, 'owner/repo');
    expect(g.nodes.some((n) => n.id === 'vendor/lib')).toBe(false);
  });

  it('空态契约：无条目或全被过滤 → 恰好 1 个 star、0 条边', () => {
    const empty = buildGraph([], 'o/r');
    expect(empty.nodes).toHaveLength(1);
    expect(empty.nodes[0].type).toBe('star');
    expect(empty.links).toHaveLength(0);

    const allIgnored = buildGraph(
      [
        E('node_modules', 'tree'),
        E('node_modules/x.js', 'blob', 1),
        E('assets', 'tree'),
        E('assets/logo.png', 'blob', 2),
      ],
      'o/r',
    );
    expect(allIgnored.nodes).toHaveLength(1);
    expect(allIgnored.nodes[0].type).toBe('star');
    expect(allIgnored.links).toHaveLength(0);
  });

  it('k 缩减后 overflowCount 按缩减后的 k 计算（目录数 >1250，k 触底为 2）', () => {
    const many: TreeEntry[] = [];
    for (let d = 0; d < 1260; d++) {
      many.push(E(`p${d}`, 'tree'));
      for (let f = 0; f < 10; f++) many.push(E(`p${d}/f${f}.ts`, 'blob', f));
    }
    const g = buildGraph(many, 'o/r');
    // total = 12600 → k = max(2, ceil(8 * 2500 / 12600)) = 2，每目录保留 2 个 moon
    expect(g.nodes.filter((n) => n.type === 'moon')).toHaveLength(1260 * 2);
    const pkg = g.nodes.find((n) => n.id === 'p7')!;
    expect(pkg.childCount).toBe(10);
    expect(pkg.overflowCount).toBe(10 - 2);
  });

  it('同目录全同 size 时 moon 输出序列确定（两次调用一致）', () => {
    const same: TreeEntry[] = [E('eq', 'tree'), ...Array.from({ length: 12 }, (_, i) => E(`eq/f${i}.ts`, 'blob', 42))];
    const idsOf = (g: ReturnType<typeof buildGraph>) => g.nodes.filter((n) => n.type === 'moon').map((n) => n.id);
    expect(idsOf(buildGraph(same, 'o/r'))).toEqual(idsOf(buildGraph(same, 'o/r')));
    // 稳定排序保持输入顺序，top-8 取前 8 个
    expect(idsOf(buildGraph(same, 'o/r'))).toEqual(['eq/f0.ts', 'eq/f1.ts', 'eq/f2.ts', 'eq/f3.ts', 'eq/f4.ts', 'eq/f5.ts', 'eq/f6.ts', 'eq/f7.ts']);
  });
});
