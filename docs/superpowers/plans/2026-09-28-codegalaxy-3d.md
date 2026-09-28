# CodeGalaxy 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 输入 GitHub 仓库地址，将其代码结构渲染为可交互 3D 星系（恒星=仓库、行星=目录、卫星=文件、黑洞=AI 判定的劣质代码），支持点击文件触发 AI 流式摘要与 import 流光特效。

**Architecture:** Vite + React 19 单页应用；d3-force-3d 在 Web Worker 计算 3D 力导向布局；R3F/drei/postprocessing 渲染星系；Vite dev-server 中间件代理 GitHub API 与智谱 GLM（保护密钥）；图构建、import 解析、启发式评分为纯函数层，全部单测覆盖。

**Tech Stack:** Vite 7、React 19、TypeScript(ESM)、three/@react-three/fiber@9/drei@10/@react-three/postprocessing、d3-force-3d、zustand、TailwindCSS 4、智谱 GLM（SSE）、vitest。

**Spec:** `docs/superpowers/specs/2026-09-28-codegalaxy-3d-design.md`

**约定：** 所有命令在项目根 `/Users/carry/workProject/personal/codegalaxy-3d` 执行。环境变量：`ZHIPU_API_KEY`（必需，用于 AI 功能）、`GITHUB_TOKEN`（可选，提高限额）、`ZHIPU_MODEL`（可选，默认 `glm-4.7`）。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "codegalaxy-3d",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
npm i react react-dom three @react-three/fiber@^9 @react-three/drei@^10 @react-three/postprocessing d3-force-3d zustand
npm i -D typescript vite@^7 @vitejs/plugin-react @types/react @types/react-dom @types/three @types/d3-force-3d tailwindcss@^4 @tailwindcss/vite@^4 vitest@^3
```

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"],
    "verbatimModuleSyntax": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: 写 vite.config.ts（API 中间件占位，Task 8 填充实现）**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 5: 写 index.html、src/main.tsx、src/App.tsx、src/index.css、src/vite-env.d.ts**

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeGalaxy 3D</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`：

```tsx
export default function App() {
  return <div className="h-screen w-screen bg-black text-white">CodeGalaxy 3D</div>;
}
```

`src/index.css`：

```css
@import "tailwindcss";
```

`src/vite-env.d.ts`：

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: 验证脚手架**

Run: `npm run typecheck && npm run dev`（打开 http://localhost:5173 看到 "CodeGalaxy 3D" 黑底白字，Ctrl+C 退出）
Expected: 页面正常显示，typecheck 零错误

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: Vite + React 19 + Tailwind 4 脚手架"
```

---

### Task 2: 共享类型与语言配色

**Files:**
- Create: `src/lib/types.ts`, `src/lib/lang-color.ts`
- Test: `tests/lang-color.test.ts`

- [ ] **Step 1: 写 src/lib/types.ts（全项目共享类型，后续任务不得另起炉灶）**

```ts
export type NodeType = 'star' | 'planet' | 'moon';

/** GitHub git/trees API 的一条记录 */
export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface GalaxyNode {
  id: string; // 完整路径，star 为 'repo:{owner}/{repo}'
  name: string; // 路径最后一段
  type: NodeType;
  depth: number; // star=0，一级目录=1，依此类推
  size: number; // bytes；目录为 0
  langColor: string;
  childCount: number; // planet：递归文件总数；其余 0
  overflowCount: number; // planet：因 top-K 被聚合掉的直接子文件数；其余 0
  x: number;
  y: number;
  z: number;
}

export interface GalaxyLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GalaxyNode[];
  links: GalaxyLink[];
  truncated: boolean; // GitHub 树是否被截断
}

export interface RepoMeta {
  owner: string;
  repo: string;
  branch: string;
  stars: number;
  description: string;
  language: string | null;
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
}

/** AI 扫描结论 */
export interface ScanVerdict {
  path: string;
  score: number; // 1-10，越低越劣质
  reason: string;
  heuristics: number; // 启发式可疑度 0-100
}

export interface ScanResponse {
  verdicts: ScanVerdict[];
  degraded: boolean; // true = GLM 不可用，仅启发式结果
}

export interface RepoApiResponse {
  meta: RepoMeta;
  entries: TreeEntry[];
  truncated: boolean;
}
```

- [ ] **Step 2: 写失败测试 tests/lang-color.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { colorForPath } from '../src/lib/lang-color';

describe('colorForPath', () => {
  it('按扩展名返回语言色', () => {
    expect(colorForPath('src/a.ts')).toBe('#3178c6');
    expect(colorForPath('b.py')).toBe('#3572A5');
    expect(colorForPath('c.md')).toBe('#8b949e');
  });
  it('未知扩展名返回中性灰', () => {
    expect(colorForPath('weird.xyz')).toBe('#7d8590');
    expect(colorForPath('noext')).toBe('#7d8590');
  });
});
```

Run: `npm test` — Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 src/lib/lang-color.ts**

```ts
const COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', mts: '#3178c6',
  js: '#f1e05a', jsx: '#f1e05a', mjs: '#f1e05a', cjs: '#f1e05a',
  py: '#3572A5', rs: '#dea584', go: '#00ADD8', java: '#b07219',
  c: '#555555', h: '#555555', cpp: '#f34b7d', hpp: '#f34b7d', cc: '#f34b7d', cs: '#178600',
  rb: '#701516', php: '#4F5D95', swift: '#F05138', kt: '#A97BFF', scala: '#c22d40',
  vue: '#41b883', svelte: '#ff3e00',
  css: '#563d7c', scss: '#c6538c', less: '#1d365d', html: '#e34c26',
  md: '#8b949e', mdx: '#8b949e', txt: '#8b949e',
  json: '#a371f7', yml: '#4B6C8B', yaml: '#4B6C8B', toml: '#9c4221',
  sql: '#e38c00', sh: '#89e051', bash: '#89e051', lua: '#000080', dart: '#00B4AB',
  zig: '#ec915c', ex: '#6e4a7e', exs: '#6e4a7e', hs: '#5e5086', graphql: '#e10098',
};

export function colorForPath(path: string): string {
  const segs = path.split('.');
  if (segs.length < 2) return '#7d8590';
  const ext = segs.pop()!.toLowerCase();
  return COLORS[ext] ?? '#7d8590';
}
```

- [ ] **Step 4: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS (2)
```bash
git add -A && git commit -m "feat: 共享类型与语言配色表"
```

---

### Task 3: 图构建器 graph-builder

**Files:**
- Create: `src/lib/graph-builder.ts`
- Test: `tests/graph-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph, isIgnored } from '../src/lib/graph-builder';
import type { TreeEntry } from '../src/lib/types';

const E: (path: string, type: 'blob' | 'tree', size = 0) => TreeEntry = (path, type, size) => ({ path, type, size });

describe('isIgnored', () => {
  it('过滤依赖/构建产物/二进制/lock', () => {
    expect(isIgnored('node_modules/foo/index.js')).toBe(true);
    expect(isIgnored('src/.git/config')).toBe(true);
    expect(isIgnored('dist/bundle.js')).toBe(true);
    expect(isIgnored('logo.png')).toBe(true);
    expect(isIgnored('package-lock.json')).toBe(true);
    expect(isIgnored('src/App.tsx')).toBe(false);
    expect(isIgnored('src/components')).toBe(false);
  });
});

describe('buildGraph', () => {
  const entries: TreeEntry[] = [
    E('src', 'tree'),
    E('src/utils', 'tree'),
    E('src/main.ts', 'blob', 100),
    E('src/utils/a.ts', 'blob', 300),
    E('src/utils/b.ts', 'blob', 200),
    E('src/utils/c.ts', 'blob', 150),
    E('README.md', 'blob', 50),
    E('node_modules/x.js', 'blob', 999),
  ];

  it('star/planet/moon 三类节点与归属边', () => {
    const g = buildGraph(entries, 'owner/repo');
    const star = g.nodes.find((n) => n.type === 'star')!;
    expect(star.id).toBe('repo:owner/repo');
    expect(star.depth).toBe(0);
    expect(g.nodes.filter((n) => n.type === 'planet').map((n) => n.id)).toEqual(['src', 'src/utils']);
    // top-K 未触发（3 < 8），moon = 5 个 blob 中未被 ignore 的 5 个
    expect(g.nodes.filter((n) => n.type === 'moon')).toHaveLength(5);
    expect(g.links).toContainEqual({ source: 'src', target: 'src/utils' });
    expect(g.links).toContainEqual({ source: 'src/utils', target: 'src/utils/a.ts' });
    expect(g.links).toContainEqual({ source: 'repo:owner/repo', target: 'src' });
    expect(g.links).toContainEqual({ source: 'repo:owner/repo', target: 'README.md' });
  });

  it('planet 的 childCount 统计递归文件、overflowCount 统计被聚合文件', () => {
    // 造 10 个文件触发 top-K=8
    const many: TreeEntry[] = [E('pkg', 'tree'), ...Array.from({ length: 10 }, (_, i) => E(`pkg/f${i}.ts`, 'blob', i))];
    const g = buildGraph(many, 'o/r');
    const pkg = g.nodes.find((n) => n.id === 'pkg')!;
    expect(pkg.childCount).toBe(10);
    expect(pkg.overflowCount).toBe(2);
    expect(g.nodes.filter((n) => n.type === 'moon')).toHaveLength(8);
    // top-K 按 size 降序保留：f9(9)...f2(2) 保留，f0、f1 被聚合
    expect(g.nodes.some((n) => n.id === 'pkg/f0.ts')).toBe(false);
    expect(g.nodes.some((n) => n.id === 'pkg/f9.ts')).toBe(true);
  });

  it('全局 moon 上限 2500 触发时按比例缩减 K', () => {
    // 400 个目录 × 10 文件 = 4000 moon，超限
    const many: TreeEntry[] = [];
    for (let d = 0; d < 400; d++) {
      many.push(E(`p${d}`, 'tree'));
      for (let f = 0; f < 10; f++) many.push(E(`p${d}/f${f}.ts`, 'blob', f));
    }
    const g = buildGraph(many, 'o/r');
    expect(g.nodes.filter((n) => n.type === 'moon').length).toBeLessThanOrEqual(2500);
  });

  it('深度正确（根目录文件 depth=1，子目录文件 depth=2）', () => {
    const g = buildGraph(entries, 'owner/repo');
    expect(g.nodes.find((n) => n.id === 'README.md')!.depth).toBe(1);
    expect(g.nodes.find((n) => n.id === 'src/utils/a.ts')!.depth).toBe(2);
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: 实现 src/lib/graph-builder.ts**

```ts
import type { GalaxyLink, GalaxyNode, GraphData, TreeEntry } from './types';
import { colorForPath } from './lang-color';

