import { describe, expect, it } from 'vitest';
import { parseRepoInput } from '../src/app/store';

describe('parseRepoInput', () => {
  it('解析完整 GitHub URL', () => {
    expect(parseRepoInput('https://github.com/vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
    expect(parseRepoInput('http://github.com/vuejs/core')).toEqual({ owner: 'vuejs', repo: 'core' });
  });

  it('解析 owner/repo 简写形态', () => {
    expect(parseRepoInput('facebook/react')).toEqual({ owner: 'facebook', repo: 'react' });
    expect(parseRepoInput('  carry.yy/project-x  ')).toEqual({ owner: 'carry.yy', repo: 'project-x' });
  });

  it('剥离 .git 后缀与尾部斜杠', () => {
    expect(parseRepoInput('https://github.com/user/repo.git')).toEqual({ owner: 'user', repo: 'repo' });
    expect(parseRepoInput('https://github.com/user/repo/')).toEqual({ owner: 'user', repo: 'repo' });
    expect(parseRepoInput('https://github.com/user/repo.git/')).toEqual({ owner: 'user', repo: 'repo' });
  });

  it('非法输入返回 null', () => {
    expect(parseRepoInput('https://gitlab.com/a/b')).toBeNull();
    expect(parseRepoInput('just-one-word')).toBeNull();
    expect(parseRepoInput('a/b/c')).toBeNull();
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('   ')).toBeNull();
  });
});
