import { create } from 'zustand';
import type { GalaxyNode, GraphData, RepoApiResponse, ScanResponse } from '../lib/types';
import { buildGraph } from '../lib/graph-builder';

export type LoadStatus = 'idle' | 'loading' | 'layout' | 'ready' | 'error';

interface GalaxyState {
  status: LoadStatus;
  error: string | null;
  meta: RepoApiResponse['meta'] | null;
  graph: GraphData | null;
  truncated: boolean;
  selected: GalaxyNode | null;
  hovered: GalaxyNode | null; // 悬停天体（tooltip 显示）
  searchQuery: string; // 图内查找：匹配的天体高亮放大
  layoutProgress: number; // 0-1，布局 Worker 增量快照进度
  focus: { id: string; ts: number } | null; // FocusController 监听 ts 变化
  comets: Array<{ from: string; to: string }>;
  scan: (ScanResponse & { running: boolean }) | null;

  loadRepo(owner: string, repo: string): Promise<void>;
  applyLayout(coords: Array<{ id: string; x: number; y: number; z: number }>): void;
  selectNode(node: GalaxyNode | null): void;
  hoverNode(node: GalaxyNode | null): void;
  setSearchQuery(q: string): void;
  setComets(comets: Array<{ from: string; to: string }>): void;
  runScan(): Promise<void>;
  clearScan(): void;
}

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  // 注意顺序：先剥尾部斜杠再剥 .git，否则 "repo.git/" 会留下 "repo.git" 尾巴
  const trimmed = input.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const url = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (url) return { owner: url[1], repo: url[2] };
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  return short ? { owner: short[1], repo: short[2] } : null;
}

/** loadRepo 竞态守卫：每次调用自增，await 返回后 seq 过期则丢弃结果 */
let loadSeq = 0;
/** setComets 自动清理定时器（重复调用时先清旧定时器） */
let cometTimer: ReturnType<typeof setTimeout> | null = null;

export const useGalaxy = create<GalaxyState>((set, get) => ({
  status: 'idle',
  error: null,
  meta: null,
  graph: null,
  truncated: false,
  selected: null,
  hovered: null,
  searchQuery: '',
  layoutProgress: 0,
  focus: null,
  comets: [],
  scan: null,

  async loadRepo(owner, repo) {
    const seq = ++loadSeq;
    set({ status: 'loading', error: null, graph: null, selected: null, hovered: null, comets: [], scan: null, layoutProgress: 0 });
    if (cometTimer) { clearTimeout(cometTimer); cometTimer = null; } // 上一仓库的流光清理定时器一并作废
    try {
      const res = await fetch(`/api/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
      const data = await res.json() as RepoApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `加载失败（${res.status}）`);
      if (seq !== loadSeq) return; // 期间用户又发起了新加载，丢弃本次结果
      set({ meta: data.meta, graph: buildGraph(data.entries, `${owner}/${repo}`), truncated: data.truncated, status: 'layout' });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ status: 'error', error: (e as Error).message });
    }
  },

  applyLayout(coords) {
    const g = get().graph;
    if (!g) return;
    const byId = new Map(coords.map((c) => [c.id, c]));
    const nodes = g.nodes.map((n) => {
      const c = byId.get(n.id);
      return c ? { ...n, x: c.x, y: c.y, z: c.z } : n;
    });
    set({ graph: { ...g, nodes }, status: 'ready', layoutProgress: 1 });
  },

  selectNode(node) {
    set({ selected: node, focus: node ? { id: node.id, ts: Date.now() } : null });
  },

  hoverNode(node) {
    const { hovered } = get();
    if ((node === null) === (hovered === null) && node?.id === hovered?.id) return; // 同对象去抖
    set({ hovered: node });
  },

  setSearchQuery(q) {
    if (get().searchQuery === q) return;
    set({ searchQuery: q });
  },

  setComets(comets) {
    set({ comets });
    if (cometTimer) clearTimeout(cometTimer);
    cometTimer = comets.length > 0
      ? setTimeout(() => { set({ comets: [] }); cometTimer = null; }, 3200)
      : null;
  },

  async runScan() {
    if (get().scan?.running) return; // 防重入：程序化调用并发双扫描守卫
    const { meta } = get();
    if (!meta) return;
    set({ scan: { verdicts: [], degraded: false, running: true } });
    try {
      const res = await fetch('/api/ai/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: meta.owner, repo: meta.repo, branch: meta.branch }),
      });
      const data = await res.json() as ScanResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? '扫描失败');
      if (get().meta !== meta) return; // 扫描期间换了仓库，旧结果丢弃
      set({ scan: { ...data, running: false } });
    } catch (e) {
      if (get().meta !== meta) return;
      // degraded 语义留给服务端降级响应；请求失败只清空扫描态并报错
      set({ scan: null });
      set({ error: (e as Error).message });
    }
  },

  clearScan() {
    set({ scan: null });
  },
}));
