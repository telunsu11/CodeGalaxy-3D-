import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearRepoCache } from '../src/server/github';
import { scanRepo, zhipuChat, zhipuChatStream } from '../src/server/ai';

const JSON_RESP = (body: unknown) => ({ ok: true, json: async () => body } as Response);
const TEXT_RESP = (body: string) => ({ ok: true, text: async () => body } as Response);
const OK_JSON = JSON_RESP({ choices: [{ message: { content: '{"score": 3, "reason": "超长且多 TODO"}' } }] });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZHIPU_API_KEY;
});

describe('zhipuChat', () => {
  it('无 key 抛 no_key', async () => {
    delete process.env.ZHIPU_API_KEY;
    await expect(zhipuChat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ code: 'no_key' });
  });
  it('有 key 时携带 Authorization 与默认模型', async () => {
    process.env.ZHIPU_API_KEY = 'test-key';
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => OK_JSON);
    vi.stubGlobal('fetch', spy);
    await zhipuChat([{ role: 'user', content: 'hi' }]);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('open.bigmodel.cn/api/paas/v4/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string).model).toBe(process.env.ZHIPU_MODEL ?? 'glm-4.7');
  });
  it('GLM 返回内容外裹文字时正则兜底提取 JSON', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () =>
      JSON_RESP({ choices: [{ message: { content: '结果如下：\n```json\n{"score":2,"reason":"x"}\n```' } }] })));
    const r = await zhipuChat([{ role: 'user', content: 'x' }], { json: true });
    expect(r).toMatchObject({ score: 2 });
  });
  it('GLM fetch 携带 30s 超时 signal', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => OK_JSON);
    vi.stubGlobal('fetch', spy);
    await zhipuChat([{ role: 'user', content: 'hi' }]);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('GLM 返回 200 但 body 为 HTML 时抛 AiError(provider)', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    const HTML = '<html><body>502 Bad Gateway</body></html>';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => JSON.parse(HTML) } as unknown as Response)));
    await expect(zhipuChat([{ role: 'user', content: 'x' }], { json: true })).rejects.toMatchObject({ code: 'provider' });
  });
  it('score 为非数字字符串时抛 AiError(provider)', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () =>
      JSON_RESP({ choices: [{ message: { content: '{"score": "abc", "reason": "x"}' } }] })));
    await expect(zhipuChat([{ role: 'user', content: 'x' }], { json: true })).rejects.toMatchObject({ code: 'provider' });
  });
  it('score 为空字符串时拒绝（不被静默钳到 1）', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () =>
      JSON_RESP({ choices: [{ message: { content: '{"score": "", "reason": "x"}' } }] })));
    await expect(zhipuChat([{ role: 'user', content: 'x' }], { json: true })).rejects.toMatchObject({ code: 'provider' });
  });
  it('score 超出 1-10 时钳位到边界', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () =>
      JSON_RESP({ choices: [{ message: { content: '{"score": 15, "reason": "还行"}' } }] })));
    const r = await zhipuChat([{ role: 'user', content: 'x' }], { json: true });
    expect(r).toMatchObject({ score: 10 });
  });
});

describe('zhipuChatStream', () => {
  it('返回可读的 SSE web stream', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}'));
          c.close();
        },
      }),
    }) as Response));
    const stream = await zhipuChatStream([{ role: 'user', content: 'hi' }]);
    const text = await new Response(stream).text();
    expect(text).toContain('data: {"choices"');
  });
  it('GLM 流式 fetch 携带 30s 超时 signal', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      body: new ReadableStream({ start(c) { c.close(); } }),
    }) as Response);
    vi.stubGlobal('fetch', spy);
    await zhipuChatStream([{ role: 'user', content: 'hi' }]);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('scanRepo 降级', () => {
  beforeEach(() => {
    __clearRepoCache(); // fetchRepo 模块级缓存跨用例隔离
  });
  it('GLM 全挂时降级为纯启发式（degraded=true）', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('git/trees')) return JSON_RESP({ truncated: false, tree: [{ path: 'big.ts', type: 'blob', size: 90000 }] });
      if (url.includes('raw.githubusercontent')) return TEXT_RESP('// TODO: a\n'.repeat(80));
      if (url.includes('api.github.com/repos/')) return JSON_RESP({ default_branch: 'main', stargazers_count: 0, description: '', language: null });
      call++; // 只统计 GLM 调用
      return { ok: false, status: 500 } as Response;
    }));
    const r = await scanRepo('o', 'r', 'main');
    expect(r.degraded).toBe(true);
    expect(r.verdicts.length).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(0);
  });

  it('成功路径：GLM 逐文件返回结论，.md 不参与', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    __clearRepoCache();
    const SCORES: Record<string, number> = { 'a.ts': 2, 'b.ts': 3, 'c.js': 4 };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('git/trees')) return JSON_RESP({
        truncated: false,
        tree: [
          { path: 'a.ts', type: 'blob', size: 5000 },
          { path: 'b.ts', type: 'blob', size: 4000 },
          { path: 'c.js', type: 'blob', size: 3000 },
          { path: 'readme.md', type: 'blob', size: 9000 }, // 不在 CODE_EXT，须被过滤
          { path: 'src', type: 'tree' },
        ],
      });
      if (url.includes('raw.githubusercontent')) return TEXT_RESP('// TODO: fix\n'.repeat(10));
      if (url.includes('api.github.com/repos/')) return JSON_RESP({ default_branch: 'main', stargazers_count: 0, description: '', language: null });
      // GLM：按请求体中的文件路径返回各自 score/reason
      const body = JSON.parse((init as RequestInit).body as string) as { messages: Array<{ role: string; content: string }> };
      const path = body.messages.find((m) => m.role === 'user')!.content.match(/文件路径：(\S+)/)![1];
      return JSON_RESP({ choices: [{ message: { content: `{"score": ${SCORES[path]}, "reason": "GLM-${path}-劣质"}` } }] });
    }));
    const r = await scanRepo('o', 'ok', 'main');
    expect(r.degraded).toBe(false);
    expect(r.verdicts.length).toBe(3); // 3 个代码文件，top-8 截断不越
    const byPath = new Map(r.verdicts.map((v) => [v.path, v]));
    expect([...byPath.keys()].sort()).toEqual(['a.ts', 'b.ts', 'c.js']);
    expect(byPath.get('a.ts')).toMatchObject({ score: 2, reason: 'GLM-a.ts-劣质' });
    expect(byPath.get('b.ts')).toMatchObject({ score: 3, reason: 'GLM-b.ts-劣质' });
    expect(byPath.get('c.js')).toMatchObject({ score: 4, reason: 'GLM-c.js-劣质' });
  });

  it('全零短路：内容干净时 verdicts 为空且 GLM 零调用', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    __clearRepoCache();
    let glmCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('git/trees')) return JSON_RESP({
        truncated: false,
        tree: [{ path: 'clean-a.ts', type: 'blob', size: 100 }, { path: 'clean-b.ts', type: 'blob', size: 90 }],
      });
      if (url.includes('raw.githubusercontent')) return TEXT_RESP('const answer = 42;\n');
      if (url.includes('api.github.com/repos/')) return JSON_RESP({ default_branch: 'main', stargazers_count: 0, description: '', language: null });
      glmCalls++;
      return OK_JSON;
    }));
    const r = await scanRepo('o', 'clean', 'main');
    expect(r).toEqual({ verdicts: [], degraded: false });
    expect(glmCalls).toBe(0);
  });
});
