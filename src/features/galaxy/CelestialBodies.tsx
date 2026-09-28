import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';
import { BLACK_HOLE_SCORE_MAX } from '../../lib/types';
import { BlackHoles } from './BlackHole';

export function starRadius(childCount: number): number {
  return Math.max(3, Math.min(13, 2.2 + Math.log2(childCount + 1) * 1.8));
}

/** 本地字体（troika SDF 文字；不传 font 会走 gstatic CDN，国内不稳） */
const LABEL_FONT = '/fonts/roboto.woff';

/**
 * 天体名称标签（GPU 渲染，所有行星 + 恒星常显）：
 * 字号用世界单位直接跟随天体半径——大目录大字、小目录小字，
 * 相机拉远时自然透视缩小，形成无需计算的层级 LOD。
 */
function BodyLabel({ text, size, color = '#c9d6f0', y = 0 }: { text: string; size: number; color?: string; y?: number }) {
  return (
    <Billboard position={[0, y, 0]}>
      <Text
        font={LABEL_FONT}
        fontSize={size}
        color={color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={size * 0.08}
        outlineColor="#03040a"
        material-depthTest={false}
        material-depthWrite={false}
        renderOrder={999}
      >
        {text}
      </Text>
    </Billboard>
  );
}

/** 悬停事件公共处理器：进/出天体时更新 tooltip 状态 */
function hoverProps(node: GalaxyNode) {
  return {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); useGalaxy.getState().hoverNode(node); },
    onPointerOut: () => { useGalaxy.getState().hoverNode(null); },
  };
}

/** 双击天体在新标签页打开对应 GitHub 页面（文件→blob、目录/仓库→tree） */
function openOnGitHub(node: GalaxyNode) {
  const meta = useGalaxy.getState().meta;
  if (!meta) return;
  const kind = node.type === 'moon' ? 'blob' : 'tree';
  const path = node.type === 'star' ? '' : `/${node.id}`;
  window.open(`https://github.com/${meta.owner}/${meta.repo}/${kind}/${meta.branch}${path}`, '_blank', 'noopener');
}

function StarBody({ node }: { node: GalaxyNode }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = node.langColor === '#7d8590' ? '#ffd28a' : node.langColor;
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.12; });
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }} onDoubleClick={(e) => { e.stopPropagation(); openOnGitHub(node); }} {...hoverProps(node)}>
        <sphereGeometry args={[14, 48, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[17.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <BodyLabel text={node.name} size={5} color="#ffd28a" y={20} />
    </group>
  );
}

function PlanetBody({ node, matched }: { node: GalaxyNode; matched: boolean }) {
  const r = starRadius(node.childCount) * (matched ? 1.3 : 1);
  // 字号跟随行星半径（世界单位）：3~13 半径 → 1.7~7.2 字号
  const fontSize = Math.max(1.7, r * 0.55);
  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        scale={matched ? 1.3 : 1}
        onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}
        onDoubleClick={(e) => { e.stopPropagation(); openOnGitHub(node); }}
        {...hoverProps(node)}
      >
        <sphereGeometry args={[starRadius(node.childCount), 24, 24]} />
        <meshStandardMaterial
          color={node.langColor === '#7d8590' ? '#8fa3c8' : node.langColor}
          roughness={0.75} metalness={0.08}
          emissive={matched ? '#7fb4ff' : '#1b2340'}
          emissiveIntensity={matched ? 1.8 : 0.5}
        />
      </mesh>
      {/* 所有目录行星常显名称（大小随行星缩放，远处自然缩小） */}
      <BodyLabel text={node.name} size={fontSize} color={matched ? '#9ecbff' : '#c9d6f0'} y={r + fontSize * 0.35} />
    </group>
  );
}

function MoonInstances({ moons, blackHoles, matchedIds }: { moons: GalaxyNode[]; blackHoles: Set<string>; matchedIds: Set<string> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const visible = useMemo(() => moons.filter((m) => !blackHoles.has(m.id)), [moons, blackHoles]);
  const tmpColor = useRef(new THREE.Color());
  const tmpMatrix = useRef(new THREE.Matrix4());
  const tmpPos = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());
  const tmpScale = useRef(new THREE.Vector3());
  const WHITE = useRef(new THREE.Color('#ffffff'));

  // 单次写入：矩阵/颜色只在 visible/matchedIds 变化时重写（不再每帧全量重算）。
  // R3F 的 ref 在 effect 时已指向当前 mesh 实例；capacity 变化必然伴随 visible 变化，effect 必然重跑。
  // 搜索命中：放大 1.7x 且颜色向白色偏移 55%，在星海中一眼可辨。
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    visible.forEach((node, i) => {
      const s = matchedIds.has(node.id) ? 1.7 : 1;
      mesh.setMatrixAt(i, tmpMatrix.current.compose(
        tmpPos.current.set(node.x, node.y, node.z),
        tmpQuat.current.identity(),
        tmpScale.current.set(s, s, s),
      ));
      mesh.setColorAt(i, tmpColor.current.set(node.langColor).lerp(WHITE.current, s > 1 ? 0.55 : 0));
    });
    mesh.count = visible.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visible, matchedIds]);

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
  const onDblClick = (e: { stopPropagation: () => void; instanceId: number | null }) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = visible[e.instanceId];
    if (node) openOnGitHub(node);
  };

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(visible.length, 1)]} onClick={onClick as never} onDoubleClick={onDblClick as never} onPointerOver={onOver as never} onPointerOut={onOut}>
      <sphereGeometry args={[1.3, 10, 10]} />
      <meshStandardMaterial roughness={0.6} metalness={0.15} emissive={'#0e1526'} emissiveIntensity={0.6} />
    </instancedMesh>
  );
}

