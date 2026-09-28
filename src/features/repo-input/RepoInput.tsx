import { useState } from 'react';
import { parseRepoInput, useGalaxy } from '../../app/store';

const EXAMPLES = [
  { label: 'vuejs/pinia', owner: 'vuejs', repo: 'pinia' },
  { label: 'd3/d3-force', owner: 'd3', repo: 'd3-force' },
  { label: 'sindresorhus/is', owner: 'sindresorhus', repo: 'is' },
];

export function RepoInput() {
  const [text, setText] = useState('');
  const loadRepo = useGalaxy((s) => s.loadRepo);
  const status = useGalaxy((s) => s.status);
  const error = useGalaxy((s) => s.error);
  const meta = useGalaxy((s) => s.meta);
  const truncated = useGalaxy((s) => s.truncated);
  const layoutProgress = useGalaxy((s) => s.layoutProgress);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = status === 'loading' || status === 'layout';

  const submit = (owner: string, repo: string) => {
    setLocalError(null);
    void loadRepo(owner, repo);
  };

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full flex-col items-start gap-2.5 p-4">
      <div className="pointer-events-auto w-[26rem] rounded-2xl border border-white/10 bg-[#0a0e1d]/75 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
        <p className="mb-2 select-none pl-1 font-mono text-[11px] font-semibold tracking-[0.25em] text-sky-300/70">CODEGALAXY <span className="text-white/30">3D</span></p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseRepoInput(text);
            if (!parsed) return setLocalError('格式不对：请输入 owner/repo 或 GitHub 仓库链接');
            submit(parsed.owner, parsed.repo);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="owner/repo 或 GitHub 链接"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-3.5 py-2 font-mono text-sm text-white placeholder:text-white/30 transition focus:border-sky-400/60 focus:bg-black/70 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-gradient-to-b from-sky-400 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-sky-900/40 transition hover:from-sky-300 hover:to-sky-500 disabled:opacity-50"
          >
            {busy ? '构建中…' : '生成星系'}
          </button>
        </form>
        {/* 布局进度条（Worker 增量快照回传的 progress） */}
        {status === 'layout' && (
          <div className="mt-2.5 px-1">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-400 transition-[width] duration-300" style={{ width: `${Math.round(layoutProgress * 100)}%` }} />
            </div>
            <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-white/40">引力布局 {Math.round(layoutProgress * 100)}%</p>
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-0.5 text-[11px] text-white/45">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} onClick={() => submit(ex.owner, ex.repo)} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono transition hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-white">
              {ex.label}
            </button>
          ))}
        </div>
        {localError && <p className="mt-2 pl-1 text-xs text-rose-400">{localError}</p>}
        {error && !localError && <p className="mt-2 pl-1 text-xs text-rose-400">{error}</p>}
        {truncated && status === 'ready' && <p className="mt-2 pl-1 text-xs text-amber-300/80">仓库过大，GitHub 树被截断，已部分渲染</p>}
      </div>
      {meta && status === 'ready' && (
        <div className="pointer-events-none ml-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-white/55">
          <span className="font-semibold text-sky-300">{meta.owner}/{meta.repo}</span>
          <span className="text-white/25">·</span>
          <span>⭐ {meta.stars.toLocaleString()}</span>
          <span className="text-white/25">·</span>
          <span>{meta.language ?? '多语言'}</span>
          <span className="text-white/25">·</span>
          <span className="text-white/35">{meta.branch}</span>
        </div>
      )}
    </div>
  );
}
