import { useMemo } from 'react';
import * as THREE from 'three';
import { useGalaxy } from '../../app/store';

/** 归属边（planet→star、moon→planet）轨道线；选中节点时高亮其邻接边 */
export function OrbitLinks() {
  // 注意：所有 useGalaxy 订阅必须位于提前 return 之前，保证 hooks 顺序稳定
  const graph = useGalaxy((s) => s.graph);
  const selectedId = useGalaxy((s) => s.selected?.id ?? null);
  const status = useGalaxy((s) => s.status);

  const geometry = useMemo(() => {
    // ready 门控：layout 前坐标全零，画出来是原点星爆（与 CelestialBodies 同理）
    if (!graph || status !== 'ready') return null;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const positions: number[] = [];
    const colors: number[] = [];
    const dim = new THREE.Color('#22304f');
    const hot = new THREE.Color('#7fa8ff');
    for (const l of graph.links) {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      if (!s || !t) continue;
      positions.push(s.x, s.y, s.z, t.x, t.y, t.z);
      const isHot = selectedId === l.source || selectedId === l.target;
      const c = isHot ? hot : dim;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [graph, selectedId, status]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}
