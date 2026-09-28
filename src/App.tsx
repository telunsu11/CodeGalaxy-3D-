import { GalaxyStage } from './features/galaxy/GalaxyCanvas';
import { RepoInput } from './features/repo-input/RepoInput';
import { AiPanel } from './features/ai-panel/AiPanel';
import { useLayout } from './app/useLayout';

export default function App() {
  useLayout();
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#03040a] text-white">
      <GalaxyStage />
      <RepoInput />
      <AiPanel />
    </div>
  );
}
