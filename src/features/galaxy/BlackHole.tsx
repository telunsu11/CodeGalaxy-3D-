import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGalaxy } from '../../app/store';
import type { GalaxyNode } from '../../lib/types';

const DISK_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DISK_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float d = distance(vUv, vec2(0.5));
    float ring = smoothstep(0.18, 0.24, d) * (1.0 - smoothstep(0.34, 0.5, d));
    float swirl = 0.5 + 0.5 * sin(28.0 * d - uTime * 3.0 + vUv.x * 12.0);
    vec3 hot = vec3(1.0, 0.55, 0.18);
    vec3 cool = vec3(0.45, 0.12, 0.9);
    vec3 col = mix(hot, cool, d * 2.0) * ring * (0.55 + 0.45 * swirl);
    gl_FragColor = vec4(col, ring);
  }
`;

export function BlackHole({ node }: { node: GalaxyNode }) {
  const diskRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, dt) => {
    if (diskRef.current) diskRef.current.rotation.z += dt * 0.5;
    if (matRef.current) matRef.current.uniforms.uTime.value += dt;
  });
  return (
    <group position={[node.x, node.y, node.z]} onClick={(e) => { e.stopPropagation(); useGalaxy.getState().selectNode(node); }}>
      <mesh>
        <sphereGeometry args={[2.1, 24, 24]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh ref={diskRef} rotation={[Math.PI / 2.35, 0.2, 0]}>
        <ringGeometry args={[2.6, 5.6, 64]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={DISK_VERT}
          fragmentShader={DISK_FRAG}
          uniforms={{ uTime: { value: 0 } }}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#ff8c3a" intensity={6} distance={26} decay={2} />
    </group>
  );
}

export function BlackHoles() {
  const graph = useGalaxy((s) => s.graph);
  const scan = useGalaxy((s) => s.scan);
  if (!graph || !scan) return null;
  const holeIds = new Set(scan.verdicts.filter((v) => v.score <= 4).map((v) => v.path));
  return (
    <group>
      {graph.nodes.filter((n) => n.type === 'moon' && holeIds.has(n.id)).map((n) => <BlackHole key={n.id} node={n} />)}
    </group>
  );
}
