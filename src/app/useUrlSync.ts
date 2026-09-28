import { useEffect } from 'react';
import { parseRepoInput, useGalaxy } from './store';

/**
 * URL 与仓库状态双向同步：
 * - 启动时读取 ?repo=owner/name 自动加载（可直接分享星系链接）
 * - 加载成功后 replaceState 更新地址栏（不污染历史记录），卸载时清除参数
 */
export function useUrlSync() {
  const meta = useGalaxy((s) => s.meta);
  const status = useGalaxy((s) => s.status);

  // 启动参数 → 加载（仅首帧执行一次，与 meta 订阅互不影响）
  useEffect(() => {
    const repo = new URLSearchParams(window.location.search).get('repo');
    if (repo && useGalaxy.getState().status === 'idle') {
      const parsed = parseRepoInput(repo);
      if (parsed) void useGalaxy.getState().loadRepo(parsed.owner, parsed.repo);
    }
  }, []);

  // 仓库就绪 → 写回地址栏；离开 ready（换仓库中/出错）→ 移除参数
  useEffect(() => {
    if (status === 'ready' && meta) {
      const q = `?repo=${encodeURIComponent(`${meta.owner}/${meta.repo}`)}`;
      if (window.location.search !== q) window.history.replaceState(null, '', q);
    } else if (status === 'idle' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [status, meta]);
}
