import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGalaxy } from '../../app/store';

/** 依赖全景：文件→文件的 import 连线（紫色，区别于目录归属的蓝灰轨道线） */
export function DepLinks() {
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);
  const deps = useGalaxy((s) => s.deps);

  const geometry = useMemo(() => {
    if (!graph || status !== 'ready' || !deps || deps.edges.length === 0) return null;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const positions: number[] = [];
    for (const e of deps.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [graph, status, deps]);

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#a371f7" transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}
