/** 读取 SSE 流，逐 chunk 回调 delta 文本 */
type SseFrame = { choices?: Array<{ delta?: { content?: string } }>; error?: { message?: string } | string };

export async function readSse(res: Response, onDelta: (text: string) => void): Promise<void> {
  if (!res.body) throw new Error('无响应体');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false; // 收到 [DONE] 才算完整；干净 EOF 可能是服务端超时腰斩（pipeline res.end()）
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') { sawDone = true; continue; }
        let json: SseFrame | null = null;
        try {
          json = JSON.parse(payload) as SseFrame | null;
        } catch {
          continue; // 忽略不完整分片
        }
        // 错误帧（无 choices 且带 error）：服务端/上游中途异常，不能静默当正常输出
        if (json && !json.choices && json.error != null) {
          const msg = typeof json.error === 'string' ? json.error : json.error.message ?? 'AI 输出中断（错误帧）';
          throw new Error(msg);
        }
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      }
    }
  }
  if (!sawDone) throw new Error('AI 输出中断（未收到完成标志）');
}
