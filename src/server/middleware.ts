import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, pipeline } from 'node:stream';
import { fetchRawFile, fetchRepo, GithubError } from './github';
import { scanRepo, zhipuChatStream, AiError } from './ai';
import { SUMMARIZE_SYSTEM, summarizeUser } from './prompts';

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? '/', 'http://local').searchParams;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let data = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk: Buffer) => (data += chunk));
    req.on('end', () => resolve());
  });
  return data;
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
          const code = e instanceof GithubError ? e.code : 'network';
          const status = code === 'not_found' ? 404 : code === 'rate_limited' ? 403 : 502;
          json(res, status, { error: (e as Error).message, code });
        }
      });

      server.middlewares.use('/api/file', async (req, res) => {
        try {
          const q = query(req);
          const owner = q.get('owner'), repo = q.get('repo'), branch = q.get('branch'), path = q.get('path');
          if (!owner || !repo || !branch || !path) return json(res, 400, { error: '缺少参数' });
          json(res, 200, await fetchRawFile(owner, repo, branch, path));
        } catch (e) {
          json(res, 502, { error: (e as Error).message });
        }
      });

      server.middlewares.use('/api/ai/summarize', async (req, res) => {
        try {
          const { path, repoKey, code } = JSON.parse(await readBody(req)) as Record<string, string>;
          const stream = await zhipuChatStream([{ role: 'user', content: summarizeUser(path, repoKey, code) }], { system: SUMMARIZE_SYSTEM });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          // pipeline 保证上游错误被捕获并正常收尾，不会以未捕获 error 事件崩掉 dev server
          pipeline(Readable.fromWeb(stream as never), res, (err) => { if (err) res.end(); });
        } catch (e) {
          const code = e instanceof AiError ? e.code : 'provider';
          json(res, code === 'no_key' ? 501 : 502, { error: (e as Error).message, code });
        }
      });

      server.middlewares.use('/api/ai/scan', async (req, res) => {
        try {
          const { owner, repo, branch } = JSON.parse(await readBody(req)) as Record<string, string>;
          json(res, 200, await scanRepo(owner, repo, branch));
        } catch (e) {
          json(res, 502, { error: (e as Error).message });
        }
      });
    },
  };
}
