import { useGalaxy } from '../../app/store';

export function AnomalyScan() {
  const scan = useGalaxy((s) => s.scan);
  const runScan = useGalaxy((s) => s.runScan);
  const clearScan = useGalaxy((s) => s.clearScan);
  const graph = useGalaxy((s) => s.graph);
  const selectNode = useGalaxy((s) => s.selectNode);
  if (!graph) return null;

  const holes = (scan?.verdicts ?? []).filter((v) => v.score <= 4).sort((a, b) => a.score - b.score);

  return (
    <div className="pointer-events-none absolute bottom-0 right-0 z-20 flex w-[22rem] flex-col gap-3 p-4">
      {scan && !scan.running && (
        <section className="pointer-events-auto max-h-[46vh] overflow-y-auto rounded-xl border border-orange-400/25 bg-black/70 p-4 text-sm backdrop-blur-md">
          <header className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-orange-300">黑洞清单 {holes.length > 0 && <span className="text-orange-200/70">× {holes.length}</span>}</h3>
            <button onClick={clearScan} className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white">撤销扫描</button>
          </header>
          {scan.degraded && <p className="mb-2 text-xs text-amber-300/90">GLM 不可用，以下为启发式降级结果</p>}
          {holes.length === 0 && <p className="text-xs text-white/60">未发现严重劣质文件，星系洁净 ✨</p>}
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
