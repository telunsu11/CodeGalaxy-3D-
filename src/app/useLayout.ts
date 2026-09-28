import { useEffect } from 'react';
import { useGalaxy } from './store';

/**
 * status 进入 'layout' 后起 Worker 计算 3D 力导向布局；
 * 完成回写 applyLayout → status 'ready'。10s 超时兜底：终止 Worker，
 * 用节点当前坐标直接进入 ready，避免 UI 卡在布局态。
 */
export function useLayout() {
  const status = useGalaxy((s) => s.status);
  const graph = useGalaxy((s) => s.graph);
  const applyLayout = useGalaxy((s) => s.applyLayout);

  useEffect(() => {
    if (status !== 'layout' || !graph) return;
    const worker = new Worker(new URL('../lib/layout-worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      applyLayout(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })));
    }, 10_000);
    worker.onmessage = (e: MessageEvent<Array<{ id: string; x: number; y: number; z: number }>>) => {
      clearTimeout(timer);
      applyLayout(e.data);
      worker.terminate();
    };
    worker.postMessage({
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, depth: n.depth, childCount: n.childCount })),
      links: graph.links,
    });
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [status, graph, applyLayout]);
}
