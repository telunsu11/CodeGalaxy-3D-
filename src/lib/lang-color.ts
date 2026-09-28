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

/** 扩展名 → 语言显示名（未收录返回 null，由调用方落到"其他"） */
const LANG_NAMES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java',
  c: 'C', h: 'C', cpp: 'C++', hpp: 'C++', cc: 'C++', cs: 'C#',
  rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', scala: 'Scala',
  vue: 'Vue', svelte: 'Svelte',
  css: 'CSS', scss: 'SCSS', less: 'Less', html: 'HTML',
  md: 'Markdown', mdx: 'MDX', txt: '文本',
  json: 'JSON', yml: 'YAML', yaml: 'YAML', toml: 'TOML',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', lua: 'Lua', dart: 'Dart',
  zig: 'Zig', ex: 'Elixir', exs: 'Elixir', hs: 'Haskell', graphql: 'GraphQL',
};

export function langNameForPath(path: string): string | null {
  const segs = path.split('.');
  if (segs.length < 2) return null;
  return LANG_NAMES[segs.pop()!.toLowerCase()] ?? null;
}

export function colorForPath(path: string): string {
  const segs = path.split('.');
  if (segs.length < 2) return '#7d8590';
  const ext = segs.pop()!.toLowerCase();
  return COLORS[ext] ?? '#7d8590';
}
