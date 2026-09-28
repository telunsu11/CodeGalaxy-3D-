/** 读取 SSE 流，逐 chunk 回调 delta 文本 */
type SseFrame = { choices?: Array<{ delta?: { content?: string } }>; error?: { message?: string } | string };

export async function readSse(res: Response, onDelta: (text: string) => void): Promise<void> {
  await readSseEvents(res, (payload) => {
    if (payload === '[DONE]') return true; // true = 完整收到结束标志
    let json: SseFrame | null = null;
    try { json = JSON.parse(payload) as SseFrame | null; } catch { return false; } // 不完整分片
    if (json && !json.choices && json.error != null) {
      throw new Error(typeof json.error === 'string' ? json.error : json.error.message ?? 'AI 输出中断（错误帧）');
    }
    const delta = json?.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
    return false;
  }).then((sawDone) => { if (!sawDone) throw new Error('AI 输出中断（未收到完成标志）'); });
}

/**
 * 通用 SSE data: 事件读取：每条完整 payload 回调 onEvent。
 * 返回是否收到 [DONE] 结束标志（非流式 JSON 端点不发 [DONE]，调用方自行判断）。
 */
export async function readSseEvents(res: Response, onEvent: (payload: string) => boolean | void): Promise<boolean> {
  if (!res.body) throw new Error('无响应体');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
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
        if (onEvent(payload) === true) sawDone = true;
      }
    }
  }
  return sawDone;
}
