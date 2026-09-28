import { useMemo } from 'react';
import { useGalaxy } from '../../app/store';
import { BLACK_HOLE_SCORE_MAX } from '../../lib/types';

export function AnomalyScan() {
  const scan = useGalaxy((s) => s.scan);
  const runScan = useGalaxy((s) => s.runScan);
  const clearScan = useGalaxy((s) => s.clearScan);
  const graph = useGalaxy((s) => s.graph);
  const selectNode = useGalaxy((s) => s.selectNode);

  // 注意：所有 useMemo 必须位于提前 return 之前，保证 hooks 顺序稳定（graph 由 null 变为有值）
  const nodeIds = useMemo(() => new Set((graph?.nodes ?? []).map((n) => n.id)), [graph]);
  const allHoles = useMemo(
    () => (scan?.verdicts ?? []).filter((v) => v.score <= BLACK_HOLE_SCORE_MAX).sort((a, b) => a.score - b.score),
    [scan],
  );
  // 只渲染图中存在的条目：被 top-K 聚合掉的文件在星系中无节点，点击无法聚焦
  const holes = useMemo(() => allHoles.filter((v) => nodeIds.has(v.path)), [allHoles, nodeIds]);
  const hiddenCount = allHoles.length - holes.length;
  if (!graph) return null;

  return (
    <div className="pointer-events-none absolute bottom-0 right-0 z-20 flex w-[22rem] flex-col gap-3 p-4">
      {scan && !scan.running && (
        <section className="pointer-events-auto max-h-[46vh] overflow-y-auto rounded-xl border border-orange-400/25 bg-black/70 p-4 text-sm backdrop-blur-md">
          <header className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-orange-300">黑洞清单 {holes.length > 0 && <span className="text-orange-200/70">× {holes.length}</span>}</h3>
            <button onClick={clearScan} className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white">撤销扫描</button>
          </header>
          {scan.degraded && <p className="mb-2 text-xs text-amber-300/90">GLM 不可用，以下为启发式降级结果</p>}
          {allHoles.length === 0 && <p className="text-xs text-white/60">未发现严重劣质文件，星系洁净 ✨</p>}
          <ul className="space-y-2">
            {holes.map((v) => (
              <li key={v.path}>
                <button onClick={() => { const n = graph.nodes.find((x) => x.id === v.path); if (n) selectNode(n); }} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-orange-400/40">
                  <p className="break-all font-mono text-xs text-white/90">{v.path}</p>
                  <p className="mt-0.5 text-xs text-orange-300">评分 {v.score}/10 · {v.reason}</p>
                </button>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && <p className="mt-2 text-xs text-white/45">另有 {hiddenCount} 个异常文件因聚合未在星系中显示</p>}
        </section>
      )}
      <div className="pointer-events-auto flex justify-end">
        <button
          onClick={() => void runScan()}
          disabled={scan?.running}
          className="rounded-lg border border-orange-400/40 bg-black/60 px-4 py-2 text-sm text-orange-200 backdrop-blur transition hover:bg-orange-500/20 disabled:opacity-50"
        >
          {scan?.running ? '扫描中…（拉取 + AI 评审）' : '🕳️ 扫描异常（黑洞巡查）'}
        </button>
      </div>
    </div>
  );
}
