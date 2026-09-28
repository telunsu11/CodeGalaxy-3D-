import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { readBody } from '../src/server/middleware';

const asReq = (r: Readable): IncomingMessage => r as unknown as IncomingMessage;
const TIMEOUT = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('挂起未 settle')), 300));

describe('readBody', () => {
  it('跨块多字节 UTF-8 字符不损坏', async () => {
    const buf = Buffer.from('a评价b'); // 评 = E8 AF 84（3 字节）
    const chunks = [buf.subarray(0, 2), buf.subarray(2)]; // 在"评"的 UTF-8 序列中间切开
    expect(await readBody(asReq(Readable.from(chunks)))).toBe('a评价b');
  });

  it('req error 事件时 reject 而非挂起', async () => {
    const r = new Readable({ read() {} });
    r.on('error', () => {}); // 防未修复版本无监听触发 uncaughtException
    const p = readBody(asReq(r));
    r.destroy(new Error('boom'));
    await expect(Promise.race([p, TIMEOUT])).rejects.toThrow('boom');
  });

  it('客户端中断（close 无 end）时仍 settle 不泄漏', async () => {
    const r = new Readable({ read() {} });
    const p = readBody(asReq(r));
    r.push(Buffer.from('partial'));
    r.destroy(); // 无 error，仅触发 close
    await expect(Promise.race([p, TIMEOUT])).resolves.toBe('partial');
  });
});
