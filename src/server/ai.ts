import type { ScanResponse, ScanVerdict, TreeEntry } from '../lib/types';
import { CODE_EXT, heuristicScore } from '../lib/heuristics';
import { fetchRawFile, fetchRepo } from './github';
import { SCAN_SYSTEM, scanUser } from './prompts';

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = () => process.env.ZHIPU_MODEL ?? 'glm-4.7';
const GLM_TIMEOUT = 30_000;

export class AiError extends Error {
  code: 'no_key' | 'provider';
  constructor(code: AiError['code'], message: string) { super(message); this.code = code; }
}

export interface ChatMessage { role: 'system' | 'user'; content: string }

export async function zhipuChat(messages: ChatMessage[], opts: { system?: string; json?: boolean; maxTokens?: number } = {}): Promise<string | { score: number; reason: string }> {
  if (!process.env.ZHIPU_API_KEY) throw new AiError('no_key', '未配置 ZHIPU_API_KEY');
  const res = await fetch(ZHIPU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    signal: AbortSignal.timeout(GLM_TIMEOUT),
    body: JSON.stringify({
      model: MODEL(),
      messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
      temperature: 0.1,
      max_tokens: opts.maxTokens ?? 512,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new AiError('provider', `GLM 调用失败（${res?.status ?? 'network'}）`);
  let data: { choices: Array<{ message: { content: string } }> };
  try {
    data = await res.json() as typeof data;
  } catch {
    throw new AiError('provider', 'GLM 返回非 JSON 响应');
  }
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!opts.json) return content;
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError('provider', `GLM 返回非 JSON：${content.slice(0, 80)}`);
  let parsed: { score: number; reason: string };
  try {
    parsed = JSON.parse(m[0]) as typeof parsed;
  } catch {
    throw new AiError('provider', `GLM 返回非 JSON：${content.slice(0, 80)}`);
  }
  const score = Number(parsed.score);
  if (Number.isNaN(score)) throw new AiError('provider', 'GLM 返回 score 非法');
  return { score: Math.min(10, Math.max(1, Math.round(score))), reason: String(parsed.reason).slice(0, 60) };
}

export async function zhipuChatStream(messages: ChatMessage[], opts: { system?: string } = {}): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.ZHIPU_API_KEY) throw new AiError('no_key', '未配置 ZHIPU_API_KEY');
  const res = await fetch(ZHIPU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    signal: AbortSignal.timeout(GLM_TIMEOUT),
    body: JSON.stringify({
      model: MODEL(),
      stream: true,
      messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
      temperature: 0.3,
      max_tokens: 384,
    }),
  }).catch(() => null);
  if (!res || !res.ok || !res.body) throw new AiError('provider', `GLM 流式调用失败（${res?.status ?? 'network'}）`);
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

export async function scanRepo(owner: string, repo: string, branch: string): Promise<ScanResponse> {
  const { entries } = await fetchRepo(owner, repo);
  const codeFiles = (entries as TreeEntry[])
    .filter((e) => e.type === 'blob' && CODE_EXT.has(e.path.split('.').pop()?.toLowerCase() ?? ''))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, SCAN_TOP_N);

  const contents = await pooled(codeFiles, SCAN_FETCH_LIMIT, async (e) => ({
    path: e.path,
    content: (await fetchRawFile(owner, repo, branch, e.path)).content.slice(0, SCAN_FILE_TRUNCATE),
  }));
  const files = contents.flatMap((r) => (r.ok ? [r.value] : []));

  const ranked = files
    .map((f) => ({ ...f, heuristics: heuristicScore(f.content) }))
    .sort((a, b) => b.heuristics.score - a.heuristics.score)
    .slice(0, SCAN_AI_TOP);

  if (ranked.length === 0 || ranked[0].heuristics.score === 0) return { verdicts: [], degraded: false };

  const judged = await pooled(ranked, SCAN_AI_TOP, async (f) => {
    const r = await zhipuChat([{ role: 'user', content: scanUser(f.path, f.content) }], { system: SCAN_SYSTEM, json: true }) as { score: number; reason: string };
    return { path: f.path, score: r.score, reason: r.reason, heuristics: f.heuristics.score } satisfies ScanVerdict;
  });

  const verdicts = judged.flatMap((r) => (r.ok ? [r.value] : []));
  if (verdicts.length > 0) return { verdicts, degraded: false };

  return {
    verdicts: ranked.map((f) => ({ path: f.path, score: f.heuristics.score >= 50 ? 3 : 5, reason: `降级评估：${f.heuristics.signals.slice(0, 2).join('；') || '启发式可疑'}`, heuristics: f.heuristics.score })),
    degraded: true,
  };
}
