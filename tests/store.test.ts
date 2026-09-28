import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRepoInput, useGalaxy } from '../src/app/store';
import type { GalaxyNode, GraphData, RepoApiResponse, RepoMeta } from '../src/lib/types';

describe('parseRepoInput', () => {
  it('解析完整 GitHub URL', () => {
    expect(parseRepoInput('https://github.com/vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
    expect(parseRepoInput('http://github.com/vuejs/core')).toEqual({ owner: 'vuejs', repo: 'core' });
  });

  it('解析 owner/repo 简写形态', () => {
    expect(parseRepoInput('facebook/react')).toEqual({ owner: 'facebook', repo: 'react' });
    expect(parseRepoInput('  carry.yy/project-x  ')).toEqual({ owner: 'carry.yy', repo: 'project-x' });
  });

  it('剥离 .git 后缀与尾部斜杠', () => {
    expect(parseRepoInput('https://github.com/user/repo.git')).toEqual({ owner: 'user', repo: 'repo' });
    expect(parseRepoInput('https://github.com/user/repo/')).toEqual({ owner: 'user', repo: 'repo' });
    expect(parseRepoInput('https://github.com/user/repo.git/')).toEqual({ owner: 'user', repo: 'repo' });
  });

  it('非法输入返回 null', () => {
    expect(parseRepoInput('https://gitlab.com/a/b')).toBeNull();
    expect(parseRepoInput('just-one-word')).toBeNull();
    expect(parseRepoInput('a/b/c')).toBeNull();
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('   ')).toBeNull();
  });
});

// ---- store 行为加固回归测试 ----

const node = (id: string): GalaxyNode => ({
  id, name: id, type: 'moon', depth: 2, size: 10, langColor: '#fff',
  childCount: 0, overflowCount: 0, x: 0, y: 0, z: 0,
});

const graph = (ids: string[]): GraphData => ({
  nodes: ids.map(node),
  links: ids.slice(1).map((id, i) => ({ source: ids[i], target: id })),
  truncated: false,
});

const meta = (repo: string): RepoMeta => ({
  owner: 'o', repo, branch: 'main', stars: 1, description: '', language: null,
});

const repoPayload = (repo: string): RepoApiResponse => ({
  meta: meta(repo), entries: [{ path: 'a.ts', type: 'blob', size: 1 }], truncated: false,
});

const resetStore = () => useGalaxy.setState({
  status: 'idle', error: null, meta: null, graph: null, truncated: false,
  selected: null, focus: null, comets: [], scan: null,
});

beforeEach(() => { resetStore(); });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('applyLayout（不可变重建）', () => {
  it('更新坐标但不变异旧节点对象，状态进入 ready', () => {
    const g = graph(['a', 'b']);
    useGalaxy.setState({ graph: g, status: 'layout' });
    const oldA = g.nodes[0];
    useGalaxy.getState().applyLayout([{ id: 'a', x: 1, y: 2, z: 3 }]);
    const next = useGalaxy.getState().graph!;
    expect(useGalaxy.getState().status).toBe('ready');
    expect(next.nodes[0]).toEqual({ ...node('a'), x: 1, y: 2, z: 3 });
    expect(next.nodes[0]).not.toBe(oldA); // 新对象
    expect(oldA.x).toBe(0); // 旧对象未被变异
    expect(next.nodes[1]).toBe(g.nodes[1]); // 无坐标的节点原样保留
  });
});

describe('setComets（定时器清理）', () => {
  it('3.2s 后自动清空；重复调用重置定时器不叠加', () => {
    vi.useFakeTimers();
    useGalaxy.getState().setComets([{ from: 'a', to: 'b' }]);
    expect(useGalaxy.getState().comets).toHaveLength(1);
    useGalaxy.getState().setComets([{ from: 'c', to: 'd' }]); // 旧定时器应被清除
    vi.advanceTimersByTime(3200);
    expect(useGalaxy.getState().comets).toHaveLength(0);
  });
});

describe('loadRepo（竞态守卫）', () => {
  it('先发后至的旧请求结果被丢弃', async () => {
    let resolveA!: (v: unknown) => void;
    const pendingA = new Promise((r) => { resolveA = r; });
    const fetchMock = vi.fn((url: string) =>
      url.includes('owner=a')
        ? pendingA as unknown as Promise<Response>
        : Promise.resolve({ ok: true, json: async () => repoPayload('b') }) as unknown as Promise<Response>);
    vi.stubGlobal('fetch', fetchMock);

    const pA = useGalaxy.getState().loadRepo('a', 'a'); // 先发，挂起
    await useGalaxy.getState().loadRepo('b', 'b'); // 后发，先回
    expect(useGalaxy.getState().meta?.repo).toBe('b');

    resolveA({ ok: true, json: async () => repoPayload('a') }); // 旧请求现在返回
    await pA;
    expect(useGalaxy.getState().meta?.repo).toBe('b'); // 未被旧结果覆盖
  });

  it('旧请求的失败同样被丢弃', async () => {
    let rejectA!: (e: Error) => void;
    const pendingA = new Promise((_r, rej) => { rejectA = rej; });
    const fetchMock = vi.fn((url: string) =>
      url.includes('owner=a')
        ? pendingA as unknown as Promise<Response>
        : Promise.resolve({ ok: true, json: async () => repoPayload('b') }) as unknown as Promise<Response>);
    vi.stubGlobal('fetch', fetchMock);

    const pA = useGalaxy.getState().loadRepo('a', 'a');
    await useGalaxy.getState().loadRepo('b', 'b');
    rejectA(new Error('旧请求网络错误'));
    await pA;
    expect(useGalaxy.getState().status).toBe('layout'); // 未进入 error
    expect(useGalaxy.getState().error).toBeNull();
  });
});

describe('runScan（守卫与降级语义）', () => {
  it('请求失败：scan 清空、不伪造 degraded，只设 error', async () => {
    useGalaxy.setState({ meta: meta('r') });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))));
    await useGalaxy.getState().runScan();
    const s = useGalaxy.getState();
    expect(s.scan).toBeNull();
    expect(s.error).toBe('boom');
  });

  it('防重入：running 中的二次调用直接返回，不重复发请求', async () => {
    useGalaxy.setState({ meta: meta('r') });
    const fetchMock = vi.fn(() => new Promise(() => {})); // 永不 resolve，保持 running 态
    vi.stubGlobal('fetch', fetchMock);
    void useGalaxy.getState().runScan(); // 第一次：进入 running
    expect(useGalaxy.getState().scan?.running).toBe(true);
    await useGalaxy.getState().runScan(); // 第二次：守卫直接返回
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useGalaxy.getState().scan?.running).toBe(true); // 状态未被二次调用破坏
  });

  it('扫描期间换仓库：旧扫描结果被丢弃', async () => {
    useGalaxy.setState({ meta: meta('r') });
    let resolveScan!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveScan = r; })));
    const p = useGalaxy.getState().runScan();
    // 模拟用户切换仓库（loadRepo 成功路径会重置 scan 并替换 meta）
    useGalaxy.setState({ meta: meta('r2'), scan: null });
    resolveScan({ ok: true, json: async () => ({ verdicts: [{ path: 'x', score: 5, reason: '', heuristics: 0 }], degraded: false }) });
    await p;
    expect(useGalaxy.getState().scan).toBeNull(); // 旧结果未写入
  });
});
