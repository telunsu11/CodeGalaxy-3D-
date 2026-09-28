import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useGalaxy } from '../../app/store';
import { nodeById } from './nodeById';

/** 监听 store 的 focus.ts 变化，动画飞往目标节点的斜上方观察位 */
export function FocusController() {
  const controls = useRef<CameraControlsImpl | null>(null);
  const focus = useGalaxy((s) => s.focus);
  const graph = useGalaxy((s) => s.graph);
  const lastTs = useRef(0);

  useFrame(() => {
    if (!focus || focus.ts === lastTs.current || !graph || !controls.current) return;
    const node = nodeById(graph, focus.id);
    if (!node) { lastTs.current = focus.ts; return; } // 指令 C：找不到也推进 ts，防止每帧重复 O(n) find
    lastTs.current = focus.ts;
    const dist = node.type === 'star' ? 160 : node.type === 'planet' ? 70 : 26;
    const dir = { x: 0.55, y: 0.35, z: 0.75 }; // 斜上方观察角
    void controls.current.setLookAt(
      node.x + dir.x * dist, node.y + dir.y * dist, node.z + dir.z * dist,
      node.x, node.y, node.z, true,
    );
  });

  // camera-controls 3.x：dampingFactor 已废弃（no-op），平滑度改用 smoothTime（秒）
  return <CameraControls ref={controls} smoothTime={0.25} minDistance={8} maxDistance={900} />;
}
