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
});
