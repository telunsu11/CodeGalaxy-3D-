import { afterEach, describe, expect, it, vi } from 'vitest';
import { __clearRepoCache, fetchRepo, fetchRawFile } from '../src/server/github';

const GH_JSON = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body } as Response);
const GH_TEXT = (body: string, status = 200) => ({ status, ok: status < 400, text: async () => body } as Response);

afterEach(() => {
  __clearRepoCache(); // 模块级缓存跨测试隔离，避免用例间互相污染
  vi.unstubAllGlobals();
});

describe('fetchRepo', () => {
  it('两次 GitHub 调用合成 RepoApiResponse，且命中缓存后不再请求', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/git/trees/')) {
        return GH_JSON({ truncated: false, tree: [{ path: 'src', type: 'tree' }, { path: 'src/a.ts', type: 'blob', size: 10 }] });
      }
      return GH_JSON({ default_branch: 'main', stargazers_count: 7, description: 'd', language: 'TypeScript' });
    }));
    const r1 = await fetchRepo('vuejs', 'pinia');
    expect(r1.meta.branch).toBe('main');
    expect(r1.entries).toHaveLength(2);
    expect(r1.truncated).toBe(false);
    await fetchRepo('vuejs', 'pinia'); // 命中缓存
    expect(calls.filter((u) => u.includes('/git/trees/'))).toHaveLength(1);
  });
  it('404 映射为 not_found 错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GH_JSON({ message: 'Not Found' }, 404)));
    await expect(fetchRepo('a', 'nope')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('403 映射为 rate_limited 错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GH_JSON({ message: 'API rate limit' }, 403)));
    await expect(fetchRepo('a', 'b')).rejects.toMatchObject({ code: 'rate_limited' });
  });
  it('trees 第二次请求网络中断时抛 network 错误而非裸 TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) throw new TypeError('fetch failed');
      return GH_JSON({ default_branch: 'main' });
    }));
    await expect(fetchRepo('a', 'b')).rejects.toMatchObject({ code: 'network' });
  });
  it('trees URL 中的分支名需编码（含 ? / 等特殊字符）', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes('/git/trees/')) return GH_JSON({ truncated: false, tree: [] });
      return GH_JSON({ default_branch: 'feat/x?2' });
    }));
    await fetchRepo('a', 'b');
    const treesUrl = urls.find((u) => u.includes('/git/trees/'));
    expect(treesUrl).toContain('feat%2Fx%3F2');
  });
});

describe('fetchRawFile', () => {
  it('超过 50KB 截断并置 truncated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GH_TEXT('x'.repeat(60000))));
    const f = await fetchRawFile('o', 'r', 'main', 'big.ts');
    expect(f.content.length).toBe(51200);
    expect(f.truncated).toBe(true);
  });
  it('404 映射为 not_found 且文案指向文件', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GH_TEXT('Not Found', 404)));
    await expect(fetchRawFile('o', 'r', 'main', 'src/a.ts')).rejects.toMatchObject({
      code: 'not_found',
      message: expect.stringContaining('文件'),
    });
  });
  it('路径中的空格等特殊字符需逐段编码', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return GH_TEXT('hi');
    }));
    await fetchRawFile('o', 'r', 'main', 'src/my file.ts');
    expect(urls[0]).toContain('src/my%20file.ts');
  });
});
