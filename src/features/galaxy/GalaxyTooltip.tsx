import { useEffect, useRef } from 'react';
import { useGalaxy } from '../../app/store';
import { langNameForPath } from '../../lib/lang-color';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_LABEL = { star: '恒星 · 仓库', planet: '行星 · 目录', moon: '卫星 · 文件' } as const;

/** 全局悬停提示：跟随鼠标的单个 DOM，hover 对象存 store（进出天体才触发渲染） */
export function GalaxyTooltip() {
  const hovered = useGalaxy((s) => s.hovered);
  const status = useGalaxy((s) => s.status);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      // 跟随鼠标并留边距，靠近右/下边缘时翻转到左/上，避免溢出屏幕
      const { innerWidth, innerHeight } = window;
      const x = e.clientX + 16 + 260 > innerWidth ? e.clientX - 276 : e.clientX + 16;
      const y = e.clientY + 12 + 90 > innerHeight ? e.clientY - 100 : e.clientY + 12;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  if (!hovered || status !== 'ready') return null;

  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-40 max-w-[260px] will-change-transform">
      <div className="rounded-lg border border-white/15 bg-[#0a0e1d]/90 px-3 py-2 shadow-xl shadow-black/50 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: hovered.langColor }} />
          <span className="text-[10px] uppercase tracking-wider text-white/45">{TYPE_LABEL[hovered.type]}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-sm font-semibold text-white">{hovered.name}</p>
        <p className="truncate font-mono text-[11px] text-white/40">{hovered.id}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/60">
          {hovered.type === 'moon' && (
            <>
              {langNameForPath(hovered.id) && <span>{langNameForPath(hovered.id)}</span>}
              {hovered.size > 0 && <span>{formatBytes(hovered.size)}</span>}
            </>
          )}
          {hovered.type === 'planet' && (
            <>
              <span>{hovered.childCount} 个文件</span>
              {hovered.overflowCount > 0 && <span className="text-white/35">+{hovered.overflowCount} 聚合</span>}
              <span>L{hovered.depth}</span>
            </>
          )}
          {hovered.type === 'star' && <span>点击行星看统计，点击卫星召唤 AI</span>}
        </div>
      </div>
    </div>
  );
}
