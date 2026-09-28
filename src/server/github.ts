import type { FileContent, RepoApiResponse, RepoMeta, TreeEntry } from '../lib/types';

export class GithubError extends Error {
  code: 'not_found' | 'rate_limited' | 'network';
  constructor(code: GithubError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const CACHE_TTL = 10 * 60 * 1000;
const repoCache = new Map<string, { data: RepoApiResponse; ts: number }>();
export const FILE_TRUNCATE = 51_200; // 50KB

/** 仅测试用：清空模块级仓库缓存 */
export function __clearRepoCache(): void {
  repoCache.clear();
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'codegalaxy-3d' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function mapStatusError(status: number, repoKey: string, filePath?: string): GithubError {
  if (status === 404) {
    return filePath
      ? new GithubError('not_found', `文件 ${filePath} 不存在（可能被移动或删除）`)
      : new GithubError('not_found', `仓库 ${repoKey} 不存在或为私有`);
  }
  if (status === 403 || status === 429) return new GithubError('rate_limited', 'GitHub API 限额已用尽，可配置 GITHUB_TOKEN 环境变量');
  return new GithubError('network', `GitHub API 异常（HTTP ${status}）`);
}

const FETCH_TIMEOUT = 10_000;

export async function fetchRepo(owner: string, repo: string): Promise<RepoApiResponse> {
  const key = `${owner}/${repo}`;
  const cached = repoCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT) }).catch(() => null);
  if (!metaRes) throw new GithubError('network', '网络错误：无法访问 GitHub');
  if (!metaRes.ok) throw mapStatusError(metaRes.status, key);
  const m = await metaRes.json() as Record<string, unknown>;

  const meta: RepoMeta = {
    owner, repo,
    branch: (m.default_branch as string) ?? 'main',
    stars: (m.stargazers_count as number) ?? 0,
    description: (m.description as string) ?? '',
    language: (m.language as string) ?? null,
  };

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(meta.branch)}?recursive=1`, { headers: ghHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT) }).catch(() => null);
  if (!treeRes) throw new GithubError('network', '网络错误：无法访问 GitHub');
  if (!treeRes.ok) throw mapStatusError(treeRes.status, key);
  const t = await treeRes.json() as { tree: TreeEntry[]; truncated: boolean };

  const data: RepoApiResponse = { meta, entries: t.tree ?? [], truncated: !!t.truncated };
  repoCache.set(key, { data, ts: Date.now() });
  return data;
}

export async function fetchRawFile(owner: string, repo: string, branch: string, path: string): Promise<FileContent> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw mapStatusError(res.status, `${owner}/${repo}`, path);
  const text = await res.text();
  return { path, content: text.length > FILE_TRUNCATE ? text.slice(0, FILE_TRUNCATE) : text, truncated: text.length > FILE_TRUNCATE };
}
