import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useGalaxy } from '../../app/store';
import { FocusController } from './FocusController';
import { CelestialBodies } from './CelestialBodies';
import { OrbitLinks } from './OrbitLinks';
import { NebulaPoints } from './NebulaPoints';
import { CometStreams } from './CometStreams';
import { DepLinks } from './DepLinks';

export function GalaxyCanvas({ children }: { children?: ReactNode }) {
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
  // Canvas 常驻（idle 也显示深空星空），避免换仓库时整体卸载/重建 WebGL 上下文——
  // 整树卸载与 drei <Html> 的 DOM portal 清理存在竞态（removeChild 报错），天体子树各自有 ready 门控
  return (
    <GalaxyCanvas>
      <CelestialBodies />
      <OrbitLinks />
      <DepLinks />
      <NebulaPoints />
      <CometStreams />
    </GalaxyCanvas>
  );
}
