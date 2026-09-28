import { describe, expect, it } from 'vitest';
import { forceSimulation, forceLink, forceManyBody, forceRadial } from 'd3-force-3d';
import type { SimulationNode } from 'd3-force-3d';

/**
 * d3-force-3d 冒烟测试——类型 shim 只保证编译，这里真跑包本体验证运行时行为。
 * 注：不能 import layout-worker.ts（它在模块顶层赋值 self.onmessage，node 无 self），
 * 故用与 Worker 相同的力参数在主线程复跑。
 */

describe('d3-force-3d 冒烟', () => {
  it('最小模拟收敛到有限坐标', () => {
    const nodes: SimulationNode[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const links = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    const sim = forceSimulation(nodes, 3)
      .force('link', forceLink(links).id((d: { id: string }) => d.id).distance(10).strength(0.9))
      .force('charge', forceManyBody().strength(-50))
      .stop();
    sim.tick(50);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.z)).toBe(true);
    }
    expect(nodes.some((n) => (n.x ?? 0) !== 0)).toBe(true);
  });

  it('Worker 同款力参数（径向分层）产生有限坐标且星体居中', () => {
    const RADII = [0, 60, 130, 210, 300, 400, 510];
    const nodes: SimulationNode[] = [
      { id: 'repo:o/r', type: 'star', depth: 0 },
      { id: 'src', type: 'planet', depth: 1, childCount: 20 },
      { id: 'a.ts', type: 'moon', depth: 2 },
    ];
    const links = [
      { source: 'repo:o/r', target: 'src' },
      { source: 'src', target: 'a.ts' },
    ];
    const sim = forceSimulation(nodes, 3)
      .force('link', forceLink(links)
        .id((d: { id: string }) => d.id)
        .distance((l: { target: { type: string } }) => (l.target.type === 'planet' ? 40 : 14))
        .strength(0.9))
      .force('charge', forceManyBody().strength((d: { type: string; childCount?: number }) =>
        d.type === 'star' ? -900 : d.type === 'planet' ? -230 : -18))
      .force('radial', forceRadial((d: { depth: number }) => RADII[d.depth] * 1.4).strength(0.5))
      .stop();
    sim.tick(300);

    const dist = (n: SimulationNode) => Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.z)).toBe(true);
    }
    const star = nodes[0];
    const planet = nodes[1];
    // 星体被径向力约束在中心，planet 分层在外圈
    expect(dist(star)).toBeLessThan(dist(planet));
    expect(dist(planet)).toBeGreaterThan(0);
  });
});
