import { describe, expect, it } from 'vitest';
import { heuristicScore, CODE_EXT } from '../src/lib/heuristics';

describe('heuristicScore', () => {
  it('干净短文件得分接近 0', () => {
    const r = heuristicScore('const a = 1;\nexport default a;\n', 'src/a.ts');
    expect(r.score).toBeLessThan(10);
    expect(r.signals).toHaveLength(0);
  });
  it('TODO/FIXME/HACK 计入可疑度', () => {
    const code = Array.from({ length: 20 }, (_, i) => `// TODO: fix ${i}`).join('\n');
    const r = heuristicScore(code, 'src/b.ts');
    expect(r.score).toBeGreaterThan(20);
    expect(r.signals.join()).toContain('TODO');
  });
  it('超长文件累计惩罚', () => {
    const code = 'x\n'.repeat(1200);
    const r = heuristicScore(code, 'src/big.ts');
    expect(r.score).toBeGreaterThanOrEqual(30); // >500(+15) + >1000(+15)
  });
  it('any 密度与空 catch 计入', () => {
    const code = 'function f(a: any, b: any, c: any, d: number) {}\ntry { f(1,2,3,4) } catch (e) {}\n'.repeat(2);
    const r = heuristicScore(code, 'src/c.ts');
    expect(r.score).toBeGreaterThan(10);
  });
  it('score 上限 100', () => {
    const messy = ('// HACK\n: any\n' + 'try{}catch(e){}\n').repeat(200);
    expect(heuristicScore(messy, 'x.ts').score).toBeLessThanOrEqual(100);
  });
  it('CODE_EXT 覆盖常见代码扩展名', () => {
    expect(CODE_EXT.has('ts')).toBe(true);
    expect(CODE_EXT.has('md')).toBe(false);
  });
});
