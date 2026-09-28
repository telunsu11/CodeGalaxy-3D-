import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, pipeline } from 'node:stream';
import { fetchRawFile, fetchRepo, GithubError } from './github';
import { scanRepo, llmChatStream, AiError } from './ai';
import { SUMMARIZE_SYSTEM, summarizeUser } from './prompts';

function json(res: ServerResponse, status: number, body: unknown) {
  // 防御：流式响应已发送头/体后（如 SSE 已开流再进错误分支），二次写头会以
  // unhandled rejection 崩掉整个 dev server——此时只能静默收尾
  if (res.headersSent || res.destroyed) { res.end(); return; }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** GitHub 上游错误映射：not_found→404、rate_limited→403、其余（含网络）→502 */
function jsonGithubError(res: ServerResponse, e: unknown) {
  const code = e instanceof GithubError ? e.code : 'network';
  const status = code === 'not_found' ? 404 : code === 'rate_limited' ? 403 : 502;
  json(res, status, { error: (e as Error).message, code });
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '/', 'http://local').searchParams;
}

/** 读取请求体并按 utf8 解码（导出仅为测试） */
export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve());
    req.on('error', reject); // 无 error 监听时上游异常会以未捕获异常崩掉 dev server
    req.on('close', () => resolve()); // 客户端中途断开时也 settle，防泄漏；正常 end 后触发，resolve 幂等安全
  });
  return Buffer.concat(chunks).toString('utf8'); // 整体解码，跨块多字节字符不损坏
}

export function apiPlugin(): Plugin {
  return {
    name: 'codegalaxy-api',
    configureServer(server) {
      server.middlewares.use('/api/repo', async (req, res) => {
        try {
          const q = query(req);
          const owner = q.get('owner'), repo = q.get('repo');
          if (!owner || !repo) return json(res, 400, { error: '缺少 owner/repo 参数' });
          json(res, 200, await fetchRepo(owner, repo));
        } catch (e) {
          jsonGithubError(res, e);
        }
      });

      server.middlewares.use('/api/file', async (req, res) => {
        try {
          const q = query(req);
          const owner = q.get('owner'), repo = q.get('repo'), branch = q.get('branch'), path = q.get('path');
          if (!owner || !repo || !branch || !path) return json(res, 400, { error: '缺少参数' });
          json(res, 200, await fetchRawFile(owner, repo, branch, path));
        } catch (e) {
          jsonGithubError(res, e);
        }
      });

      server.middlewares.use('/api/ai/summarize', async (req, res) => {
        try {
          const { path, repoKey, code } = JSON.parse(await readBody(req)) as Record<string, string>;
          const stream = await llmChatStream([{ role: 'user', content: summarizeUser(path, repoKey, code) }], { system: SUMMARIZE_SYSTEM });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const source = Readable.fromWeb(stream as never);
          // 兜底：GLM 超时 abort 的迟到 error 可能打到已销毁的流上（pipeline 收尾后监听器已移除），
          // 无监听的 'error' 会崩掉 dev server——空监听吸收所有迟到错误
          source.on('error', () => {});
          pipeline(source, res, (err) => { if (err) res.end(); });
        } catch (e) {
          const code = e instanceof AiError ? e.code : 'provider';
          json(res, code === 'no_key' ? 501 : 502, { error: (e as Error).message, code });
        }
      });

      server.middlewares.use('/api/ai/scan', async (req, res) => {
        // SSE：进度事件流式推送（拉取 n/30 → 评审 n/8），末帧为最终结果或错误
        try {
          const { owner, repo, branch } = JSON.parse(await readBody(req)) as Record<string, string>;
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
          try {
            const result = await scanRepo(owner, repo, branch, (p) => send({ progress: p }));
            send({ result });
          } catch (e) {
            send({ error: (e as Error).message });
          }
          res.end();
        } catch {
          if (!res.headersSent) json(res, 502, { error: '请求体非法' });
          else res.end();
        }
      });
    },
  };
}
