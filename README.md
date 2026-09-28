# CodeGalaxy 3D 🌌

把 GitHub 仓库渲染成可交互的 3D 星系：目录是行星，文件是卫星，AI 判定的劣质代码是黑洞。

## 快速开始

```bash
npm install
cp .env.example .env   # 填入你的 LLM API Key（任意 OpenAI 兼容端点）
npm run dev            # 未配置 key 也能浏览星系，仅 AI 功能不可用
```

环境变量（`.env` 或 shell）：

| 变量 | 说明 |
| --- | --- |
| `LLM_BASE_URL` | OpenAI 兼容端点，如 `https://api.qiso.io/v1`（默认智谱） |
| `LLM_API_KEY` | API 密钥（向后兼容 `ZHIPU_API_KEY`） |
| `LLM_MODEL` | 模型名（如 `gpt-5.6-sol`；默认 `glm-4.7`） |
| `GITHUB_TOKEN` | 可选，提高 GitHub API 限额 |

## 操作

- 输入 `owner/repo` 或仓库完整 URL，或点示例（vuejs/pinia · d3/d3-force · sindresorhus/is）
- 拖拽旋转 / 滚轮缩放 / 点击天体聚焦 / 悬停查看详情
- 双击天体在新标签页打开对应 GitHub 文件/目录
- 按 `/` 搜索文件或目录，匹配天体在星系中高亮
- 点击卫星（文件）：AI 流式摘要 + 质量评分，import 依赖化作流光射向目标
- 点击行星（目录）：文件数/总大小/语言分布统计
- 「扫描异常」：启发式初筛 + GLM 深评（带实时进度），劣质文件化为黑洞；「撤销扫描」恢复
- 地址栏 `?repo=owner/name` 可直接分享/刷新星系链接

## 架构

数据管道（GitHub Trees API → graph-builder 纯函数）→ Web Worker 内 d3-force-3d 径向分层布局 → R3F 渲染（卫星 InstancedMesh、星云 Points、Bloom）。API 层为 Vite dev-server 中间件，代理 GitHub 与 LLM（任意 OpenAI 兼容端点），密钥不出服务端。详见 `docs/superpowers/`。

## 测试

```bash
npm test
```