const IGNORE_DIR_PATTERNS = [/^node_modules\//, /(^|\/)\.git(\/|$)/, /^dist\//, /^build\//, /^vendor\//, /^coverage\//, /(^|\/)\.next(\/|$)/, /(^|\/)\.venv(\/|$)/];
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'pdf', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'zip', 'gz', 'tar', 'bz2', '7z', 'mp4', 'mp3', 'webm', 'wav', 'ogg', 'class', 'jar', 'dylib', 'so', 'exe', 'dll', 'wasm', 'bin', 'dat', 'lock']);
const LOCK_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'composer.lock', 'Gemfile.lock', 'go.sum']);

export const PER_DIR_MOON_LIMIT = 8;
export const GLOBAL_MOON_LIMIT = 2500;

export function isIgnored(path: string): boolean {
  if (IGNORE_DIR_PATTERNS.some((re) => re.test(path + '/')) || IGNORE_DIR_PATTERNS.some((re) => re.test(path))) return true;
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
  const kept = entries.filter((e) => !isIgnored(e.path));
  const dirs = new Set<string>();
  const blobs: TreeEntry[] = [];
  for (const e of kept) {
    if (e.type === 'tree') {
      dirs.add(e.path);
    } else {
      blobs.push(e);
      // 补全祖先目录（GitHub tree 一定包含，但防御性处理）
      let p = parentOf(e.path);
      while (p) {
        dirs.add(p);
        p = parentOf(p);
      }
    }
  }

  // 每目录文件分组（按 size 降序）
  const byDir = new Map<string, TreeEntry[]>();
  for (const b of blobs) {
    const p = parentOf(b.path);
    (byDir.get(p) ?? byDir.set(p, []).get(p)!).push(b);
  }
  for (const list of byDir.values()) list.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

  // 全局 K：估算超限则按比例缩减（向上取整，至少 2）
  const totalMoons = blobs.length;
  let k = PER_DIR_MOON_LIMIT;
  if (totalMoons > GLOBAL_MOON_LIMIT) {
    k = Math.max(2, Math.ceil((PER_DIR_MOON_LIMIT * GLOBAL_MOON_LIMIT) / totalMoons));
  }

  const nodes: GalaxyNode[] = [];
  const links: GalaxyLink[] = [];
  const starId = `repo:${repoKey}`;
  const mk = (id: string, type: GalaxyNode['type'], depth: number, size: number): GalaxyNode => {
    const n: GalaxyNode = { id, name: id.split('/').pop()!, type, depth, size, langColor: colorForPath(id), childCount: 0, overflowCount: 0, x: 0, y: 0, z: 0 };
    return n;
  };

  // star
  nodes.push({ ...mk(starId, 'star', 0, 0), name: repoKey });

  // planet：目录全保留
  const sortedDirs = [...dirs].sort();
  for (const d of sortedDirs) {
    nodes.push(mk(d, 'planet', depthOf(d), 0));
    const parent = parentOf(d);
    links.push({ source: parent === '' ? starId : parent, target: d });
  }

  // planet 的 childCount（递归文件数）：按前缀统计
  const childCount = new Map<string, number>();
  for (const b of blobs) {
    let p = parentOf(b.path);
    while (true) {
      childCount.set(p, (childCount.get(p) ?? 0) + 1);
      if (p === '') break;
      p = parentOf(p);
    }
  }

  // moon：每目录 top-K
  const moonIds = new Set<string>();
  for (const [dir, list] of byDir) {
    const picked = list.slice(0, k);
    for (const b of picked) {
      moonIds.add(b.path);
      nodes.push(mk(b.path, 'moon', depthOf(b.path), b.size ?? 0));
      links.push({ source: dir === '' ? starId : dir, target: b.path });
    }
  }

  // 回填 childCount / overflowCount
  for (const n of nodes) {
    if (n.type === 'planet') {
      n.childCount = childCount.get(n.id) ?? 0;
      n.overflowCount = Math.max(0, (byDir.get(n.id)?.length ?? 0) - Math.min(k, byDir.get(n.id)?.length ?? 0));
    }
  }

  return { nodes, links, truncated: false };
}
```

- [ ] **Step 3: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS（全部用例）
```bash
git add -A && git commit -m "feat: graph-builder 文件树转星系图数据（过滤/top-K 聚合/全局上限）"
```

---

### Task 4: import 解析器 import-resolver

**Files:**
- Create: `src/lib/import-resolver.ts`
- Test: `tests/import-resolver.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { extractImportSpecifiers, resolveToNodeId } from '../src/lib/import-resolver';

const SRC = `
import { a } from './util/helper';
import b from "../lib/foo";
const c = require('./legacy/mod');
const d = await import("./dynamic/thing");
import { external } from 'react';
`;

describe('extractImportSpecifiers', () => {
  it('提取 ESM/require/动态 import 三种形态，忽略裸包名', () => {
    const specs = extractImportSpecifiers(SRC);
    expect(specs).toContain('./util/helper');
    expect(specs).toContain('../lib/foo');
    expect(specs).toContain('./legacy/mod');
    expect(specs).toContain('./dynamic/thing');
    expect(specs).toContain('react');
  });
});

