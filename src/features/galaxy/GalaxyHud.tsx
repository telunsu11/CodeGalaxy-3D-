import { useMemo } from 'react';
import { useGalaxy } from '../../app/store';
import { langNameForPath } from '../../lib/lang-color';

/** 左下 HUD：当前仓库语言分布图例（卫星颜色含义）+ 操作指南 */
export function GalaxyHud() {
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const deps = useGalaxy((s) => s.deps);
  const toggleDeps = useGalaxy((s) => s.toggleDeps);

  const langs = useMemo(() => {
    if (!graph) return [];
    const counts = new Map<string, { count: number; color: string }>();
    let total = 0;
    for (const n of graph.nodes) {
      if (n.type !== 'moon') continue;
      total++;
      const name = langNameForPath(n.id) ?? '其他';
      const prev = counts.get(name);
      counts.set(name, { count: (prev?.count ?? 0) + 1, color: prev?.color ?? n.langColor });
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6)
      .map(([name, v]) => ({ name, ...v, pct: total > 0 ? Math.round((v.count / total) * 100) : 0 }));
  }, [graph]);

  if (!graph || status !== 'ready') return null;

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 z-20 m-4 w-64 space-y-2.5">
      {langs.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#0a0e1d]/70 p-3.5 shadow-xl shadow-black/40 backdrop-blur-xl">
          <p className="text-[10px] uppercase tracking-widest text-white/40">语言分布 · 卫星颜色</p>
          <ul className="mt-2 space-y-1.5">
            {langs.map((l) => (
              <li key={l.name} className="flex items-center gap-2 text-xs">
                <span className="inline-block size-2.5 shrink-0 rounded-full shadow" style={{ backgroundColor: l.color, boxShadow: `0 0 6px ${l.color}66` }} />
                <span className="text-white/80">{l.name}</span>
                <span className="ml-auto tabular-nums text-white/35">{l.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pointer-events-auto">
        <button
          onClick={() => void toggleDeps()}
          disabled={deps?.loading}
          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur-xl transition disabled:opacity-60 ${
            deps && !deps.loading
              ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
              : 'border-white/10 bg-[#0a0e1d]/70 text-white/60 hover:border-violet-400/40 hover:text-violet-200'
          }`}
        >
          <span className="text-sm leading-none">⇄</span>
          {deps?.loading
            ? '解析依赖中…（拉取源码）'
            : deps
              ? `依赖全景 · ${deps.edges.length} 条 import 连线（点击关闭）`
              : '依赖全景（解析核心文件的 import）'}
        </button>
      </div>
      <p className="pl-1 text-[11px] tracking-wide text-white/30">
        拖拽旋转 · 滚轮缩放 · 悬停查看 · 点击聚焦 · 双击开 GitHub
      </p>
    </div>
  );
}
