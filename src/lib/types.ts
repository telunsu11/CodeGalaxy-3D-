export type NodeType = 'star' | 'planet' | 'moon';

/** 黑洞判定阈值：verdict.score ≤ 此值的文件渲染为黑洞（AnomalyScan / CelestialBodies / BlackHole 三处共用，防漂移） */
export const BLACK_HOLE_SCORE_MAX = 4;

/** GitHub git/trees API 的一条记录；'commit' 为子模块 */
export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
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

/** 扫描进度事件（SSE）：拉取阶段 → AI 评审阶段 */
export interface ScanProgress {
  stage: 'fetch' | 'review';
  done: number;
  total: number;
}

export interface RepoApiResponse {
  meta: RepoMeta;
  entries: TreeEntry[];
  truncated: boolean;
}
