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
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (owner: string, repo: string) => {
    setLocalError(null);
    void loadRepo(owner, repo);
  };

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full flex-col gap-2 p-4">
      <form
        className="pointer-events-auto flex gap-2"
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
          placeholder="owner/repo 或 https://github.com/owner/repo"
          className="w-96 rounded-lg border border-white/15 bg-black/60 px-4 py-2 font-mono text-sm text-white placeholder:text-white/35 backdrop-blur focus:border-sky-400/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading' || status === 'layout'}
          className="rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
        >
          {status === 'loading' || status === 'layout' ? '构建星系中…' : '生成星系'}
        </button>
      </form>
      <div className="pointer-events-auto flex gap-2 text-xs text-white/50">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} onClick={() => submit(ex.owner, ex.repo)} className="rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur transition hover:border-sky-400/40 hover:text-white">
            {ex.label}
          </button>
        ))}
      </div>
      {localError && <p className="pointer-events-none text-sm text-rose-400">{localError}</p>}
      {error && !localError && <p className="pointer-events-none text-sm text-rose-400">{error}</p>}
      {truncated && status === 'ready' && <p className="pointer-events-none text-sm text-amber-300/90">仓库过大，GitHub 树被截断，已部分渲染</p>}
      {meta && status === 'ready' && (
        <p className="pointer-events-none text-sm text-white/70">
          <span className="font-semibold text-sky-300">{meta.repo}</span> · ⭐ {meta.stars.toLocaleString()} · {meta.language ?? '多语言'} · 分支 {meta.branch}
        </p>
      )}
    </div>
  );
}