describe('resolveToNodeId', () => {
  const ids = new Set(['src/util/helper.ts', 'src/lib/foo.tsx', 'src/legacy/mod/index.ts', 'src/dynamic/thing.js']);
  it('相对路径补全扩展名后命中图节点', () => {
    expect(resolveToNodeId('src/app/main.tsx', './util/helper', ids)).toBe('src/util/helper.ts');
    expect(resolveToNodeId('src/lib/inner/deep.ts', '../lib/foo', ids)).toBe('src/lib/foo.tsx');
  });
  it('目录命中 index 文件', () => {
    expect(resolveToNodeId('src/app/main.ts', './legacy/mod', ids)).toBe('src/legacy/mod/index.ts');
  });
  it('裸包名与未命中返回 null', () => {
    expect(resolveToNodeId('src/a.ts', 'react', ids)).toBeNull();
    expect(resolveToNodeId('src/a.ts', './nope', ids)).toBeNull();
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: 实现 src/lib/import-resolver.ts**

```ts
// 覆盖：import x from '...' / import {a} from '...' / export ... from '...' / require('...') / import('...')
const IMPORT_RE = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\1/g;

export function extractImportSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) out.push(m[2]);
  return out;
}

export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

export function resolveToNodeId(fromPath: string, spec: string, nodeIds: Set<string>): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // 裸包名或 URL，不处理
  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const joined = spec.startsWith('/') ? spec : `${baseDir}/${spec}`;
  for (const suffix of CANDIDATES) {
    const candidate = normalizePath(joined + suffix);
    if (candidate && nodeIds.has(candidate)) return candidate;
  }
  return null;
}
```

- [ ] **Step 3: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS
```bash
git add -A && git commit -m "feat: import 解析器（三种形态提取 + 相对路径补全匹配图节点）"
```

---

### Task 5: 启发式评分 heuristics

**Files:**
- Create: `src/lib/heuristics.ts`
- Test: `tests/heuristics.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { heuristicScore, CODE_EXT } from '../src/lib/heuristics';

describe('heuristicScore', () => {
  it('干净短文件得分接近 0', () => {
    const r = heuristicScore('const a = 1;\nexport default a;\n', 'src/a.ts');
    expect(r.score).toBeLessThan(10);
    expect(r.signals).toHaveLength(0);
  });
  it('TODO/FIXME/HACK 计入可疑度', () => {
    const code = Array.from({ length: 20 }, (_, i) => `// TODO: fix ${i}`).join('\n');
    const r = heuristicScore(code, 'src/b.ts');
    expect(r.score).toBeGreaterThan(20);
    expect(r.signals.join()).toContain('TODO');
  });
  it('超长文件累计惩罚', () => {
    const code = 'x\n'.repeat(1200);
    const r = heuristicScore(code, 'src/big.ts');
    expect(r.score).toBeGreaterThanOrEqual(30); // >500(+15) + >1000(+15)
  });
  it('any 密度与空 catch 计入', () => {
    const code = 'function f(a: any, b: any, c: any, d: number) {}\ntry { f(1,2,3,4) } catch (e) {}\n'.repeat(2);
    const r = heuristicScore(code, 'src/c.ts');
    expect(r.score).toBeGreaterThan(10);
  });
  it('score 上限 100', () => {
    const messy = ('// HACK\n: any\n' + 'try{}catch(e){}\n').repeat(200);
    expect(heuristicScore(messy, 'x.ts').score).toBeLessThanOrEqual(100);
  });
  it('CODE_EXT 覆盖常见代码扩展名', () => {
    expect(CODE_EXT.has('ts')).toBe(true);
    expect(CODE_EXT.has('md')).toBe(false);
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: 实现 src/lib/heuristics.ts**

```ts
export interface HeuristicResult {
  score: number; // 0-100 可疑度
  signals: string[]; // 命中的异味信号（供 UI 展示）
}

export const CODE_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'py', 'rb', 'php', 'java', 'cs', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cc', 'swift', 'kt', 'scala', 'vue', 'svelte']);

const SMELL_RULES: Array<{ re: RegExp; weight: number; max: number; label: (n: number) => string }> = [
  { re: /\b(TODO|FIXME|HACK|XXX)\b/g, weight: 3, max: 24, label: (n) => `${n} 处 TODO/FIXME/HACK` },
  { re: /:\s*any\b/g, weight: 4, max: 16, label: (n) => `${n} 处 any 类型` },
  { re: /catch\s*(\([^)]*\))?\s*\{\s*\}/g, weight: 6, max: 18, label: (n) => `${n} 处空 catch` },
  { re: /@ts-(ignore|nocheck|expect-error)/g, weight: 4, max: 12, label: (n) => `${n} 处 ts 抑制注释` },
  { re: /\beval\s*\(/g, weight: 10, max: 10, label: (n) => `${n} 处 eval` },
  { re: /innerHTML\s*=/g, weight: 5, max: 10, label: (n) => `${n} 处 innerHTML 赋值` },
];

export function heuristicScore(content: string, _path: string): HeuristicResult {
  const signals: string[] = [];
  let score = 0;
  const lines = content.split('\n');
  const lineCount = lines.length;

  if (lineCount > 500) { score += 15; signals.push(`文件 ${lineCount} 行（>500）`); }
  if (lineCount > 1000) { score += 15; signals.push(`文件 ${lineCount} 行（>1000）`); }
  const longLines = lines.filter((l) => l.length > 300).length;
  if (longLines > 0) { score += Math.min(10, longLines * 2); signals.push(`${longLines} 行超长（>300 字符）`); }

  for (const rule of SMELL_RULES) {
    const n = (content.match(rule.re) ?? []).length;
    if (n > 0) {
      score += Math.min(rule.max, n * rule.weight);
      signals.push(rule.label(n));
    }
  }
  return { score: Math.min(100, score), signals };
}
```

- [ ] **Step 3: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS
```bash
git add -A && git commit -m "feat: 代码异味启发式评分（行数/TODO/any/空 catch 等）"
```

---

### Task 6: GitHub API 中间件

**Files:**
- Create: `src/server/github.ts`
- Test: `tests/server-github.test.ts`

- [ ] **Step 1: 写失败测试（mock 全局 fetch）**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRepo, fetchRawFile } from '../src/server/github';

const GH_JSON = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body } as Response);
const GH_TEXT = (body: string, status = 200) => ({ status, ok: status < 400, text: async () => body } as Response);

afterEach(() => vi.unstubAllGlobals());

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
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: 实现 src/server/github.ts**

```ts
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

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'codegalaxy-3d' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function mapStatusError(status: number, repoKey: string): GithubError {
  if (status === 404) return new GithubError('not_found', `仓库 ${repoKey} 不存在或为私有`);
  if (status === 403 || status === 429) return new GithubError('rate_limited', 'GitHub API 限额已用尽，可配置 GITHUB_TOKEN 环境变量');
  return new GithubError('network', `GitHub API 异常（HTTP ${status}）`);
}

export async function fetchRepo(owner: string, repo: string): Promise<RepoApiResponse> {
  const key = `${owner}/${repo}`;
  const cached = repoCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders() }).catch(() => null);
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

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${meta.branch}?recursive=1`, { headers: ghHeaders() });
  if (!treeRes.ok) throw mapStatusError(treeRes.status, key);
  const t = await treeRes.json() as { tree: TreeEntry[]; truncated: boolean };

  const data: RepoApiResponse = { meta, entries: t.tree ?? [], truncated: !!t.truncated };
  repoCache.set(key, { data, ts: Date.now() });
  return data;
}

export async function fetchRawFile(owner: string, repo: string, branch: string, path: string): Promise<FileContent> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw mapStatusError(res.status, path);
  const text = await res.text();
  return { path, content: text.length > FILE_TRUNCATE ? text.slice(0, FILE_TRUNCATE) : text, truncated: text.length > FILE_TRUNCATE };
}
```

- [ ] **Step 3: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS
```bash
git add -A && git commit -m "feat: GitHub API 服务层（元信息+文件树+raw 文件，缓存与错误映射）"
```

---

### Task 7: AI 中间件（GLM 摘要 SSE + 黑洞扫描聚合）

**Files:**
- Create: `src/server/prompts.ts`, `src/server/ai.ts`
- Test: `tests/server-ai.test.ts`

- [ ] **Step 1: 写 src/server/prompts.ts（无逻辑，直接写）**

```ts
export const SUMMARIZE_SYSTEM = `你是资深架构师。用户会给出仓库中一个文件的源码。请用中文回答：
1. 一句话总结该文件在整个项目中的作用（不超过 60 字）；
2. 代码质量评分（1-10，10 最佳）；
3. 一句话理由。
格式：先输出作用，然后换行输出"质量评分：N/10"，最后换行输出理由。不要输出多余内容。`;

export const SCAN_SYSTEM = `你是代码审计专家。评估给定文件的质量劣化程度（技术债/坏味道/风险）。
只输出严格 JSON：{"score": <1-10 整数，越低越劣质>, "reason": "<不超过 40 字的中文诊断>"}
不要输出 JSON 以外的任何文字。`;

export function summarizeUser(path: string, repoKey: string, code: string): string {
  return `仓库：${repoKey}\n文件路径：${path}\n\n源码（可能截断）：\n\`\`\`\n${code}\n\`\`\``;
}

export function scanUser(path: string, code: string): string {
  return `文件路径：${path}\n启发式信号已检出此文件可疑。\n\n源码（可能截断）：\n\`\`\`\n${code}\n\`\`\``;
}
```

- [ ] **Step 2: 写失败测试 tests/server-ai.test.ts**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zhipuChat, zhipuChatStream, scanRepo } from '../src/server/ai';
import { SCAN_SYSTEM } from '../src/server/prompts';

afterEach(() => { vi.unstubAllGlobals(); delete process.env.ZHIPU_API_KEY; });

const OK_JSON = { choices: [{ message: { content: '{"score": 3, "reason": "超长且多 TODO"}' } }] };

describe('zhipuChat', () => {
  it('无 key 抛 no_key', async () => {
    delete process.env.ZHIPU_API_KEY;
    await expect(zhipuChat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ code: 'no_key' });
  });
  it('有 key 时携带 Authorization 与默认模型', async () => {
    process.env.ZHIPU_API_KEY = 'test-key';
    const spy = vi.fn(async () => OK_JSON as Response);
    vi.stubGlobal('fetch', spy);
    await zhipuChat([{ role: 'user', content: 'hi' }], { system: SCAN_SYSTEM });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('open.bigmodel.cn/api/paas/v4/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string).model).toBe(process.env.ZHIPU_MODEL ?? 'glm-4.7');
  });
  it('GLM 返回内容外裹文字时正则兜底提取 JSON', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '结果如下：\n```json\n{"score":2,"reason":"x"}\n```' } }] }) }) as Response));
    const r = await zhipuChat([{ role: 'user', content: 'x' }], { json: true });
    expect(r).toMatchObject({ score: 2 });
  });
});

describe('zhipuChatStream', () => {
  it('返回可读的 SSE web stream', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}')); c.close(); } }) }) as Response));
    const stream = await zhipuChatStream([{ role: 'user', content: 'hi' }]);
    const text = await new Response(stream).text();
    expect(text).toContain('data: {"choices"');
  });
});

describe('scanRepo 降级', () => {
  it('GLM 全挂时降级为纯启发式（degraded=true）', async () => {
    process.env.ZHIPU_API_KEY = 'k';
    // 仓库树 + raw 文件成功，GLM 失败
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('git/trees')) return { ok: true, json: async () => ({ truncated: false, tree: [{ path: 'big.ts', type: 'blob', size: 90000 }] }) } as Response;
      if (url.includes('raw.githubusercontent')) return { ok: true, text: async () => '// TODO: a\n'.repeat(80) } as Response;
      call++;
      return { ok: false, status: 500 } as Response;
    }));
    const r = await scanRepo('o', 'r', 'main');
    expect(r.degraded).toBe(true);
    expect(r.verdicts.length).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(0);
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 3: 实现 src/server/ai.ts**

```ts
import type { ScanResponse, ScanVerdict, TreeEntry } from '../lib/types';
import { CODE_EXT, heuristicScore } from '../lib/heuristics';
import { fetchRawFile, fetchRepo } from './github';
import { SCAN_SYSTEM, scanUser } from './prompts';

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = () => process.env.ZHIPU_MODEL ?? 'glm-4.7';

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
    body: JSON.stringify({
      model: MODEL(),
      messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
      temperature: 0.1,
      max_tokens: opts.maxTokens ?? 512,
    }),
  }).catch(() => null);
  if (!res || !res.ok) throw new AiError('provider', `GLM 调用失败（${res?.status ?? 'network'}）`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!opts.json) return content;
  const m = content.match(/\{[\s\S]*\}/); // 兜底：从 markdown 代码块等外裹文字中提取 JSON
  if (!m) throw new AiError('provider', `GLM 返回非 JSON：${content.slice(0, 80)}`);
  const parsed = JSON.parse(m[0]) as { score: number; reason: string };
  return { score: Math.round(parsed.score), reason: String(parsed.reason).slice(0, 60) };
}

