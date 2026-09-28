import { describe, expect, it } from 'vitest';
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d';
import type { SimulationNode } from 'd3-force-3d';
import {
  createGalaxySimulation,
  snapshotCoords,
  SNAPSHOT_EVERY,
  TICKS,
} from '../src/lib/layout-forces';
import type { LayoutNode, LayoutResult } from '../src/lib/layout-forces';

/**
 * d3-force-3d 冒烟测试——类型 shim 只保证编译，这里真跑包本体验证运行时行为。
 * 力参数从 src/lib/layout-forces.ts 同源引用（Worker 也用这份），不会手抄漂移。
 * 注：不能 import layout-worker.ts（它在模块顶层赋值 self.onmessage，node 无 self），
 * 故在主线程复跑 Worker 的同等逻辑。
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

  it('共享力配置（与 Worker 同源）：有限坐标、星体居中、悬空边过滤、depth clamp', () => {
    const nodes: LayoutNode[] = [
      { id: 'repo:o/r', type: 'star', depth: 0, childCount: 0 },
      { id: 'src', type: 'planet', depth: 1, childCount: 20 },
      { id: 'a.ts', type: 'moon', depth: 2, childCount: 0 },
      { id: 'deep.ts', type: 'moon', depth: 99, childCount: 0 }, // 越界 depth 走 clamp
    ];
    const links = [
      { source: 'repo:o/r', target: 'src' },
      { source: 'src', target: 'a.ts' },
      { source: 'a.ts', target: 'deep.ts' },
      { source: 'ghost', target: 'src' }, // 悬空边应被过滤，不抛错
    ];
    const sim = createGalaxySimulation(nodes, links);
    sim.tick(TICKS);

    const dist = (n: LayoutNode) => Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.z)).toBe(true);
    }
    // 星体被径向力约束在中心，planet 分层在外圈
    expect(dist(nodes[0])).toBeLessThan(dist(nodes[1]));
    expect(dist(nodes[1])).toBeGreaterThan(0);
  });

  it('增量快照循环与一次性 tick 数值等价，最后一条 done', () => {
    const mkNodes = (): LayoutNode[] => [
      { id: 's', type: 'star', depth: 0, childCount: 0 },
      { id: 'p', type: 'planet', depth: 1, childCount: 5 },
      { id: 'm', type: 'moon', depth: 2, childCount: 0 },
    ];
    const links = [{ source: 's', target: 'p' }, { source: 'p', target: 'm' }];

    const once = mkNodes();
    createGalaxySimulation(once, links).tick(TICKS);

    // 复刻 Worker 的分批 tick + 快照协议
    const batched = mkNodes();
    const sim = createGalaxySimulation(batched, links);
    const snapshots: LayoutResult[] = [];
    for (let ticked = SNAPSHOT_EVERY; ticked <= TICKS; ticked += SNAPSHOT_EVERY) {
      sim.tick(SNAPSHOT_EVERY);
      snapshots.push({ coords: snapshotCoords(batched), progress: ticked / TICKS, done: ticked >= TICKS });
    }

    expect(snapshots).toHaveLength(TICKS / SNAPSHOT_EVERY);
    const final = snapshots[snapshots.length - 1];
    expect(final.done).toBe(true);
    expect(final.progress).toBe(1);
    for (let i = 0; i < once.length; i++) {
      expect(final.coords[i].x).toBeCloseTo(once[i].x ?? 0, 6);
      expect(final.coords[i].y).toBeCloseTo(once[i].y ?? 0, 6);
      expect(final.coords[i].z).toBeCloseTo(once[i].z ?? 0, 6);
    }
  });
});
