import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';
import { BLACK_HOLE_SCORE_MAX } from '../../lib/types';
import { BlackHoles } from './BlackHole';

export function starRadius(childCount: number): number {
  return Math.max(3, Math.min(13, 2.2 + Math.log2(childCount + 1) * 1.8));
}

function StarBody({ node }: { node: GalaxyNode }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = node.langColor === '#7d8590' ? '#ffd28a' : node.langColor;
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.12; });
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
        <sphereGeometry args={[14, 48, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[17.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PlanetBody({ node }: { node: GalaxyNode }) {
  return (
    <mesh position={[node.x, node.y, node.z]} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
      <sphereGeometry args={[starRadius(node.childCount), 24, 24]} />
      <meshStandardMaterial color={node.langColor === '#7d8590' ? '#8fa3c8' : node.langColor} roughness={0.75} metalness={0.08} emissive={'#1b2340'} emissiveIntensity={0.5} />
    </mesh>
  );
}

function MoonInstances({ moons, blackHoles }: { moons: GalaxyNode[]; blackHoles: Set<string> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const visible = useMemo(() => moons.filter((m) => !blackHoles.has(m.id)), [moons, blackHoles]);
  const tmpColor = useRef(new THREE.Color());
  const tmpMatrix = useRef(new THREE.Matrix4());

  // 单次写入：矩阵/颜色只在 visible 变化时重写（不再每帧全量重算）。
  // R3F 的 ref 在 effect 时已指向当前 mesh 实例；capacity 变化必然伴随 visible 变化，effect 必然重跑。
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    visible.forEach((node, i) => {
      mesh.setMatrixAt(i, tmpMatrix.current.makeTranslation(node.x, node.y, node.z));
      mesh.setColorAt(i, tmpColor.current.set(node.langColor));
    });
    mesh.count = visible.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visible]);

  const onClick = (e: { stopPropagation: () => void; instanceId: number | null }) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = visible[e.instanceId];
    if (node) useGalaxy.getState().selectNode(node);
  };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(visible.length, 1)]} onClick={onClick as never}>
      <sphereGeometry args={[1.3, 10, 10]} />
      <meshStandardMaterial roughness={0.6} metalness={0.15} emissive={'#0e1526'} emissiveIntensity={0.6} />
    </instancedMesh>
  );
}

export function CelestialBodies() {
  // 注意：所有 hooks（useGalaxy 订阅与 useMemo）必须位于提前 return 之前，保证 hooks 顺序稳定
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const scan = useGalaxy((s) => s.scan);
  // useMemo 稳定引用：否则每次渲染 new Set/新数组会让 MoonInstances 的 visible 重算、useLayoutEffect 无谓重跑
  const blackHoles = useMemo(
    () => new Set((scan?.verdicts ?? []).filter((v) => v.score <= BLACK_HOLE_SCORE_MAX).map((v) => v.path)),
    [scan],
  );
  const moons = useMemo(() => (graph?.nodes ?? []).filter((n) => n.type === 'moon'), [graph]);
  if (!graph || status !== 'ready') return null; // 指令 A：layout 阶段坐标全零，ready 前只留星空（跃迁入场）
  return (
    <group>
      {graph.nodes.filter((n) => n.type === 'star').map((n) => <StarBody key={n.id} node={n} />)}
      {graph.nodes.filter((n) => n.type === 'planet').map((n) => <PlanetBody key={n.id} node={n} />)}
      <MoonInstances moons={moons} blackHoles={blackHoles} />
      <BlackHoles />
    </group>
  );
}
