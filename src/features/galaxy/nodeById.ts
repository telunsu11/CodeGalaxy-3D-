import type { GalaxyNode, GraphData } from '../../lib/types';

export function nodeById(graph: GraphData, id: string): GalaxyNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}
