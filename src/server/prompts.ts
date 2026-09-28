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
