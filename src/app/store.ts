import { create } from 'zustand';
import type { GalaxyNode, GraphData, RepoApiResponse, ScanProgress, ScanResponse } from '../lib/types';
import { buildGraph } from '../lib/graph-builder';
import { colorForPath } from '../lib/lang-color';
import { readSseEvents } from '../features/ai-panel/sse';

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
  scan: (ScanResponse & { running: boolean; progress: ScanProgress | null }) | null;
  /** 依赖全景：null=关闭；loading=解析中；edges=两端都在图中的依赖连线 */
  deps: { loading: boolean; edges: Array<{ from: string; to: string }> } | null;

  loadRepo(owner: string, repo: string): Promise<void>;
  applyLayout(coords: Array<{ id: string; x: number; y: number; z: number }>): void;
  selectNode(node: GalaxyNode | null): void;
  hoverNode(node: GalaxyNode | null): void;
  setSearchQuery(q: string): void;
  expandDir(dir: string): void;
  collapseDir(dir: string): void;
  setComets(comets: Array<{ from: string; to: string }>): void;
  runScan(): Promise<void>;
  clearScan(): void;
  toggleDeps(): Promise<void>;
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
  deps: null,

  async loadRepo(owner, repo) {
    const seq = ++loadSeq;
    set({ status: 'loading', error: null, graph: null, selected: null, hovered: null, comets: [], scan: null, deps: null, searchQuery: '', layoutProgress: 0 });
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

  expandDir(dir) {
    const g = get().graph;
    if (!g) return;
    const planet = g.nodes.find((n) => n.id === dir && n.type === 'planet');
    const files = g.overflowFiles[dir];
    if (!planet || !files || files.length === 0) return;
    if (g.nodes.some((n) => n.expanded && n.id.startsWith(`${dir}/`))) return; // 已展开
    // 局部球壳布局：绕行星分布（无需重跑全局力导向，它们本就属于该行星邻域）
    let seed = dir.length * 7919 + files.length;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const newNodes = files.map((f) => {
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      const r = 8 + rnd() * 12;
      return {
        id: f.path,
        name: f.path.split('/').pop()!,
        type: 'moon' as const,
        depth: planet.depth + 1,
        size: f.size,
        langColor: colorForPath(f.path),
        childCount: 0,
        overflowCount: 0,
        x: planet.x + r * Math.sin(phi) * Math.cos(theta),
        y: planet.y + r * Math.cos(phi) * 0.7,
        z: planet.z + r * Math.sin(phi) * Math.sin(theta),
        expanded: true,
      };
    });
    const newLinks = newNodes.map((n) => ({ source: dir, target: n.id }));
    set({ graph: { ...g, nodes: [...g.nodes, ...newNodes], links: [...g.links, ...newLinks] } });
  },

  collapseDir(dir) {
    const g = get().graph;
    if (!g) return;
    const prefix = `${dir}/`;
    const nodes = g.nodes.filter((n) => !(n.expanded && n.id.startsWith(prefix)));
    if (nodes.length === g.nodes.length) return; // 未展开
    const removed = new Set(g.nodes.filter((n) => n.expanded && n.id.startsWith(prefix)).map((n) => n.id));
    const links = g.links.filter((l) => !removed.has(l.source) && !removed.has(l.target));
    set({ graph: { ...g, nodes, links } });
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
    set({ scan: { verdicts: [], degraded: false, running: true, progress: null } });
    try {
      const res = await fetch('/api/ai/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: meta.owner, repo: meta.repo, branch: meta.branch }),
      });
      if (!res.ok) throw new Error('扫描请求失败');
      // SSE 事件流：progress 增量更新，result 收尾
      await readSseEvents(res, (payload) => {
        let evt: { progress?: ScanProgress; result?: ScanResponse; error?: string };
        try { evt = JSON.parse(payload) as typeof evt; } catch { return; }
        if (evt.error) throw new Error(evt.error);
        if (evt.progress && get().meta === meta) {
          set({ scan: { verdicts: [], degraded: false, running: true, progress: evt.progress } });
        }
        if (evt.result && get().meta === meta) {
          set({ scan: { ...evt.result, running: false, progress: null } });
        }
      });
      if (get().meta !== meta) return;
      if (get().scan?.running) set({ scan: { verdicts: [], degraded: true, running: false, progress: null } }); // 流结束但没收到 result（中途断流）
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

  async toggleDeps() {
    const { meta, graph, deps } = get();
    if (!meta || !graph) return;
    if (deps?.loading) return; // 防重入
    if (deps) { set({ deps: null }); return; } // 已开启 → 关闭
    set({ deps: { loading: true, edges: [] } });
    try {
      const res = await fetch(`/api/deps?owner=${encodeURIComponent(meta.owner)}&repo=${encodeURIComponent(meta.repo)}&branch=${encodeURIComponent(meta.branch)}`);
      const data = await res.json() as { edges?: Array<{ from: string; to: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? '依赖解析失败');
      if (get().meta !== meta) return; // 换仓库丢弃
      // 只画两端都是图中卫星的边（依赖是文件→文件；目录节点不算）
      const moonIds = new Set(graph.nodes.filter((n) => n.type === 'moon').map((n) => n.id));
      const edges = (data.edges ?? []).filter((e) => moonIds.has(e.from) && moonIds.has(e.to));
      set({ deps: { loading: false, edges } });
    } catch (e) {
      if (get().meta !== meta) return;
      set({ deps: null });
      set({ error: (e as Error).message });
    }
  },
}));