export async function zhipuChatStream(messages: ChatMessage[], opts: { system?: string } = {}): Promise<ReadableStream<Uint8Array>> {
  if (!process.env.ZHIPU_API_KEY) throw new AiError('no_key', '未配置 ZHIPU_API_KEY');
  const res = await fetch(ZHIPU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
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

/** 并发执行，返回 [结果, 错误] 元组——错误不打断其他任务 */
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

const SCAN_TOP_N = 30;   // 启发式候选数
const SCAN_AI_TOP = 8;   // GLM 深评数
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
    .map((f) => ({ ...f, heuristics: heuristicScore(f.content, f.path) }))
    .sort((a, b) => b.heuristics.score - a.heuristics.score)
    .slice(0, SCAN_AI_TOP);

  // 启发式都极干净则无黑洞
  if (ranked.length === 0 || ranked[0].heuristics.score === 0) return { verdicts: [], degraded: false };

  const judged = await pooled(ranked, SCAN_AI_TOP, async (f) => {
    const r = await zhipuChat([{ role: 'user', content: scanUser(f.path, f.content) }], { system: SCAN_SYSTEM, json: true }) as { score: number; reason: string };
    return { path: f.path, score: r.score, reason: r.reason, heuristics: f.heuristics.score } satisfies ScanVerdict;
  });

  const verdicts = judged.flatMap((r) => (r.ok ? [r.value] : []));
  if (verdicts.length > 0) return { verdicts, degraded: false };

  // GLM 全部失败 → 降级：启发分映射为 1-10（heuristics>=50 → 3 分档，否则 5 分档）
  return {
    verdicts: ranked.map((f) => ({ path: f.path, score: f.heuristics.score >= 50 ? 3 : 5, reason: `降级评估：${f.heuristics.signals.slice(0, 2).join('；') || '启发式可疑'}`, heuristics: f.heuristics.score })),
    degraded: true,
  };
}
```

- [ ] **Step 4: 跑测试通过后 Commit**

Run: `npm test` — Expected: PASS
```bash
git add -A && git commit -m "feat: GLM 封装（非流式+流式）、扫描聚合（启发式初筛+并发深评+降级）"
```

---

### Task 8: Vite API 中间件接线

**Files:**
- Create: `src/server/middleware.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: 写 src/server/middleware.ts（HTTP 层，薄封装；逻辑已在 Task 6/7 单测覆盖）**

```ts
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchRawFile, fetchRepo, GithubError } from './github';
import { scanRepo, zhipuChatStream, AiError } from './ai';
import { SUMMARIZE_SYSTEM, summarizeUser } from './prompts';

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '/', 'http://local');
}

async function body(req: IncomingMessage): Promise<string> {
  let data = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk: Buffer) => (data += chunk));
    req.on('end', () => resolve());
  });
  return data;
}

export function apiPlugin(): Plugin {
  return {
    name: 'codegalaxy-api',
    configureServer(server) {
      server.middlewares.use('/api/repo', async (req, res) => {
        try {
          const q = query(req);
          const { owner, repo } = Object.fromEntries(q);
          if (!owner || !repo) return json(res, 400, { error: '缺少 owner/repo 参数' });
          json(res, 200, await fetchRepo(owner, repo));
        } catch (e) {
          const code = e instanceof GithubError ? e.code : 'network';
          const status = code === 'not_found' ? 404 : code === 'rate_limited' ? 403 : 502;
          json(res, status, { error: (e as Error).message, code });
        }
      });

      server.middlewares.use('/api/file', async (req, res) => {
        try {
          const { owner, repo, branch, path } = Object.fromEntries(query(req));
          if (!owner || !repo || !branch || !path) return json(res, 400, { error: '缺少参数' });
          json(res, 200, await fetchRawFile(owner, repo, branch, path));
        } catch (e) {
          json(res, 502, { error: (e as Error).message });
        }
      });

      server.middlewares.use('/api/ai/summarize', async (req, res) => {
        try {
          const { path, repoKey, code } = JSON.parse(await body(req)) as Record<string, string>;
          const stream = await zhipuChatStream([{ role: 'user', content: summarizeUser(path, repoKey, code) }], { system: SUMMARIZE_SYSTEM });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const { Readable } = await import('node:stream');
          Readable.fromWeb(stream as never).pipe(res);
        } catch (e) {
          const code = e instanceof AiError ? e.code : 'provider';
          json(res, code === 'no_key' ? 501 : 502, { error: (e as Error).message, code });
        }
      });

      server.middlewares.use('/api/ai/scan', async (req, res) => {
        try {
          const { owner, repo, branch } = JSON.parse(await body(req)) as Record<string, string>;
          json(res, 200, await scanRepo(owner, repo, branch));
        } catch (e) {
          json(res, 502, { error: (e as Error).message });
        }
      });
    },
  };
}
```

- [ ] **Step 2: 修改 vite.config.ts 注册插件**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiPlugin } from './src/server/middleware';

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
});
```

- [ ] **Step 3: 手动验收（需联网）**

Run: `npm run dev &`，然后：
```bash
curl -s 'http://localhost:5173/api/repo?owner=sindresorhus&repo=is-even' | head -c 400
curl -s 'http://localhost:5173/api/repo?owner=a&repo=nope-no-no'          # 404
curl -s -X POST http://localhost:5173/api/ai/summarize -H 'Content-Type: application/json' -d '{"path":"a.ts","repoKey":"t","code":"const x: any = 1"}' | head -c 200
```
Expected: 第一条返回 JSON（含 meta/entries）；第二条 404；第三条若本机配置了 ZHIPU_API_KEY 则开始流出 SSE，否则返回 501 未配置。kill 掉 dev server。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Vite 中间件接线 /api/repo /api/file /api/ai/summarize /api/ai/scan"
```

---

### Task 9: 全局状态 store

**Files:**
- Create: `src/app/store.ts`

- [ ] **Step 1: 实现 src/app/store.ts（zustand；UI 编排层不单测）**

