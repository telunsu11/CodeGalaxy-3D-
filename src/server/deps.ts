import { CODE_EXT } from '../lib/heuristics';
import { isIgnored } from '../lib/graph-builder';
import { extractImportSpecifiers, resolveToNodeId } from '../lib/import-resolver';
import type { TreeEntry } from '../lib/types';
import { fetchRawFile, fetchRepo } from './github';
import { pooled } from './ai';

const DEP_TOP_N = 120; // 参与解析的文件数（按体积取最大，大文件通常是核心模块）
const DEP_FETCH_LIMIT = 8;
const DEP_FILE_TRUNCATE = 20_000;
const DEP_EDGE_LIMIT = 2000;
const CACHE_TTL = 10 * 60 * 1000;

const depsCache = new Map<string, { data: DepsResponse; ts: number }>();

export interface DepsResponse {
  edges: Array<{ from: string; to: string }>;
  scanned: number; // 参与解析的文件数
}

/** 清缓存（仅测试用） */
export function __clearDepsCache() { depsCache.clear(); }

/**
 * 依赖全景：拉取体积最大的 N 个代码文件，正则解析 import 并解析为
 * 全树文件路径集合中的目标，产出依赖边（无 LLM 成本，纯规则）。
 */
export async function fetchDeps(owner: string, repo: string, branch: string): Promise<DepsResponse> {
  const key = `${owner}/${repo}@${branch}`;
  const cached = depsCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const { entries } = await fetchRepo(owner, repo);
  const blobs = (entries as TreeEntry[]).filter((e) => e.type === 'blob');
  // 解析目标集合：仓库全部文件路径（import 的相对路径在此集合内补全扩展名/index 后命中）
  const allPaths = new Set(blobs.map((e) => e.path));

  const candidates = blobs
    .filter((e) => CODE_EXT.has(e.path.split('.').pop()?.toLowerCase() ?? '') && !isIgnored(e.path))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, DEP_TOP_N);

  const results = await pooled(candidates, DEP_FETCH_LIMIT, async (e) => {
    const { content } = await fetchRawFile(owner, repo, branch, e.path);
    const targets = [...new Set(
      extractImportSpecifiers(content.slice(0, DEP_FILE_TRUNCATE))
        .map((spec) => resolveToNodeId(e.path, spec, allPaths))
        .filter((t): t is string => t != null && t !== e.path),
    )];
    return targets.map((to) => ({ from: e.path, to }));
  });

  const edges = results.flatMap((r) => (r.ok ? r.value : [])).slice(0, DEP_EDGE_LIMIT);
  const data: DepsResponse = { edges, scanned: candidates.length };
  depsCache.set(key, { data, ts: Date.now() });
  return data;
}
