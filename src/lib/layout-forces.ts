// 力导向布局的共享配置与工具：layout-worker.ts 与 tests/layout-sim.test.ts 同源引用，
// 避免测试手抄力参数导致漂移（此前测试硬编码 planet charge -230 恰好等于公式值）。
// 纯逻辑模块，不触碰 self/DOM，可在 node 中直接 import。
import { forceSimulation, forceLink, forceManyBody, forceRadial } from 'd3-force-3d';
import type { Simulation, SimulationNode } from 'd3-force-3d';

/** 主线程 → Worker 的布局请求 */
export interface LayoutRequest {
  nodes: LayoutNode[];
  links: LayoutLink[];
}

/** Worker → 主线程的增量坐标快照 */
export interface LayoutResult {
  coords: Array<{ id: string; x: number; y: number; z: number }>;
  progress: number; // 0-1，已完成 tick 比例
  done: boolean; // true = 布局完成（最后一条消息）
}

export interface LayoutLink {
  source: string;
  target: string;
}

export interface LayoutNode extends SimulationNode {
  type: string;
  depth: number;
  childCount: number;
}

/** 按 depth 的径向分层半径 */
export const RADII = [0, 60, 130, 210, 300, 400, 510];
export const TICKS = 300;
/** 每 N tick 回传一次坐标快照 */
export const SNAPSHOT_EVERY = 50;

/** 组装星系力导向模拟（已 stop，由调用方驱动 tick） */
export function createGalaxySimulation(nodes: LayoutNode[], links: LayoutLink[]): Simulation {
  const idSet = new Set(nodes.map((n) => n.id));
  const simLinks = links
    .filter((l) => idSet.has(l.source) && idSet.has(l.target)) // 防御悬空边
    .map((l) => ({ ...l }));

  return forceSimulation(nodes, 3)
    .force('link', forceLink(simLinks)
      .id((d: { id: string }) => d.id)
      .distance((l: { source: { type: string }; target: { type: string } }) =>
        l.target.type === 'planet' ? 40 : l.source.type === 'star' ? 55 : 14)
      .strength(0.9))
    .force('charge', forceManyBody().strength((d: LayoutNode) =>
      d.type === 'star' ? -900 : d.type === 'planet' ? -(150 + Math.min(400, d.childCount * 4)) : -18))
    // forceRadial 第 2-4 参是中心坐标而非 strength，默认原点即可
    .force('radial', forceRadial((d: { depth: number }) => RADII[Math.min(d.depth, RADII.length - 1)] * 1.4)
      .strength(0.5))
    .stop();
}

/** 读取节点当前坐标快照（缺省补 0） */
export function snapshotCoords(nodes: LayoutNode[]): LayoutResult['coords'] {
  return nodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }));
}
