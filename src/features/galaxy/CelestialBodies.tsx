import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';
import { BLACK_HOLE_SCORE_MAX } from '../../lib/types';
import { BlackHoles } from './BlackHole';

export function starRadius(childCount: number): number {
  return Math.max(3, Math.min(13, 2.2 + Math.log2(childCount + 1) * 1.8));
}

/** 悬停事件公共处理器：进/出天体时更新 tooltip 状态 */
function hoverProps(node: GalaxyNode) {
  return {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); useGalaxy.getState().hoverNode(node); },
    onPointerOut: () => { useGalaxy.getState().hoverNode(null); },
  };
}

function StarBody({ node }: { node: GalaxyNode }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = node.langColor === '#7d8590' ? '#ffd28a' : node.langColor;
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.12; });
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }} {...hoverProps(node)}>
        <sphereGeometry args={[14, 48, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[17.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <Html center distanceFactor={300} position={[0, 20, 0]} className="pointer-events-none select-none" zIndexRange={[10, 0]}>
        <div className="whitespace-nowrap font-mono text-sm font-semibold text-amber-200/90 drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]">{node.name}</div>
      </Html>
    </group>
  );
}

function PlanetBody({ node }: { node: GalaxyNode }) {
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }} {...hoverProps(node)}>
        <sphereGeometry args={[starRadius(node.childCount), 24, 24]} />
        <meshStandardMaterial color={node.langColor === '#7d8590' ? '#8fa3c8' : node.langColor} roughness={0.75} metalness={0.08} emissive={'#1b2340'} emissiveIntensity={0.5} />
      </mesh>
      {/* 一级目录常显标签（数量少），深层目录靠悬停 tooltip */}
      {node.depth === 1 && (
        <Html center distanceFactor={260} position={[0, starRadius(node.childCount) + 5, 0]} className="pointer-events-none select-none" zIndexRange={[10, 0]}>
          <div className="whitespace-nowrap rounded bg-black/45 px-1.5 py-0.5 font-mono text-[11px] text-white/75 backdrop-blur-[2px]">
            {node.name} <span className="text-white/35">{node.childCount}</span>
          </div>
        </Html>
      )}
    </group>
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

  // InstancedMesh hover：pointerover/out 均携带 instanceId，直接映射到节点
  const onOver = (e: { stopPropagation: () => void; instanceId: number | null }) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = visible[e.instanceId];
    if (node) useGalaxy.getState().hoverNode(node);
  };
  const onOut = () => { useGalaxy.getState().hoverNode(null); };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(visible.length, 1)]} onClick={onClick as never} onPointerOver={onOver as never} onPointerOut={onOut}>
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
