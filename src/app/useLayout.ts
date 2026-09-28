import { useEffect } from 'react';
import { useGalaxy } from './store';
import type { LayoutResult } from '../lib/layout-forces';

/**
 * status 进入 'layout' 后起 Worker 计算 3D 力导向布局。
 * Worker 每 50 tick 增量回传坐标快照，最后一条带 done: true → applyLayout → 'ready'。
 * 兜底（10s 超时 / Worker 异常）：用最近一次快照 applyLayout（万级节点慢机上
 * 布局未完成但已接近收敛，绝不回退到全零初始坐标）；若无任何快照则进入 error
 * 态提示用户，避免卡在布局态。
 */
export function useLayout() {
  const status = useGalaxy((s) => s.status);
  const graph = useGalaxy((s) => s.graph);
  const applyLayout = useGalaxy((s) => s.applyLayout);

  useEffect(() => {
    if (status !== 'layout' || !graph) return;
    // 最近一次增量快照（effect 闭包私有，随 effect 生命周期重置）
    let latest: LayoutResult['coords'] | null = null;
    const fail = (message: string) => useGalaxy.setState({ status: 'error', error: message });

    const worker = new Worker(new URL('../lib/layout-worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      if (useGalaxy.getState().status !== 'layout') return; // 换仓库瞬间旧 worker 在途消息守卫
      worker.terminate();
      if (latest) applyLayout(latest);
      else fail('布局计算超时，请重试');
    }, 10_000);

    worker.onmessage = (e: MessageEvent<LayoutResult>) => {
      if (useGalaxy.getState().status !== 'layout') return;
      latest = e.data.coords;
      useGalaxy.setState({ layoutProgress: e.data.progress });
      if (e.data.done) {
        clearTimeout(timer);
        applyLayout(e.data.coords);
        worker.terminate();
      }
    };

    worker.onerror = (e: ErrorEvent) => {
      if (useGalaxy.getState().status !== 'layout') return;
      clearTimeout(timer);
      worker.terminate();
      if (latest) applyLayout(latest);
      else fail(`布局线程异常：${e.message || '未知错误'}`);
    };

    worker.postMessage({
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, depth: n.depth, childCount: n.childCount })),
      links: graph.links,
    });
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [status, graph, applyLayout]);
}
