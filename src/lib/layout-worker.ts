// 布局 Worker：d3-force-3d 在 Worker 线程增量 tick 3D 力导向模拟，主线程零阻塞。
// 每 SNAPSHOT_EVERY tick 回传一次坐标快照（progress 0-1），最后一条带 done: true——
// 主线程超时/异常兜底可用最近快照 applyLayout，避免读全零初始坐标导致节点坍缩原点。
// 注：不写 /// <reference lib="webworker" />——tsconfig 的 DOM lib 已提供
// self/MessageEvent/Worker 类型，混引 webworker lib 会与 DOM 全局声明冲突。
import { createGalaxySimulation, snapshotCoords, SNAPSHOT_EVERY, TICKS } from './layout-forces';
import type { LayoutNode, LayoutRequest, LayoutResult } from './layout-forces';

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const simNodes: LayoutNode[] = e.data.nodes.map((n) => ({ ...n }));
  const sim = createGalaxySimulation(simNodes, e.data.links);

  for (let ticked = SNAPSHOT_EVERY; ticked <= TICKS; ticked += SNAPSHOT_EVERY) {
    sim.tick(SNAPSHOT_EVERY); // 分批 tick 与一次性 tick(TICKS) 数值等价（deterministic）
    const result: LayoutResult = {
      coords: snapshotCoords(simNodes),
      progress: ticked / TICKS,
      done: ticked >= TICKS,
    };
    (self as unknown as Worker).postMessage(result);
  }
};