/**
 * 卫星名称标签（距离驱动）：卫星可达数千，全部常显既糊又拖性能——
 * 每约 200ms 扫一次相机 100 世界单位内的卫星，取最近 40 个显示；
 * 选中卫星强制入列。远景（相机远超 100）自然退场，行星标签接管。
 */
const MOON_LABEL_RADIUS = 100;
const MOON_LABEL_MAX = 40;

function MoonLabels() {
  const camera = useThree((s) => s.camera);
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const selectedId = useGalaxy((s) => s.selected?.id ?? null);
  const hoveredId = useGalaxy((s) => s.hovered?.id ?? null);
  const [ids, setIds] = useState<string[]>([]);
  const sigRef = useRef('');
  const tickRef = useRef(0);

  useFrame(() => {
    if (!graph || status !== 'ready') return;
    if (++tickRef.current % 12 !== 0) return; // ~5 次/秒，避免每帧排序
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const near: Array<{ id: string; d: number }> = [];
    for (const n of graph.nodes) {
      if (n.type !== 'moon') continue;
      const d = (n.x - cx) ** 2 + (n.y - cy) ** 2 + (n.z - cz) ** 2;
      if (d < MOON_LABEL_RADIUS * MOON_LABEL_RADIUS) near.push({ id: n.id, d });
    }
    near.sort((a, b) => a.d - b.d);
    const next = near.slice(0, MOON_LABEL_MAX).map((x) => x.id);
    if (selectedId && !next.includes(selectedId)) next.push(selectedId); // 选中强制显示
    const sig = next.join(',');
    if (sig !== sigRef.current) { sigRef.current = sig; setIds(next); }
  });

  const byId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  return (
    <group>
      {ids.map((id) => {
        const n = byId.get(id);
        if (!n) return null;
        const emphasized = id === selectedId || id === hoveredId;
        return (
          <Billboard key={id} position={[n.x, n.y + 2, n.z]}>
            <Text
              font={LABEL_FONT}
              fontSize={emphasized ? 2.1 : 1.5}
              color={emphasized ? '#dff0ff' : '#8b9cc7'}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.14}
              outlineColor="#03040a"
              material-depthTest={false}
              material-depthWrite={false}
              renderOrder={998}
            >
              {n.name}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}

export function CelestialBodies() {
  // 注意：所有 hooks（useGalaxy 订阅与 useMemo）必须位于提前 return 之前，保证 hooks 顺序稳定
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const scan = useGalaxy((s) => s.scan);
  const searchQuery = useGalaxy((s) => s.searchQuery);
  // useMemo 稳定引用：否则每次渲染 new Set/新数组会让 MoonInstances 的 visible 重算、useLayoutEffect 无谓重跑
  const blackHoles = useMemo(
    () => new Set((scan?.verdicts ?? []).filter((v) => v.score <= BLACK_HOLE_SCORE_MAX).map((v) => v.path)),
    [scan],
  );
  const moons = useMemo(() => (graph?.nodes ?? []).filter((n) => n.type === 'moon'), [graph]);
  const matchedIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !graph) return new Set<string>();
    return new Set(graph.nodes.filter((n) => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).map((n) => n.id));
  }, [graph, searchQuery]);
  if (!graph || status !== 'ready') return null; // 指令 A：layout 阶段坐标全零，ready 前只留星空（跃迁入场）
  return (
    <group>
      {graph.nodes.filter((n) => n.type === 'star').map((n) => <StarBody key={n.id} node={n} />)}
      {graph.nodes.filter((n) => n.type === 'planet').map((n) => <PlanetBody key={n.id} node={n} matched={matchedIds.has(n.id)} />)}
      <MoonInstances moons={moons} blackHoles={blackHoles} matchedIds={matchedIds} />
      <MoonLabels />
      <BlackHoles />
    </group>
  );
}
