/**
 * import 解析器：从源码文本提取依赖说明符，并将相对路径解析为图中已有节点 id。
 * 纯正则启发式实现，不依赖 AST 解析器，精度足够绘制"流星光束"。
 */

// 覆盖：import x from '...' / import {a} from '...' / export ... from '...'
//       / require('...') / import('...') / import '...'（副作用裸导入）
const IMPORT_RE =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;

/** 提取源码中所有依赖说明符（含裸包名），按出现顺序返回 */
export function extractImportSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) out.push(m[2]);
  return out;
}

/** 规范化路径：去掉 './' 与空段，消化 '..' */
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

/**
 * 把相对路径 spec 解析为图中节点 id。
 *
 * 由于 GitHub 仓库里可能存在路径别名/非常规 tsconfig 配置，无法精确还原
 * 编译器解析；这里采用宽松策略：从导入文件所在目录开始，逐级向上（直到
 * 仓库根）尝试拼接 spec，每级再补全扩展名/index 命中图节点，取最近命中。
 * 裸包名与 URL 直接返回 null（由调用方忽略）。
 */
export function resolveToNodeId(fromPath: string, spec: string, nodeIds: Set<string>): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // 裸包名或 URL，不处理

  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';

  // '/' 开头视为仓库根绝对路径，仅在根上解析；相对路径则收集全部祖先目录（自身优先）
  const bases: string[] = [];
  if (spec.startsWith('/')) {
    bases.push('');
  } else {
    let dir = baseDir;
    bases.push(dir);
    while (dir !== '') {
      dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
      bases.push(dir);
    }
  }

  for (const base of bases) {
    const joined = base === '' ? spec : `${base}/${spec}`;
    for (const suffix of CANDIDATES) {
      const candidate = normalizePath(joined + suffix);
      if (candidate && nodeIds.has(candidate)) return candidate;
    }
  }
  return null;
}