```ts
import { create } from 'zustand';
import type { GalaxyNode, GraphData, RepoApiResponse, ScanResponse } from '../lib/types';
import { buildGraph } from '../lib/graph-builder';

export type LoadStatus = 'idle' | 'loading' | 'layout' | 'ready' | 'error';

interface GalaxyState {
  status: LoadStatus;
  error: string | null;
  meta: RepoApiResponse['meta'] | null;
  graph: GraphData | null;
  truncated: boolean;
  selected: GalaxyNode | null;
  focus: { id: string; ts: number } | null; // FocusController 监听 ts 变化
  comets: Array<{ from: string; to: string }>;
  scan: (ScanResponse & { running: boolean }) | null;

  loadRepo(owner: string, repo: string): Promise<void>;
  applyLayout(coords: Array<{ id: string; x: number; y: number; z: number }>): void;
  selectNode(node: GalaxyNode | null): void;
  setComets(comets: Array<{ from: string; to: string }>): void;
  runScan(): Promise<void>;
  clearScan(): void;
}

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const url = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (url) return { owner: url[1], repo: url[2] };
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  return short ? { owner: short[1], repo: short[2] } : null;
}

export const useGalaxy = create<GalaxyState>((set, get) => ({
  status: 'idle',
  error: null,
  meta: null,
  graph: null,
  truncated: false,
  selected: null,
  focus: null,
  comets: [],
  scan: null,

  async loadRepo(owner, repo) {
    set({ status: 'loading', error: null, graph: null, selected: null, comets: [], scan: null });
    try {
      const res = await fetch(`/api/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
      const data = await res.json() as RepoApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `加载失败（${res.status}）`);
      set({ meta: data.meta, graph: buildGraph(data.entries, `${owner}/${repo}`), truncated: data.truncated, status: 'layout' });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  applyLayout(coords) {
    const g = get().graph;
    if (!g) return;
    const byId = new Map(coords.map((c) => [c.id, c]));
    for (const n of g.nodes) {
      const c = byId.get(n.id);
      if (c) { n.x = c.x; n.y = c.y; n.z = c.z; }
    }
    set({ graph: { ...g }, status: 'ready' });
  },

  selectNode(node) {
    set({ selected: node, focus: node ? { id: node.id, ts: Date.now() } : null });
  },

  setComets(comets) {
    set({ comets });
    if (comets.length > 0) setTimeout(() => set({ comets: [] }), 3200);
  },

  async runScan() {
    const { meta } = get();
    if (!meta) return;
    set({ scan: { verdicts: [], degraded: false, running: true } });
    try {
      const res = await fetch('/api/ai/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: meta.owner, repo: meta.repo, branch: meta.branch }),
      });
      const data = await res.json() as ScanResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? '扫描失败');
      set({ scan: { ...data, running: false } });
    } catch (e) {
      set({ scan: { verdicts: [], degraded: true, running: false } });
      set({ error: (e as Error).message });
    }
  },

  clearScan() {
    set({ scan: null });
  },
}));
```

- [ ] **Step 2: typecheck + Commit**

Run: `npm run typecheck` — Expected: 零错误
```bash
git add -A && git commit -m "feat: zustand 全局状态（加载/布局应用/选中/流光/扫描）"
```

---

### Task 10: 3D 力导向布局 Worker

**Files:**
- Create: `src/lib/layout-worker.ts`, `src/app/useLayout.ts`

- [ ] **Step 1: 写 src/lib/layout-worker.ts（Worker 内跑 300 tick；d3-force-3d 类型缺失处用局部声明）**

```ts
/// <reference lib="webworker" />
import { forceSimulation, forceLink, forceManyBody, forceRadial } from 'd3-force-3d';

export interface LayoutRequest {
  nodes: Array<{ id: string; type: string; depth: number }>;
  links: Array<{ source: string; target: string }>;
}

const RADII = [0, 60, 130, 210, 300, 400, 510]; // 按 depth 的径向分层半径
const TICKS = 300;

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { nodes, links } = e.data;
  const simNodes = nodes.map((n) => ({ ...n }));
  const idSet = new Set(nodes.map((n) => n.id));
  const simLinks = links
    .filter((l) => idSet.has(l.source) && idSet.has(l.target))
    .map((l) => ({ ...l }));

  const sim = forceSimulation(simNodes as never[], 3)
    .force('link', forceLink(simLinks as never[])
      .id((d: { id: string }) => d.id)
      .distance((l: { source: { type: string }; target: { type: string } }) =>
        l.target.type === 'planet' ? 40 : l.source.type === 'star' ? 55 : 14)
      .strength(0.9))
    .force('charge', forceManyBody().strength((d: { type: string; childCount?: number }) =>
      d.type === 'star' ? -900 : d.type === 'planet' ? -(150 + Math.min(400, (d.childCount ?? 0) * 4)) : -18))
    .force('radial', forceRadial((d: { depth: number }) => RADII[Math.min(d.depth, RADII.length - 1)] * 1.4, 0.35).strength(0.5))
    .stop();

  sim.tick(TICKS);

  const coords = simNodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }));
  (self as unknown as Worker).postMessage(coords);
};
```

- [ ] **Step 2: 写 src/app/useLayout.ts（React 侧：起 Worker、回传坐标、10s 超时兜底）**

```ts
import { useEffect } from 'react';
import { useGalaxy } from './store';

export function useLayout() {
  const status = useGalaxy((s) => s.status);
  const graph = useGalaxy((s) => s.graph);
  const applyLayout = useGalaxy((s) => s.applyLayout);

  useEffect(() => {
    if (status !== 'layout' || !graph) return;
    const worker = new Worker(new URL('../lib/layout-worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      // 超时兜底：终止 Worker，用节点当前坐标（布局前的 0 值）直接进入 ready
      worker.terminate();
      applyLayout(graph.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z })));
    }, 10_000);
    worker.onmessage = (e: MessageEvent<Array<{ id: string; x: number; y: number; z: number }>>) => {
      clearTimeout(timer);
      applyLayout(e.data);
      worker.terminate();
    };
    worker.postMessage({
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, depth: n.depth })),
      links: graph.links,
    });
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [status, graph, applyLayout]);
}
```

- [ ] **Step 3: typecheck + Commit**

Run: `npm run typecheck` — Expected: 零错误
```bash
git add -A && git commit -m "feat: d3-force-3d 布局 Worker + React hook（300 tick 径向分层 + 超时兜底）"
```

---

### Task 11: GalaxyCanvas 场景容器与聚焦控制器

**Files:**
- Create: `src/features/galaxy/GalaxyCanvas.tsx`, `src/features/galaxy/FocusController.tsx`

- [ ] **Step 1: 写 src/features/galaxy/FocusController.tsx**

```tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import type { CameraControls as CameraControlsImpl } from 'camera-controls';
import { useGalaxy } from '../../app/store';
import { nodeById } from './nodeById';

export function FocusController() {
  const controls = useRef<CameraControlsImpl | null>(null);
  const focus = useGalaxy((s) => s.focus);
  const graph = useGalaxy((s) => s.graph);
  const lastTs = useRef(0);

  useFrame(() => {
    if (!focus || focus.ts === lastTs.current || !graph || !controls.current) return;
    const node = nodeById(graph, focus.id);
    if (!node) return;
    lastTs.current = focus.ts;
    const dist = node.type === 'star' ? 160 : node.type === 'planet' ? 70 : 26;
    const dir = { x: 0.55, y: 0.35, z: 0.75 }; // 斜上方观察角
    void controls.current.setLookAt(
      node.x + dir.x * dist, node.y + dir.y * dist, node.z + dir.z * dist,
      node.x, node.y, node.z, true,
    );
  });

  return <CameraControls ref={controls} dampingFactor={0.08} minDistance={8} maxDistance={900} />;
}
```

- [ ] **Step 2: 写 src/features/galaxy/nodeById.ts（共享小工具）**

```ts
import type { GalaxyNode, GraphData } from '../../lib/types';

export function nodeById(graph: GraphData, id: string): GalaxyNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}
```

- [ ] **Step 3: 写 src/features/galaxy/GalaxyCanvas.tsx（EffectComposer 的 Bloom 让 emissive 发光；drei Stars 深空背景）**

```tsx
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useGalaxy } from '../../app/store';
import { FocusController } from './FocusController';

export function GalaxyCanvas({ children }: { children?: React.ReactNode }) {
  return (
    <Canvas
      camera={{ position: [260, 160, 340], fov: 55, near: 0.5, far: 6000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#03040a']} />
      <fog attach="fog" args={['#03040a', 600, 2400]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={2.2} distance={0} decay={0} color="#9db8ff" />
      <Stars radius={1800} depth={80} count={5200} factor={5} saturation={0} fade speed={0.4} />
      {children}
      <FocusController />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.32} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
      </EffectComposer>
    </Canvas>
  );
}

export function GalaxyStage() {
  // 编排组件在 Task 12/13/16/17 填充：CelestialBodies、OrbitLinks、NebulaPoints、CometStreams
  const status = useGalaxy((s) => s.status);
  if (status !== 'ready' && status !== 'layout') return null;
  return (
    <GalaxyCanvas>
      {/* Task 12/13/16 逐步挂载 */}
    </GalaxyCanvas>
  );
}
```

- [ ] **Step 4: typecheck + Commit**

Run: `npm run typecheck` — Expected: 零错误（drei 的 camera-controls 类型随包附带，若报缺类型：`npm i -D @types/camera-controls`）
```bash
git add -A && git commit -m "feat: Canvas 场景（Bloom/Stars/雾）与相机聚焦控制器"
```

---

### Task 12: 天体渲染（恒星/行星/卫星 InstancedMesh/点击/黑洞替换位）

**Files:**
- Create: `src/features/galaxy/CelestialBodies.tsx`

- [ ] **Step 1: 实现（卫星单 InstancedMesh；恒星/行星独立 Mesh；黑洞占位组件 Task 17 实现，此处先留 BlackHoleView 分支）**

```tsx
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';

export function starRadius(childCount: number): number {
  return Math.max(3, Math.min(13, 2.2 + Math.log2(childCount + 1) * 1.8));
}

function StarBody({ node }: { node: GalaxyNode }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = node.langColor === '#7d8590' ? '#ffd28a' : node.langColor;
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.12; });
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
        <sphereGeometry args={[14, 48, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[17.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PlanetBody({ node }: { node: GalaxyNode }) {
  return (
    <mesh position={[node.x, node.y, node.z]} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
      <sphereGeometry args={[starRadius(node.childCount), 24, 24]} />
      <meshStandardMaterial color={node.langColor === '#7d8590' ? '#8fa3c8' : node.langColor} roughness={0.75} metalness={0.08} emissive={'#1b2340'} emissiveIntensity={0.5} />
    </mesh>
  );
}

function MoonInstances({ moons, blackHoles }: { moons: GalaxyNode[]; blackHoles: Set<string> }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const visible = useMemo(() => moons.filter((m) => !blackHoles.has(m.id)), [moons, blackHoles]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    visible.forEach((node, i) => {
      m.makeTranslation(node.x, node.y, node.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(node.langColor));
    });
    mesh.count = visible.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const onClick = (e: { stopPropagation: () => void; instanceId: number | null }) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = visible[e.instanceId];
    if (node) useGalaxy.getState().selectNode(node);
  };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(visible.length, 1)]} onClick={onClick as never}>
      <sphereGeometry args={[1.3, 10, 10]} />
      <meshStandardMaterial roughness={0.6} metalness={0.15} emissive={'#0e1526'} emissiveIntensity={0.6} />
    </instancedMesh>
  );
}

export function CelestialBodies() {
  const graph = useGalaxy((s) => s.graph);
  const scan = useGalaxy((s) => s.scan);
  if (!graph) return null;
  const blackHoles = new Set((scan?.verdicts ?? []).filter((v) => v.score <= 4).map((v) => v.path));
  const moons = graph.nodes.filter((n) => n.type === 'moon');
  return (
    <group>
      {graph.nodes.filter((n) => n.type === 'star').map((n) => <StarBody key={n.id} node={n} />)}
      {graph.nodes.filter((n) => n.type === 'planet').map((n) => <PlanetBody key={n.id} node={n} />)}
      <MoonInstances moons={moons} blackHoles={blackHoles} />
    </group>
  );
}
```

注：黑洞命中节点从 InstancedMesh 中剔除（`visible` 过滤），其位置由 Task 17 的 `BlackHole` 独立 Mesh 呈现——两处使用同一 `blackHoles` 集合构造逻辑（score ≤ 4），保持一致。

- [ ] **Step 2: 挂入 GalaxyStage（GalaxyCanvas.tsx 内 `{children}` 位置）**

```tsx
import { CelestialBodies } from './CelestialBodies';
// GalaxyStage 返回值内：
    <GalaxyCanvas>
      <CelestialBodies />
    </GalaxyCanvas>
```

- [ ] **Step 3: typecheck + Commit**

Run: `npm run typecheck` — Expected: 零错误
```bash
git add -A && git commit -m "feat: 天体渲染（恒星发光/行星按规模/卫星 InstancedMesh 可点击）"
```

---

### Task 13: 轨道线与星云粒子

**Files:**
- Create: `src/features/galaxy/OrbitLinks.tsx`, `src/features/galaxy/NebulaPoints.tsx`

- [ ] **Step 1: 写 OrbitLinks.tsx（归属边 LineSegments；选中节点时高亮其邻接边）**

```tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGalaxy } from '../../app/store';

