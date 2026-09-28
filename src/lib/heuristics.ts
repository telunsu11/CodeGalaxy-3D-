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
  { re: /innerHTML\s*=(?!=)/g, weight: 5, max: 10, label: (n) => `${n} 处 innerHTML 赋值` },
];

export function heuristicScore(content: string): HeuristicResult {
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
