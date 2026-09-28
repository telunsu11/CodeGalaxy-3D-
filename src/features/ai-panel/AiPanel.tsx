import { useEffect, useRef, useState } from 'react';
import { useGalaxy } from '../../app/store';
import { resolveToNodeId, extractImportSpecifiers } from '../../lib/import-resolver';
import { readSse } from './sse';

type AiState = { phase: 'idle' | 'loading-code' | 'streaming' | 'done' | 'error'; text: string; error?: string };

export function AiPanel() {
  const selected = useGalaxy((s) => s.selected);
  const meta = useGalaxy((s) => s.meta);
  const graph = useGalaxy((s) => s.graph);
  const setComets = useGalaxy((s) => s.setComets);
  const [ai, setAi] = useState<AiState>({ phase: 'idle', text: '' });
  const seqRef = useRef(0);
  const preRef = useRef<HTMLPreElement>(null);

  // 打字机 stick-to-bottom：仅当用户本来就在底部附近（40px）时跟随滚动，手动上翻不打扰
  useEffect(() => {
    const el = preRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) el.scrollTop = el.scrollHeight;
  }, [ai.text]);

  useEffect(() => {
    const seq = ++seqRef.current; // 每次运行都自增（含取消选中/切行星）：在途请求全部失去写入资格
    if (!selected || !meta) { setAi({ phase: 'idle', text: '' }); return; }
    if (selected.type !== 'moon') return; // planet 统计直接渲染，不走 AI
    const controller = new AbortController();
    setAi({ phase: 'loading-code', text: '' });
    (async () => {
      try {
        const fileRes = await fetch(`/api/file?owner=${meta.owner}&repo=${meta.repo}&branch=${meta.branch}&path=${encodeURIComponent(selected.id)}`, { signal: controller.signal });
        const file = await fileRes.json() as { content?: string; truncated?: boolean; error?: string };
        if (seq !== seqRef.current) return;
        if (!fileRes.ok || file.content == null) throw new Error(file.error ?? '无法获取源码');

        // import → 流光（nodeIds 只含 moon 文件节点，避免目录节点遮蔽 index 命中）
        if (graph) {
          const ids = new Set(graph.nodes.filter((n) => n.type === 'moon').map((n) => n.id));
          const targets = [...new Set(extractImportSpecifiers(file.content)
            .map((spec) => resolveToNodeId(selected.id, spec, ids))
            .filter((x): x is string => x != null))];
          if (targets.length > 0) setComets(targets.map((to) => ({ from: selected.id, to })));
        }

        setAi({ phase: 'streaming', text: '' });
        const sumRes = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selected.id, repoKey: `${meta.owner}/${meta.repo}`, code: file.content }),
          signal: controller.signal,
        });
        if (seq !== seqRef.current) return;
        if (sumRes.status === 501) { setAi({ phase: 'error', text: '', error: '未配置 ZHIPU_API_KEY，AI 分析不可用' }); return; }
        if (!sumRes.ok) throw new Error('AI 调用失败');
        await readSse(sumRes, (delta) => {
          if (seq !== seqRef.current) return;
          setAi((s) => ({ phase: 'streaming', text: s.text + delta }));
        });
        if (seq !== seqRef.current) return;
        setAi((s) => ({ ...s, phase: 'done' }));
      } catch (e) {
        // abort（切换选中/卸载）抛 AbortError 进这里，但此时 seq 必已过期（cleanup 先于新 effect 运行），静默丢弃
        if (seq === seqRef.current) setAi({ phase: 'error', text: '', error: (e as Error).message });
      }
    })();
    return () => controller.abort(); // 快速连点/关闭面板：掐断在途 /api/file 与 GLM 流式补全
  }, [selected, meta, graph, setComets]);

  if (!selected) return null;

  return (
    <aside className="pointer-events-auto absolute right-0 top-0 z-20 m-4 w-[22rem] rounded-xl border border-white/12 bg-black/70 p-4 font-mono text-sm text-white/90 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-sky-400/80">
            {selected.type === 'moon' ? '卫星 · 文件' : selected.type === 'planet' ? '行星 · 目录' : '恒星 · 仓库'}
          </p>
          <h2 className="mt-0.5 break-all text-base font-semibold text-white">{selected.name}</h2>
          <p className="mt-0.5 break-all text-xs text-white/45">{selected.id}</p>
        </div>
        <button onClick={() => useGalaxy.getState().selectNode(null)} className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white">关闭</button>
      </div>

      {selected.type === 'planet' && (
        <dl className="mt-4 space-y-1.5 text-xs text-white/70">
          <div className="flex justify-between"><dt>递归文件数</dt><dd className="text-white">{selected.childCount}</dd></div>
          <div className="flex justify-between"><dt>聚合为星云</dt><dd className="text-white">{selected.overflowCount} 个文件</dd></div>
          <div className="flex justify-between"><dt>轨道深度</dt><dd className="text-white">L{selected.depth}</dd></div>
        </dl>
      )}
      {selected.type === 'star' && (
        <p className="mt-4 text-xs leading-relaxed text-white/70">仓库核心。点击行星查看目录统计，点击卫星召唤 AI 分析。</p>
      )}

      {selected.type === 'moon' && (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-xs text-white/50">
            {ai.phase === 'loading-code' && <span>正在获取源码…</span>}
            {ai.phase === 'streaming' && <span className="animate-pulse text-sky-300">AI 分析中…</span>}
          </div>
          {ai.error && <p className="mt-2 text-xs text-rose-400">{ai.error}</p>}
          {ai.text && <pre ref={preRef} className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-emerald-100/90">{ai.text}</pre>}
        </div>
      )}
    </aside>
  );
}
