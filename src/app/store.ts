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
  focus: { id: string; ts: number } | null; // FocusController 监听 ts 变化
  comets: Array<{ from: string; to: string }>;
  scan: (ScanResponse & { running: boolean }) | null;

  loadRepo(owner: string, repo: string): Promise<void>;
  applyLayout(coords: Array<{ id: string; x: number; y: number; z: number }>): void;
  selectNode(node: GalaxyNode | null): void;
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

export const useGalaxy = create<GalaxyState>((set, get) => ({
  status: 'idle',
  error: null,
  meta: null,
  graph: null,
  truncated: false,
  selected: null,
  focus: null,
  comets: [],
  scan: null,

  async loadRepo(owner, repo) {
    set({ status: 'loading', error: null, graph: null, selected: null, comets: [], scan: null });
    try {
      const res = await fetch(`/api/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
      const data = await res.json() as RepoApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `加载失败（${res.status}）`);
      set({ meta: data.meta, graph: buildGraph(data.entries, `${owner}/${repo}`), truncated: data.truncated, status: 'layout' });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  applyLayout(coords) {
    const g = get().graph;
    if (!g) return;
    const byId = new Map(coords.map((c) => [c.id, c]));
    for (const n of g.nodes) {
      const c = byId.get(n.id);
      if (c) { n.x = c.x; n.y = c.y; n.z = c.z; }
    }
    set({ graph: { ...g }, status: 'ready' });
  },

  selectNode(node) {
    set({ selected: node, focus: node ? { id: node.id, ts: Date.now() } : null });
  },

  setComets(comets) {
    set({ comets });
    if (comets.length > 0) setTimeout(() => set({ comets: [] }), 3200);
  },

  async runScan() {
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
      set({ scan: { ...data, running: false } });
    } catch (e) {
      set({ scan: { verdicts: [], degraded: true, running: false } });
      set({ error: (e as Error).message });
    }
  },

  clearScan() {
    set({ scan: null });
  },
}));
