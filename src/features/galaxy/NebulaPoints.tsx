import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGalaxy } from '../../app/store';

/** 确定性伪随机（Lehmer LCG）；seed 必须非 0，否则恒返回 0 */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const MAX_PER_PLANET = 200;

/** overflow 文件以星云粒子呈现：planet 周围扁球壳内撒点（同 id+count 结果稳定） */
export function NebulaPoints() {
  // 注意：所有 useGalaxy 订阅必须位于提前 return 之前，保证 hooks 顺序稳定
  const graph = useGalaxy((s) => s.graph);
  const status = useGalaxy((s) => s.status);

  const geometry = useMemo(() => {
    // ready 门控：layout 前坐标全零，粒子会坍缩成原点一团（与 CelestialBodies 同理）
    if (!graph || status !== 'ready') return null;
    const arr: number[] = [];
    for (const n of graph.nodes) {
      if (n.type !== 'planet' || n.overflowCount <= 0) continue;
      const count = Math.min(MAX_PER_PLANET, n.overflowCount);
      // seed = id.length * 7919 + overflowCount 恒 > 0（id 非空、本分支 overflow > 0），不会退化成 0
      const r = rand(n.id.length * 7919 + n.overflowCount);
      for (let i = 0; i < count; i++) {
        const theta = r() * Math.PI * 2;
        const phi = Math.acos(2 * r() - 1);
        const radius = 6 + r() * 10;
        arr.push(
          n.x + radius * Math.sin(phi) * Math.cos(theta),
          n.y + radius * Math.cos(phi) * 0.6,
          n.z + radius * Math.sin(phi) * Math.sin(theta),
        );
      }
    }
    if (arr.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [graph, status]);

  // 泄漏防护：与 OrbitLinks 统一模式，重建/卸载时 dispose 旧 geometry
  useEffect(() => () => { geometry?.dispose(); }, [geometry]);

  if (!geometry) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#5d6f9f" size={0.55} transparent opacity={0.65} sizeAttenuation depthWrite={false} />
    </points>
  );
}