export function OrbitLinks() {
  const graph = useGalaxy((s) => s.graph);
  const selectedId = useGalaxy((s) => s.selected?.id ?? null);

  const geometry = useMemo(() => {
    if (!graph) return null;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const positions: number[] = [];
    const colors: number[] = [];
    const dim = new THREE.Color('#22304f');
    const hot = new THREE.Color('#7fa8ff');
    for (const l of graph.links) {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      if (!s || !t) continue;
      positions.push(s.x, s.y, s.z, t.x, t.y, t.z);
      const isHot = selectedId === l.source || selectedId === l.target;
      const c = isHot ? hot : dim;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [graph, selectedId]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}
```

- [ ] **Step 2: 写 NebulaPoints.tsx（overflow 文件以粒子呈现；确定性伪随机保证刷新稳定）**

```tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGalaxy } from '../../app/store';

function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const MAX_PER_PLANET = 200;

export function NebulaPoints() {
  const graph = useGalaxy((s) => s.graph);
  const positions = useMemo(() => {
    if (!graph) return null;
    const arr: number[] = [];
    for (const n of graph.nodes) {
      if (n.type !== 'planet' || n.overflowCount <= 0) continue;
      const count = Math.min(MAX_PER_PLANET, n.overflowCount);
      const r = rand(n.id.length * 7919 + n.overflowCount);
      for (let i = 0; i < count; i++) {
        // 行星周围的球壳状散布
        const theta = r() * Math.PI * 2;
        const phi = Math.acos(2 * r() - 1);
        const radius = 6 + r() * 10;
        arr.push(
          n.x + radius * Math.sin(phi) * Math.cos(theta),
          n.y + radius * Math.cos(phi) * 0.6,
          n.z + radius * Math.sin(phi) * Math.sin(theta),
        );
      }
    }
    if (arr.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [graph]);

  if (!positions) return null;
  return (
    <points geometry={positions}>
      <pointsMaterial color="#5d6f9f" size={0.55} transparent opacity={0.65} sizeAttenuation depthWrite={false} />
    </points>
  );
}
```

- [ ] **Step 3: 挂入 GalaxyStage 并 Commit**

`GalaxyCanvas.tsx` 的 `GalaxyStage` 内（`<CelestialBodies />` 之后）：

```tsx
import { OrbitLinks } from './OrbitLinks';
import { NebulaPoints } from './NebulaPoints';
// ...
      <OrbitLinks />
      <NebulaPoints />
```

Run: `npm run typecheck` — Expected: 零错误
```bash
git add -A && git commit -m "feat: 归属轨道线（选中高亮）与溢出文件星云粒子"
```

---

### Task 14: 仓库输入 UI 与主页面装配（M2 验收）

**Files:**
- Create: `src/features/repo-input/RepoInput.tsx`
- Modify: `src/App.tsx`, `src/features/galaxy/GalaxyCanvas.tsx`（GalaxyStage 编排完成态）

- [ ] **Step 1: 写 RepoInput.tsx（悬浮控制台：pointer-events 处理遵循设计）**

```tsx
import { useState } from 'react';
import { parseRepoInput, useGalaxy } from '../../app/store';

const EXAMPLES = [
  { label: 'vuejs/pinia', owner: 'vuejs', repo: 'pinia' },
  { label: 'd3/d3-force', owner: 'd3', repo: 'd3-force' },
  { label: 'sindresorhus/is-even', owner: 'sindresorhus', repo: 'is-even' },
];

export function RepoInput() {
  const [text, setText] = useState('');
  const loadRepo = useGalaxy((s) => s.loadRepo);
  const status = useGalaxy((s) => s.status);
  const error = useGalaxy((s) => s.error);
  const meta = useGalaxy((s) => s.meta);
  const truncated = useGalaxy((s) => s.truncated);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (owner: string, repo: string) => {
    setLocalError(null);
    void loadRepo(owner, repo);
  };

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full flex-col gap-2 p-4">
      <form
        className="pointer-events-auto flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseRepoInput(text);
          if (!parsed) return setLocalError('格式不对：请输入 owner/repo 或 GitHub 仓库链接');
          submit(parsed.owner, parsed.repo);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="owner/repo 或 https://github.com/owner/repo"
          className="w-96 rounded-lg border border-white/15 bg-black/60 px-4 py-2 font-mono text-sm text-white placeholder:text-white/35 backdrop-blur focus:border-sky-400/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'loading' || status === 'layout'}
          className="rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
        >
          {status === 'loading' || status === 'layout' ? '构建星系中…' : '生成星系'}
        </button>
      </form>
      <div className="pointer-events-auto flex gap-2 text-xs text-white/50">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} onClick={() => submit(ex.owner, ex.repo)} className="rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur transition hover:border-sky-400/40 hover:text-white">
            {ex.label}
          </button>
        ))}
      </div>
      {localError && <p className="pointer-events-none text-sm text-rose-400">{localError}</p>}
      {error && !localError && <p className="pointer-events-none text-sm text-rose-400">{error}</p>}
      {truncated && status === 'ready' && <p className="pointer-events-none text-sm text-amber-300/90">仓库过大，GitHub 树被截断，已部分渲染</p>}
      {meta && status === 'ready' && (
        <p className="pointer-events-none text-sm text-white/70">
          <span className="font-semibold text-sky-300">{meta.repo}</span> · ⭐ {meta.stars.toLocaleString()} · {meta.language ?? '多语言'} · 分支 {meta.branch}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 完成 GalaxyStage 编排（最终形态，后续任务只往里加组件）**

`GalaxyCanvas.tsx` 中 `GalaxyStage` 替换为：

```tsx
export function GalaxyStage() {
  useLayout();
  const status = useGalaxy((s) => s.status);
  if (status !== 'ready' && status !== 'layout') return null;
  return (
    <GalaxyCanvas>
      <CelestialBodies />
      <OrbitLinks />
      <NebulaPoints />
    </GalaxyCanvas>
  );
}
```

并在文件顶部补充 import：

```ts
import { useLayout } from '../../app/useLayout';
import { CelestialBodies } from './CelestialBodies';
import { OrbitLinks } from './OrbitLinks';
import { NebulaPoints } from './NebulaPoints';
```

- [ ] **Step 3: 改写 src/App.tsx**

```tsx
import { GalaxyStage } from './features/galaxy/GalaxyCanvas';
import { RepoInput } from './features/repo-input/RepoInput';

export default function App() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#03040a] text-white">
      <GalaxyStage />
      <RepoInput />
    </div>
  );
}
```

- [ ] **Step 4: M2 手动验收**

Run: `npm run typecheck && npm run dev` → 打开 http://localhost:5173：
1. 输入 `vuejs/pinia` → 出现恒星（发光）+ 行星 + 卫星星系，轨道线连接，布局成团；
2. 拖拽旋转 / 滚轮缩放正常；
3. 点击任一卫星 → 相机平滑聚焦（M2 阶段暂无面板，仅聚焦）；
4. 点击 `a/b/nope` → 行内红字错误；
5. 输入非法文本 → 格式提示。
Expected: 全部通过

- [ ] **Step 5: Commit（M2 里程碑完成）**

```bash
git add -A && git commit -m "feat: M2 完成——仓库输入 + 3D 星系渲染 + 聚焦交互"
```

---

### Task 15: AI 分析面板（流式打字机 + 目录统计）

**Files:**
- Create: `src/features/ai-panel/AiPanel.tsx`, `src/features/ai-panel/sse.ts`

- [ ] **Step 1: 写 src/features/ai-panel/sse.ts（浏览器端 SSE 解析工具）**

```ts
/** 读取 SSE 流，逐 chunk 回调 delta 文本 */
export async function readSse(res: Response, onDelta: (text: string) => void): Promise<void> {
  if (!res.body) throw new Error('无响应体');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch { /* 忽略不完整分片 */ }
      }
    }
  }
}
```

- [ ] **Step 2: 写 AiPanel.tsx（选中 moon：拉文件→流光→SSE 打字机；选中 planet：统计卡片）**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useGalaxy } from '../../app/store';
import { resolveToNodeId, extractImportSpecifiers } from '../../lib/import-resolver';
import { readSse } from './sse';

type AiState = { phase: 'idle' | 'loading-code' | 'streaming' | 'done' | 'error'; text: string; error?: string };

export function AiPanel() {
  const selected = useGalaxy((s) => s.selected);
  const meta = useGalaxy((s) => s.meta);
  const graph = useGalaxy((s) => s.graph);
  const setComets = useGalaxy((s) => s.setComets);
  const [ai, setAi] = useState<AiState>({ phase: 'idle', text: '' });
  const seqRef = useRef(0);

  useEffect(() => {
    if (!selected || !meta) { setAi({ phase: 'idle', text: '' }); return; }
    if (selected.type !== 'moon') return; // planet 统计直接渲染，不走 AI
    const seq = ++seqRef.current;
    setAi({ phase: 'loading-code', text: '' });
    (async () => {
      try {
        const fileRes = await fetch(`/api/file?owner=${meta.owner}&repo=${meta.repo}&branch=${meta.branch}&path=${encodeURIComponent(selected.id)}`);
        const file = await fileRes.json() as { content?: string; truncated?: boolean; error?: string };
        if (seq !== seqRef.current) return;
        if (!fileRes.ok || file.content == null) throw new Error(file.error ?? '无法获取源码');

        // import → 流光
        if (graph) {
          const ids = new Set(graph.nodes.map((n) => n.id));
          const targets = [...new Set(extractImportSpecifiers(file.content)
            .map((spec) => resolveToNodeId(selected.id, spec, ids))
            .filter((x): x is string => x != null))];
          if (targets.length > 0) setComets(targets.map((to) => ({ from: selected.id, to })));
        }

        setAi({ phase: 'streaming', text: '' });
        const sumRes = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selected.id, repoKey: `${meta.owner}/${meta.repo}`, code: file.content }),
        });
        if (seq !== seqRef.current) return;
        if (sumRes.status === 501) { setAi({ phase: 'error', text: '', error: '未配置 ZHIPU_API_KEY，AI 分析不可用' }); return; }
        if (!sumRes.ok) throw new Error('AI 调用失败');
        await readSse(sumRes, (delta) => {
          if (seq !== seqRef.current) return;
          setAi((s) => ({ phase: 'streaming', text: s.text + delta }));
        });
        if (seq !== seqRef.current) return;
        setAi((s) => ({ ...s, phase: 'done' }));
      } catch (e) {
        if (seq === seqRef.current) setAi({ phase: 'error', text: '', error: (e as Error).message });
      }
    })();
  }, [selected, meta, graph, setComets]);

  if (!selected) return null;

  return (
    <aside className="pointer-events-auto absolute right-0 top-0 z-20 m-4 w-[22rem] rounded-xl border border-white/12 bg-black/70 p-4 font-mono text-sm text-white/90 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-sky-400/80">
            {selected.type === 'moon' ? '卫星 · 文件' : selected.type === 'planet' ? '行星 · 目录' : '恒星 · 仓库'}
          </p>
          <h2 className="mt-0.5 break-all text-base font-semibold text-white">{selected.name}</h2>
          <p className="mt-0.5 break-all text-xs text-white/45">{selected.id}</p>
        </div>
        <button onClick={() => useGalaxy.getState().selectNode(null)} className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white">关闭</button>
      </div>

      {selected.type === 'planet' && (
        <dl className="mt-4 space-y-1.5 text-xs text-white/70">
          <div className="flex justify-between"><dt>递归文件数</dt><dd className="text-white">{selected.childCount}</dd></div>
          <div className="flex justify-between"><dt>聚合为星云</dt><dd className="text-white">{selected.overflowCount} 个文件</dd></div>
          <div className="flex justify-between"><dt>轨道深度</dt><dd className="text-white">L{selected.depth}</dd></div>
        </dl>
      )}
      {selected.type === 'star' && (
        <p className="mt-4 text-xs leading-relaxed text-white/70">仓库核心。点击行星查看目录统计，点击卫星召唤 AI 分析。</p>
      )}

      {selected.type === 'moon' && (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-xs text-white/50">
            {ai.phase === 'loading-code' && <span>正在获取源码…</span>}
            {ai.phase === 'streaming' && <span className="animate-pulse text-sky-300">AI 分析中…</span>}
          </div>
          {ai.error && <p className="mt-2 text-xs text-rose-400">{ai.error}</p>}
          {ai.text && <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-emerald-100/90">{ai.text}</pre>}
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: 挂到 App.tsx（RepoInput 之后）**

```tsx
import { AiPanel } from './features/ai-panel/AiPanel';
// return 内追加：
      <AiPanel />
```

- [ ] **Step 4: 手动验收**

Run: `npm run dev` → 加载 `vuejs/pinia`，点击一个 `.ts` 卫星：
1. 相机聚焦 + 右侧面板出现；
2. 若该文件有本地 import（ZHIPU_API_KEY 已配置时）→ 打字机逐字输出摘要与"质量评分：N/10"；
3. 点击行星 → 显示递归文件数/星云数统计（无 AI 请求）；
4. 关闭按钮可收起。
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: AI 分析面板（SSE 打字机 + 目录统计 + import 流光触发）"
```

---

### Task 16: import 流星光束

**Files:**
- Create: `src/features/galaxy/CometStreams.tsx`
- Modify: `src/features/galaxy/GalaxyCanvas.tsx`（挂载）

- [ ] **Step 1: 实现（贝塞尔光束 + 沿线移动光点 + 3 秒淡出）**

```tsx
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import { nodeById } from './nodeById';

const LIFETIME = 3.0; // 与 store.setComets 的 3200ms 淡出窗口匹配

function Comet({ from, to, born }: { from: string; to: string; born: number }) {
  const lineRef = useRef<THREE.Line>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  const graph = useGalaxy.getState().graph!;

  const { points, curve } = useMemo(() => {
    const a = nodeById(graph, from)!;
    const b = nodeById(graph, to)!;
    const mid = new THREE.Vector3(
      (a.x + b.x) / 2 + (a.y - b.y) * 0.18,
      (a.y + b.y) / 2 + 6,
      (a.z + b.z) / 2 + (a.x - b.x) * 0.18,
    );
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z),
    );
    return { points: c.getPoints(40), curve: c };
  }, [graph, from, to]);

  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  useFrame(() => {
    const t = (performance.now() - born) / 1000;
    if (t > LIFETIME) return;
    const fade = 1 - t / LIFETIME;
    const lineMat = lineRef.current?.material as THREE.LineBasicMaterial | undefined;
    if (lineMat) lineMat.opacity = 0.85 * fade;
    const dot = dotRef.current;
    if (dot) {
      const p = curve.getPointAt((t * 1.6) % 1);
      dot.position.copy(p);
      const dotMat = dot.material as THREE.MeshBasicMaterial;
      dotMat.opacity = fade;
    }
  });

  return (
    <group>
      {/* @ts-expect-error three 的 Line 类型与 R3F 内置 line 元素有差异 */}
      <line ref={lineRef} geometry={geom}>
        <lineBasicMaterial color="#6fd7ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </line>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.9, 8, 8]} />
        <meshBasicMaterial color="#bff0ff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function CometStreams() {
  const comets = useGalaxy((s) => s.comets);
  const born = useMemo(() => performance.now(), [comets]);
  const graph = useGalaxy((s) => s.graph);
  if (!graph || comets.length === 0) return null;
  if (!comets.every((c) => nodeById(graph, c.from) && nodeById(graph, c.to))) return null;
  return (
    <group key={born}>
      {comets.slice(0, 12).map((c, i) => <Comet key={`${c.from}->${c.to}:${i}`} from={c.from} to={c.to} born={born} />)}
    </group>
  );
}
```

- [ ] **Step 2: 挂载进 GalaxyStage（`<NebulaPoints />` 之后）**

```tsx
import { CometStreams } from './CometStreams';
// ...
      <CometStreams />
```

- [ ] **Step 3: 手动验收**

点击有多个本地 import 的文件（如 `vuejs/pinia` 的 `packages/pinia/src/index.ts` 不一定可见——任选可见 moon）：点击后应有多条蓝色弧光射向依赖节点、光点沿线飞行、约 3 秒淡出；轨道线同步高亮。
Expected: 特效可见且自动消失

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: import 流星光束（贝塞尔弧线 + 移动光点 + 淡出）"
```

---

### Task 17: 黑洞特效与异常扫描 UI（M4 验收）

**Files:**
- Create: `src/features/galaxy/BlackHole.tsx`, `src/features/anomaly-scan/AnomalyScan.tsx`
- Modify: `src/features/galaxy/CelestialBodies.tsx`（渲染黑洞组）, `src/App.tsx`

- [ ] **Step 1: 写 BlackHole.tsx（暗核 + ShaderMaterial 吸积盘 + 自转）**

```tsx
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';

const DISK_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DISK_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float d = distance(vUv, vec2(0.5));                 // 0 中心 → 0.5 边缘
    float ring = smoothstep(0.18, 0.24, d) * (1.0 - smoothstep(0.34, 0.5, d));
    float swirl = 0.5 + 0.5 * sin(28.0 * d - uTime * 3.0 + vUv.x * 12.0);
    vec3 hot = vec3(1.0, 0.55, 0.18);
    vec3 cool = vec3(0.45, 0.12, 0.9);
    vec3 col = mix(hot, cool, d * 2.0) * ring * (0.55 + 0.45 * swirl);
    gl_FragColor = vec4(col, ring);
  }
`;

export function BlackHole({ node }: { node: GalaxyNode }) {
  const diskRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, dt) => {
    if (diskRef.current) diskRef.current.rotation.z += dt * 0.5;
    if (matRef.current) matRef.current.uniforms.uTime.value += dt;
  });
  return (
    <group position={[node.x, node.y, node.z]} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
      <mesh>
        <sphereGeometry args={[2.1, 24, 24]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh ref={diskRef} rotation={[Math.PI / 2.35, 0.2, 0]}>
        <ringGeometry args={[2.6, 5.6, 64]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={DISK_VERT}
          fragmentShader={DISK_FRAG}
          uniforms={{ uTime: { value: 0 } }}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#ff8c3a" intensity={6} distance={26} decay={2} />
    </group>
  );
}

export function BlackHoles() {
  const graph = useGalaxy((s) => s.graph);
  const scan = useGalaxy((s) => s.scan);
  if (!graph || !scan) return null;
  const holeIds = new Set(scan.verdicts.filter((v) => v.score <= 4).map((v) => v.path));
  return (
    <group>
      {graph.nodes.filter((n) => n.type === 'moon' && holeIds.has(n.id)).map((n) => <BlackHole key={n.id} node={n} />)}
    </group>
  );
}
```

- [ ] **Step 2: 在 CelestialBodies.tsx 挂载 BlackHoles（group 内追加）**

```tsx
import { BlackHoles } from './BlackHole';
// CelestialBodies 返回的 <group> 内追加：
      <BlackHoles />
```

- [ ] **Step 3: 写 AnomalyScan.tsx（扫描按钮 + 黑洞清单侧栏 + 撤销）**

```tsx
import { useGalaxy } from '../../app/store';

export function AnomalyScan() {
  const scan = useGalaxy((s) => s.scan);
  const runScan = useGalaxy((s) => s.runScan);
  const clearScan = useGalaxy((s) => s.clearScan);
  const graph = useGalaxy((s) => s.graph);
  const selectNode = useGalaxy((s) => s.selectNode);
  if (!graph) return null;

  const holes = (scan?.verdicts ?? []).filter((v) => v.score <= 4).sort((a, b) => a.score - b.score);

  return (
    <div className="pointer-events-none absolute bottom-0 right-0 z-20 flex w-[22rem] flex-col gap-3 p-4">
      {scan && !scan.running && (
        <section className="pointer-events-auto max-h-[46vh] overflow-y-auto rounded-xl border border-orange-400/25 bg-black/70 p-4 text-sm backdrop-blur-md">
          <header className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-orange-300">黑洞清单 {holes.length > 0 && <span className="text-orange-200/70">× {holes.length}</span>}</h3>
            <button onClick={clearScan} className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:border-white/40 hover:text-white">撤销扫描</button>
          </header>
          {scan.degraded && <p className="mb-2 text-xs text-amber-300/90">GLM 不可用，以下为启发式降级结果</p>}
          {holes.length === 0 && <p className="text-xs text-white/60">未发现严重劣质文件，星系洁净 ✨</p>}
          <ul className="space-y-2">
            {holes.map((v) => (
              <li key={v.path}>
                <button onClick={() => { const n = graph.nodes.find((x) => x.id === v.path); if (n) selectNode(n); }} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-orange-400/40">
                  <p className="break-all font-mono text-xs text-white/90">{v.path}</p>
                  <p className="mt-0.5 text-xs text-orange-300">评分 {v.score}/10 · {v.reason}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="pointer-events-auto flex justify-end">
        <button
          onClick={() => void runScan()}
          disabled={scan?.running}
          className="rounded-lg border border-orange-400/40 bg-black/60 px-4 py-2 text-sm text-orange-200 backdrop-blur transition hover:bg-orange-500/20 disabled:opacity-50"
        >
          {scan?.running ? '扫描中…（拉取 + AI 评审）' : '🕳️ 扫描异常（黑洞巡查）'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 挂到 App.tsx（AiPanel 之后）**

```tsx
import { AnomalyScan } from './features/anomaly-scan/AnomalyScan';
// return 内追加：
      <AnomalyScan />
```

- [ ] **Step 5: M4 手动验收**

Run: `npm run dev` → 加载一个有技术债的中型仓库（如 `vuejs/pinia` 或任意你熟悉的仓库）：
1. 点击"扫描异常"→ 按钮进入扫描态；
2. 完成后：劣质文件（评分≤4）的卫星消失，原位出现旋转吸积盘黑洞；右下清单可点击聚焦；
3. "撤销扫描"→ 黑洞消失、卫星恢复；
4. （拔掉 ZHIPU_API_KEY 再试）→ 清单显示"启发式降级结果"。
Expected: 全部通过

- [ ] **Step 6: Commit（M4 里程碑完成）**

```bash
git add -A && git commit -m "feat: M4 完成——黑洞 ShaderMaterial 特效 + 异常扫描清单 + 撤销"
```

---

### Task 18: README 与最终整体验收

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README.md**

```markdown
# CodeGalaxy 3D 🌌

把 GitHub 仓库渲染成可交互的 3D 星系：目录是行星，文件是卫星，AI 判定的劣质代码是黑洞。

## 快速开始

```bash
npm install
ZHIPU_API_KEY=你的智谱key npm run dev   # AI 功能需要；不配置也能浏览星系
```

可选环境变量：`GITHUB_TOKEN`（提高 GitHub API 限额）、`ZHIPU_MODEL`（默认 glm-4.7）。

## 操作

- 输入 `owner/repo` 或仓库完整 URL，或点示例
- 拖拽旋转 / 滚轮缩放 / 点击天体聚焦
- 点击卫星（文件）：AI 流式摘要 + 质量评分，import 依赖化作流光射向目标
- 点击行星（目录）：文件数/星云统计
- 「扫描异常」：启发式初筛 + GLM 深评，劣质文件化为黑洞；「撤销扫描」恢复

## 架构

数据管道（GitHub Trees API → graph-builder 纯函数）→ Web Worker 内 d3-force-3d 径向分层布局 → R3F 渲染（卫星 InstancedMesh、星云 Points、Bloom）。API 层为 Vite dev-server 中间件，代理 GitHub 与智谱 GLM，密钥不出服务端。详见 `docs/superpowers/`。

## 测试

```bash
npm test
```
```

- [ ] **Step 2: 最终整体验收**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck 零错误、全部单测通过、build 成功。

浏览器全流程：示例仓库 → 星系渲染 → 点击文件（AI 摘要 + 流光）→ 扫描黑洞 → 撤销。确认无控制台报错（容忍 React StrictMode 双渲染警告）。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README 与最终验收"
```

---

## Self-Review 记录

- **Spec 覆盖**：设计文档 §4.1（Task 6/8）、§4.2（Task 3）、§4.3（Task 10）、§4.4（Task 4/7/15/16）、§4.5（Task 5/7/17）、§5 视觉（Task 11-13/16/17）、§6 错误处理（Task 6/8/14/15/17 各错误分支）、§8 测试（Task 2-7 单测）均有对应任务。
- **占位符**：无 TBD/TODO；Task 11 的 GalaxyStage 在 Task 14 完成编排，过渡期 typecheck 可过。
- **类型一致性**：`GalaxyNode/GraphData/ScanVerdict` 等以 Task 2 定义为准；`blackHoles` 集合构造（score≤4）在 Task 12 `MoonInstances` 与 Task 17 `BlackHoles` 一致；`setComets` 淡出窗口 3200ms 与 `LIFETIME=3.0` 匹配。
