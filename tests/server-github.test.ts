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
});

describe('fetchRawFile', () => {
  it('超过 50KB 截断并置 truncated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GH_TEXT('x'.repeat(60000))));
    const f = await fetchRawFile('o', 'r', 'main', 'big.ts');
    expect(f.content.length).toBe(51200);
    expect(f.truncated).toBe(true);
  });
});
