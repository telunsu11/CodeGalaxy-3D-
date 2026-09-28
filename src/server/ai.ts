import type { ScanProgress, ScanResponse, ScanVerdict, TreeEntry } from '../lib/types';
import { CODE_EXT, heuristicScore } from '../lib/heuristics';
import { isIgnored } from '../lib/graph-builder';
import { fetchRawFile, fetchRepo } from './github';
import { SCAN_SYSTEM, scanUser } from './prompts';

// 任意 OpenAI 兼容端点均可：优先 LLM_* 变量，向后兼容 ZHIPU_*（智谱默认值）
const BASE_URL = () => (process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
const CHAT_URL = () => `${BASE_URL()}/chat/completions`;
const API_KEY = () => process.env.LLM_API_KEY ?? process.env.ZHIPU_API_KEY;
const MODEL = () => process.env.LLM_MODEL ?? process.env.ZHIPU_MODEL ?? 'glm-4.7';
const LLM_TIMEOUT = 60_000; // 第三方中转偶发慢（首字 15s+ 实测），30s 会腰斩长文件分析

export class AiError extends Error {
  code: 'no_key' | 'provider';
  constructor(code: AiError['code'], message: string) { super(message); this.code = code; }
}

export interface ChatMessage { role: 'system' | 'user'; content: string }

export async function llmChat(messages: ChatMessage[], opts: { system?: string; json?: boolean; maxTokens?: number } = {}): Promise<string | { score: number; reason: string }> {
  const apiKey = API_KEY();
  if (!apiKey) throw new AiError('no_key', '未配置 LLM_API_KEY（或 ZHIPU_API_KEY）');
  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LLM_TIMEOUT),
    body: JSON.stringify({
      model: MODEL(),
      messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
      temperature: 0.1,
      max_tokens: opts.maxTokens ?? 512,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new AiError('provider', `LLM 调用失败（${res?.status ?? 'network'}）`);
  let data: { choices: Array<{ message: { content: string } }> };
  try {
    data = await res.json() as typeof data;
  } catch {
    throw new AiError('provider', 'LLM 返回非 JSON 响应');
  }
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!opts.json) return content;
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError('provider', `LLM 返回非 JSON：${content.slice(0, 80)}`);
  let parsed: { score: number; reason: string };
  try {
    parsed = JSON.parse(m[0]) as typeof parsed;
  } catch {
    throw new AiError('provider', `LLM 返回非 JSON：${content.slice(0, 80)}`);
  }
  if (!Number.isFinite(parsed.score)) throw new AiError('provider', 'LLM 返回 score 非法');
  return { score: Math.min(10, Math.max(1, Math.round(parsed.score))), reason: String(parsed.reason).slice(0, 60) };
}

export async function llmChatStream(messages: ChatMessage[], opts: { system?: string } = {}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = API_KEY();
  if (!apiKey) throw new AiError('no_key', '未配置 LLM_API_KEY（或 ZHIPU_API_KEY）');
  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LLM_TIMEOUT),
    body: JSON.stringify({
      model: MODEL(),
      stream: true,
      messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
      temperature: 0.3,
      max_tokens: 384,
    }),
  }).catch(() => null);
  if (!res || !res.ok || !res.body) throw new AiError('provider', `LLM 流式调用失败（${res?.status ?? 'network'}）`);
  return res.body;
}

/** 并发池：错误不打断其他任务 */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { ok: true, value: await fn(items[idx]) }; }
      catch (e) { results[idx] = { ok: false, error: e }; }
    }
  });
  await Promise.all(workers);
  return results;
}

const SCAN_TOP_N = 30;
const SCAN_AI_TOP = 8;
const SCAN_FETCH_LIMIT = 5;
const SCAN_FILE_TRUNCATE = 30_000;

export async function scanRepo(owner: string, repo: string, branch: string, onProgress?: (p: ScanProgress) => void): Promise<ScanResponse> {
  const { entries } = await fetchRepo(owner, repo);
  // 过滤链与 graph-builder 的 buildGraph 对齐（isIgnored）：dist/vendor/node_modules/锁文件/二进制
  // 不进候选，否则 verdict 指向图中不存在的节点，清单死条目点击无反馈
  const codeFiles = (entries as TreeEntry[])
    .filter((e) => e.type === 'blob' && CODE_EXT.has(e.path.split('.').pop()?.toLowerCase() ?? '') && !isIgnored(e.path))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, SCAN_TOP_N);

  let fetched = 0;
  const contents = await pooled(codeFiles, SCAN_FETCH_LIMIT, async (e) => {
    const r = await fetchRawFile(owner, repo, branch, e.path);
    onProgress?.({ stage: 'fetch', done: ++fetched, total: codeFiles.length });
    return { path: e.path, content: r.content.slice(0, SCAN_FILE_TRUNCATE) };
  });
  const files = contents.flatMap((r) => (r.ok ? [r.value] : []));

  const ranked = files
    .map((f) => ({ ...f, heuristics: heuristicScore(f.content) }))
    .sort((a, b) => b.heuristics.score - a.heuristics.score)
    .slice(0, SCAN_AI_TOP);

  if (ranked.length === 0 || ranked[0].heuristics.score === 0) return { verdicts: [], degraded: false };

  let reviewed = 0;
  const judged = await pooled(ranked, SCAN_AI_TOP, async (f) => {
    const r = await llmChat([{ role: 'user', content: scanUser(f.path, f.content) }], { system: SCAN_SYSTEM, json: true }) as { score: number; reason: string };
    onProgress?.({ stage: 'review', done: ++reviewed, total: ranked.length });
    return { path: f.path, score: r.score, reason: r.reason, heuristics: f.heuristics.score } satisfies ScanVerdict;
  });

  const verdicts = judged.flatMap((r) => (r.ok ? [r.value] : []));
  if (verdicts.length > 0) return { verdicts, degraded: false };

  return {
    verdicts: ranked.map((f) => ({ path: f.path, score: f.heuristics.score >= 50 ? 3 : 5, reason: `降级评估：${f.heuristics.signals.slice(0, 2).join('；') || '启发式可疑'}`, heuristics: f.heuristics.score })),
    degraded: true,
  };
}
