import { describe, expect, it } from 'vitest';
import { heuristicScore, CODE_EXT } from '../src/lib/heuristics';

describe('heuristicScore', () => {
  it('干净短文件得分接近 0', () => {
    const r = heuristicScore('const a = 1;\nexport default a;\n');
    expect(r.score).toBeLessThan(10);
    expect(r.signals).toHaveLength(0);
  });
  it('TODO/FIXME/HACK 计入可疑度', () => {
    const code = Array.from({ length: 20 }, (_, i) => `// TODO: fix ${i}`).join('\n');
    const r = heuristicScore(code);
    expect(r.score).toBe(24); // 20 处 × 权重 3 = 60，钳制于单规则上限 24
    expect(r.signals.join()).toContain('TODO');
  });
  it('超长文件累计惩罚', () => {
    const code = 'x\n'.repeat(1200);
    const r = heuristicScore(code);
    expect(r.score).toBe(30); // >500(+15) + >1000(+15)
  });
  it('any 密度与空 catch 计入', () => {
    const code = 'function f(a: any, b: any, c: any, d: number) {}\ntry { f(1,2,3,4) } catch (e) {}\n'.repeat(2);
    const r = heuristicScore(code);
    expect(r.score).toBeGreaterThan(10);
  });
  it('innerHTML 仅匹配赋值，不误报 == / === / != 比较', () => {
    const compare = heuristicScore('if (a.innerHTML == b) return;\nif (a.innerHTML === b) return;\nif (a.innerHTML != b) return;\n');
    expect(compare.score).toBe(0);
    expect(compare.signals).toHaveLength(0);
    const assign = heuristicScore('el.innerHTML = "<b>x</b>";\n');
    expect(assign.signals.join()).toContain('innerHTML 赋值');
  });
  it('score 上限 100（裸分超限被钳位）', () => {
    const messy = (
      '// HACK\n' +
      'const v: any = 1;\n' +
      'try {} catch (e) {}\n' +
      '// @ts-ignore\n' +
      'eval(a);\n' +
      'el.innerHTML = "<b>x</b>";\n'
    ).repeat(200); // 1200 行：裸分 = 行数 30 + 六条规则全上限 90 = 120 > 100
    expect(heuristicScore(messy).score).toBe(100);
  });
  it('CODE_EXT 覆盖常见代码扩展名', () => {
    expect(CODE_EXT.has('ts')).toBe(true);
    expect(CODE_EXT.has('md')).toBe(false);
  });
});
