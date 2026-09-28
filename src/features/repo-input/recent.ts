/** 最近浏览仓库（localStorage，最多 8 条，最新在前） */
export interface RecentRepo {
  owner: string;
  repo: string;
}

const KEY = 'codegalaxy-recent';
const LIMIT = 8;

export function getRecent(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentRepo[];
    return Array.isArray(list) ? list.filter((r) => r?.owner && r?.repo).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function pushRecent(owner: string, repo: string): RecentRepo[] {
  const next = [{ owner, repo }, ...getRecent().filter((r) => !(r.owner === owner && r.repo === repo))].slice(0, LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 隐私模式等写入失败可忽略 */ }
  return next;
}

export function removeRecent(owner: string, repo: string): RecentRepo[] {
  const next = getRecent().filter((r) => !(r.owner === owner && r.repo === repo));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 同上 */ }
  return next;
}
