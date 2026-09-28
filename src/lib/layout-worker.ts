// 布局 Worker：d3-force-3d 在 Worker 线程跑满 300 tick 的 3D 力导向模拟，
// 主线程只收最终坐标，零阻塞。
// 注：不写 /// <reference lib="webworker" />——tsconfig 的 DOM lib 已提供
// self/MessageEvent/Worker 类型，混引 webworker lib 会与 DOM 全局声明冲突。
import { forceSimulation, forceLink, forceManyBody, forceRadial } from 'd3-force-3d';
import type { SimulationNode } from 'd3-force-3d';

export interface LayoutRequest {
  nodes: Array<{ id: string; type: string; depth: number; childCount: number }>;
  links: Array<{ source: string; target: string }>;
}

const RADII = [0, 60, 130, 210, 300, 400, 510]; // 按 depth 的径向分层半径
const TICKS = 300;

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { nodes, links } = e.data;
  const simNodes: SimulationNode[] = nodes.map((n) => ({ ...n }));
  const idSet = new Set(nodes.map((n) => n.id));
  const simLinks = links
    .filter((l) => idSet.has(l.source) && idSet.has(l.target)) // 防御悬空边
    .map((l) => ({ ...l }));

  const sim = forceSimulation(simNodes, 3)
    .force('link', forceLink(simLinks)
      .id((d: { id: string }) => d.id)
      .distance((l: { source: { type: string }; target: { type: string } }) =>
        l.target.type === 'planet' ? 40 : l.source.type === 'star' ? 55 : 14)
      .strength(0.9))
    .force('charge', forceManyBody().strength((d: { type: string; childCount?: number }) =>
      d.type === 'star' ? -900 : d.type === 'planet' ? -(150 + Math.min(400, (d.childCount ?? 0) * 4)) : -18))
    // forceRadial 第 2-4 参是中心坐标而非 strength，默认原点即可
    .force('radial', forceRadial((d: { depth: number }) => RADII[Math.min(d.depth, RADII.length - 1)] * 1.4)
      .strength(0.5))
    .stop();

  sim.tick(TICKS);

  const coords = simNodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }));
  (self as unknown as Worker).postMessage(coords);
};
