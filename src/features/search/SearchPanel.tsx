import { useEffect, useMemo, useRef, useState } from 'react';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';
import { langNameForPath } from '../../lib/lang-color';

/** 图内查找：匹配 name/id（大小写不敏感子串），结果点击聚焦，匹配天体在 3D 中高亮放大 */
export function searchNodes(nodes: GalaxyNode[], query: string): GalaxyNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = nodes.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  // 文件名命中优先于仅路径命中，再按类型（moon 细粒度在前）
  return hits
    .sort((a, b) => {
      const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
      const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
      if (aName !== bName) return aName - bName;
      return (a.type === 'moon' ? 0 : a.type === 'planet' ? 1 : 2) - (b.type === 'moon' ? 0 : b.type === 'planet' ? 1 : 2);
    })
    .slice(0, 30);
}

export function SearchPanel() {
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const searchQuery = useGalaxy((s) => s.searchQuery);
  const setSearchQuery = useGalaxy((s) => s.setSearchQuery);
  const [text, setText] = useState('');
  const [active, setActive] = useState(-1); // 键盘选中项（↑↓ 移动，Enter 聚焦）
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 本地输入即时回显，写 store 做 150ms 防抖（store 变化触发 3D 高亮重算）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>( null);
  const onInput = (v: string) => {
    setText(v);
    setActive(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(v), 150);
  };

  const results = useMemo(() => searchNodes(graph?.nodes ?? [], searchQuery), [graph, searchQuery]);

  const pick = (n: GalaxyNode) => {
    useGalaxy.getState().selectNode(n);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
  };

  // 键盘选中项滚动跟随
  useEffect(() => {
    listRef.current?.querySelector(`li:nth-child(${active + 1}) button`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // 换仓库时搜索状态随之清空（store 的 searchQuery 由 loadRepo 重置，这里同步本地输入框）
  useEffect(() => {
    setText('');
  }, [graph]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onInput('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!graph || status !== 'ready') return null;

  return (
    <div className="pointer-events-none relative">
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0a0e1d]/75 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <svg className="size-4 shrink-0 text-white/35" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索文件或目录…  按 / 聚焦，↑↓ 选择"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {text && (
            <button onClick={() => onInput('')} className="shrink-0 rounded p-0.5 text-white/40 transition hover:text-white" title="清空 (Esc)">
              <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <div className="border-t border-white/8">
            <p className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-widest text-white/35">
              {results.length > 0 ? `${results.length} 个匹配${results.length >= 30 ? '（仅显示前 30）' : ''}` : '无匹配'}
            </p>
            <ul ref={listRef} className="max-h-64 overflow-y-auto pb-1.5">
              {results.map((n, i) => (
                <li key={n.id}>
                  <button
                    onClick={() => pick(n)}
                    className={`group flex w-full items-center gap-2 px-3.5 py-1.5 text-left transition ${active === i ? 'bg-sky-400/15' : 'hover:bg-white/5'}`}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: n.langColor }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-mono text-xs ${active === i ? 'text-white' : 'text-white/90 group-hover:text-white'}`}>{n.name}</span>
                      <span className="block truncate font-mono text-[10px] text-white/30">{n.id}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-white/25">
                      {n.type === 'moon' ? (langNameForPath(n.id) ?? '') : n.type === 'planet' ? `${n.childCount} 文件` : '仓库'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
