import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import { nodeById } from './nodeById';

const LIFETIME = 3.0; // 与 store.setComets 的 3200ms 清空窗口匹配

function Comet({ from, to, born }: { from: string; to: string; born: number }) {
  const lineRef = useRef<THREE.Line>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  // 非响应式读取可接受：CometStreams 挂载时 graph 必然存在（comets 只在 ready 后产生）
  const graph = useGalaxy.getState().graph!;

  const { points, curve } = useMemo(() => {
    const a = nodeById(graph, from)!;
    const b = nodeById(graph, to)!;
    const mid = new THREE.Vector3(
      (a.x + b.x) / 2 + (a.y - b.y) * 0.18,
      (a.y + b.y) / 2 + 6,
      (a.z + b.z) / 2 + (a.x - b.x) * 0.18,
    );
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z),
    );
    return { points: c.getPoints(40), curve: c };
  }, [graph, from, to]);

  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  // 泄漏防护：R3F 对 prop 传入的 geometry 不自动 dispose，卸载/重建时必须显式清理
  // （与 OrbitLinks/NebulaPoints 统一模式，useEffect 清理而非 useMemo 内联）
  useEffect(() => () => { geom.dispose(); }, [geom]);

  useFrame(() => {
    const t = (performance.now() - born) / 1000;
    if (t > LIFETIME) {
      const m = lineRef.current?.material as THREE.LineBasicMaterial | undefined;
      if (m) m.opacity = 0;
      if (dotRef.current) (dotRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    const fade = 1 - t / LIFETIME;
    const lineMat = lineRef.current?.material as THREE.LineBasicMaterial | undefined;
    if (lineMat) lineMat.opacity = 0.85 * fade;
    const dot = dotRef.current;
    if (dot) {
      const p = curve.getPointAt((t * 1.6) % 1);
      dot.position.copy(p);
      const dotMat = dot.material as THREE.MeshBasicMaterial;
      dotMat.opacity = fade;
    }
  });

  return (
    <group>
      {/* @ts-expect-error three 的 Line 类型与 R3F 内置 line 元素有差异 */}
      <line ref={lineRef} geometry={geom}>
        <lineBasicMaterial color="#6fd7ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </line>
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.9, 8, 8]} />
        <meshBasicMaterial color="#bff0ff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** import 流光：选中卫星时 AiPanel 调 setComets，这里渲染贝塞尔光束 + 沿线移动光点，约 3 秒淡出 */
export function CometStreams() {
  const comets = useGalaxy((s) => s.comets);
  const graph = useGalaxy((s) => s.graph);
  // 新 comets 数组 → 新 born → group key 变化强制重建子树（重播动画）
  const born = useMemo(() => performance.now(), [comets]);
  if (!graph || comets.length === 0) return null;
  if (!comets.every((c) => nodeById(graph, c.from) && nodeById(graph, c.to))) return null;
  return (
    <group key={born}>
      {comets.slice(0, 12).map((c, i) => <Comet key={`${c.from}->${c.to}:${i}`} from={c.from} to={c.to} born={born} />)}
    </group>
  );
}
