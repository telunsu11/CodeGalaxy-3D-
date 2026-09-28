/**
 * d3-force-3d 类型 shim。
 * 背景：@types/d3-force-3d 在 npm registry 不存在（404），包本身不带类型。
 * 按 node_modules/d3-force-3d/src 实际导出（simulation/link/manyBody/radial）
 * 手写最小声明，仅覆盖本项目布局 Worker 用到的 API。
 *
 * 与包实际签名的一致性说明：
 * - forceSimulation(nodes, numDimensions)：src/simulation.js 默认导出，普通函数调用（非 new）✓
 * - Simulation.tick(n)/stop()：返回 simulation 自身，支持链式 ✓
 * - force(name) / force(name, force)：getter/setter 重载 ✓
 * - forceLink(links).id().distance().strength()：src/link.js 中三个访问器均返回
 *   force 自身，链式调用成立；distance/strength 的回调在 initialize 后收到
 *   source/target 已被替换为节点对象的 link ✓
 * - forceManyBody().strength(fn|number)：src/manyBody.js ✓
 * - forceRadial(radius, x, y, z)：src/radial.js——第 2-4 参是径向中心的坐标，
 *   不是 strength；strength 需通过 .strength() 设置 ✓
 *
 * 回调参数用泛型（而非 any）：调用方按自己的节点/link 结构给参数类型，
 * 与 strictFunctionTypes 兼容。
 */
declare module 'd3-force-3d' {
  export interface SimulationNode {
    id: string;
    x?: number;
    y?: number;
    z?: number;
    /** 允许携带 type/depth/childCount 等业务字段（d3-force 会原样保留并 mutate） */
    [key: string]: unknown;
  }

  export interface SimulationLink {
    /** 初始化后由 simulation 替换为节点对象 */
    source: string | SimulationNode;
    target: string | SimulationNode;
  }

  export interface Simulation {
    tick(n?: number): Simulation;
    stop(): Simulation;
    force(name: string): unknown;
    force(name: string, force: unknown): Simulation;
  }

  export interface LinkForce {
    id<D>(fn: (d: D) => string): LinkForce;
    distance<L>(fn: (l: L) => number): LinkForce;
    distance(v: number): LinkForce;
    strength<L>(fn: (l: L) => number): LinkForce;
    strength(v: number): LinkForce;
  }

  export interface ManyBodyForce {
    strength<D>(fn: (d: D) => number): ManyBodyForce;
    strength(v: number): ManyBodyForce;
  }

  export interface RadialForce {
    strength<D>(fn: (d: D) => number): RadialForce;
    strength(v: number): RadialForce;
    radius<D>(fn: (d: D) => number): RadialForce;
    radius(v: number): RadialForce;
    x(v: number): RadialForce;
    y(v: number): RadialForce;
    z(v: number): RadialForce;
  }

  export function forceSimulation(nodes: SimulationNode[], numDimensions?: number): Simulation;
  export function forceLink(links: SimulationLink[]): LinkForce;
  export function forceManyBody(): ManyBodyForce;
  export function forceRadial<D>(
    radius: number | ((d: D) => number),
    x?: number,
    y?: number,
    z?: number,
  ): RadialForce;
}
