import type { GalaxyLink, GalaxyNode, GraphData, TreeEntry } from './types';
import { colorForPath } from './lang-color';

const IGNORE_DIR_PATTERNS = [
  /^node_modules\//,
  /(^|\/)\.git(\/|$)/,
  /^dist\//,
  /^build\//,
  /^vendor\//,
  /^coverage\//,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)\.venv(\/|$)/,
];
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'pdf', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'zip', 'gz', 'tar', 'bz2', '7z', 'mp4', 'mp3', 'webm', 'wav', 'ogg',
  'class', 'jar', 'dylib', 'so', 'exe', 'dll', 'wasm', 'bin', 'dat', 'lock',
]);
const LOCK_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock',
  'composer.lock', 'Gemfile.lock', 'go.sum',
]);

export const PER_DIR_MOON_LIMIT = 8;
export const GLOBAL_MOON_LIMIT = 2500;

export function isIgnored(path: string): boolean {
  const withSlash = path + '/';
  if (IGNORE_DIR_PATTERNS.some((re) => re.test(withSlash))) return true;
  if (LOCK_FILES.has(path.split('/').pop()!)) return true;
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
  return BINARY_EXT.has(ext);
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function depthOf(path: string): number {
  return path === '' ? 0 : path.split('/').length;
}

export function buildGraph(entries: TreeEntry[], repoKey: string): GraphData {
  // 过滤子模块（type === 'commit'）与依赖/构建产物/二进制/lock 文件
  const kept = entries.filter((e) => e.type !== 'commit' && !isIgnored(e.path));

  const dirs = new Set<string>();
  const blobs: TreeEntry[] = [];
  for (const e of kept) {
    if (e.type === 'tree') {
      dirs.add(e.path);
    } else {
      blobs.push(e);
      let p = parentOf(e.path);
      while (p) {
        dirs.add(p);
        p = parentOf(p);
      }
    }
  }

  // 按目录分桶，桶内按文件体积降序（top-K 取最大的）
  const byDir = new Map<string, TreeEntry[]>();
  for (const b of blobs) {
    const p = parentOf(b.path);
    if (!byDir.has(p)) byDir.set(p, []);
    byDir.get(p)!.push(b);
  }
  for (const list of byDir.values()) list.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

  // 全局 moon 上限触发时按比例缩减每目录 K
  const totalMoons = blobs.length;
  let k = PER_DIR_MOON_LIMIT;
  if (totalMoons > GLOBAL_MOON_LIMIT) {
    k = Math.max(2, Math.ceil((PER_DIR_MOON_LIMIT * GLOBAL_MOON_LIMIT) / totalMoons));
  }

  const nodes: GalaxyNode[] = [];
  const links: GalaxyLink[] = [];
  const starId = `repo:${repoKey}`;
  const mk = (id: string, type: GalaxyNode['type'], depth: number, size: number): GalaxyNode => ({
    id,
    name: id.split('/').pop()!,
    type,
    depth,
    size,
    langColor: colorForPath(id),
    childCount: 0,
    overflowCount: 0,
    x: 0,
    y: 0,
    z: 0,
  });

  nodes.push({ ...mk(starId, 'star', 0, 0), name: repoKey });

  const sortedDirs = [...dirs].sort();
  for (const d of sortedDirs) {
    nodes.push(mk(d, 'planet', depthOf(d), 0));
    const parent = parentOf(d);
    links.push({ source: parent === '' ? starId : parent, target: d });
  }

  // planet 的 childCount：递归文件总数
  const childCount = new Map<string, number>();
  for (const b of blobs) {
    let p = parentOf(b.path);
    while (true) {
      childCount.set(p, (childCount.get(p) ?? 0) + 1);
      if (p === '') break;
      p = parentOf(p);
    }
  }

  // moon：每目录取 top-K。深度取父目录段数、下限 1（第 0 层是 star，根文件落在第 1 层，
  // 子目录文件与其所属 planet 同层），与 forceRadial 分层布局对齐。
  for (const [dir, list] of byDir) {
    for (const b of list.slice(0, k)) {
      nodes.push(mk(b.path, 'moon', Math.max(1, depthOf(dir)), b.size ?? 0));
      links.push({ source: dir === '' ? starId : dir, target: b.path });
    }
  }

  for (const n of nodes) {
    if (n.type === 'planet') {
      n.childCount = childCount.get(n.id) ?? 0;
      n.overflowCount = Math.max(0, (byDir.get(n.id)?.length ?? 0) - k);
    }
  }

  return { nodes, links, truncated: false };
}
