import { GalaxyStage } from './features/galaxy/GalaxyCanvas';
import { GalaxyTooltip } from './features/galaxy/GalaxyTooltip';
import { GalaxyHud } from './features/galaxy/GalaxyHud';
import { RepoInput } from './features/repo-input/RepoInput';
import { AiPanel } from './features/ai-panel/AiPanel';
import { AnomalyScan } from './features/anomaly-scan/AnomalyScan';
import { SearchPanel } from './features/search/SearchPanel';
import { useLayout } from './app/useLayout';

export default function App() {
  useLayout();
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#03040a] text-white">
      {/* 深空氛围：径向星云光晕（纯 CSS，WebGL 画布之下） */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_20%,rgba(56,89,180,0.14),transparent),radial-gradient(ellipse_50%_40%_at_20%_80%,rgba(120,60,160,0.10),transparent)]" />
      <GalaxyStage />
      <RepoInput />
      <div className="absolute right-0 top-0 z-20 m-4 flex w-[22rem] flex-col items-stretch gap-3">
        <AiPanel />
        <SearchPanel />
      </div>
      <AnomalyScan />
      <GalaxyHud />
      <GalaxyTooltip />
    </div>
  );
}
