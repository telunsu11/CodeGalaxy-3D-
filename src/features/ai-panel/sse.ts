/** 读取 SSE 流，逐 chunk 回调 delta 文本 */
export async function readSse(res: Response, onDelta: (text: string) => void): Promise<void> {
  if (!res.body) throw new Error('无响应体');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch { /* 忽略不完整分片 */ }
      }
    }
  }
}
