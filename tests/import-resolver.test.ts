import { describe, expect, it } from 'vitest';
import { extractImportSpecifiers, resolveToNodeId } from '../src/lib/import-resolver';

const SRC = `
import { a } from './util/helper';
import b from "../lib/foo";
const c = require('./legacy/mod');
const d = await import("./dynamic/thing");
import { external } from 'react';
`;

describe('extractImportSpecifiers', () => {
  it('提取三种形态与裸包名', () => {
    const specs = extractImportSpecifiers(SRC);
    expect(specs).toContain('./util/helper');
    expect(specs).toContain('../lib/foo');
    expect(specs).toContain('./legacy/mod');
    expect(specs).toContain('./dynamic/thing');
    expect(specs).toContain('react');
  });
});

describe('resolveToNodeId', () => {
  const ids = new Set(['src/util/helper.ts', 'src/lib/foo.tsx', 'src/legacy/mod/index.ts', 'src/dynamic/thing.js']);
  it('相对路径补全扩展名后命中图节点', () => {
    expect(resolveToNodeId('src/app/main.tsx', './util/helper', ids)).toBe('src/util/helper.ts');
    expect(resolveToNodeId('src/lib/inner/deep.ts', '../lib/foo', ids)).toBe('src/lib/foo.tsx');
  });
  it('目录命中 index 文件', () => {
    expect(resolveToNodeId('src/app/main.ts', './legacy/mod', ids)).toBe('src/legacy/mod/index.ts');
  });
  it('裸包名与未命中返回 null', () => {
    expect(resolveToNodeId('src/a.ts', 'react', ids)).toBeNull();
    expect(resolveToNodeId('src/a.ts', './nope', ids)).toBeNull();
  });
  it('bases 顺序锁定：标准路径优先于向上回溯命中', () => {
    const both = new Set([...ids, 'src/app/util/helper.ts']);
    expect(resolveToNodeId('src/app/main.tsx', './util/helper', both)).toBe('src/app/util/helper.ts');
  });
});
