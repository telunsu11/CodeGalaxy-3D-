# CodeGalaxy 3D 设计文档

- 日期：2026-09-28
- 状态：已获用户批准（brainstorming 产出）
- 项目路径：`/Users/carry/workProject/personal/codegalaxy-3d`

## 1. 背景与目标

将 GitHub 仓库的代码结构渲染为可交互的 3D 星系：目录是行星系、文件是卫星、AI 判定的劣质代码呈现为黑洞。服务于两个场景：新成员快速建立架构直觉；架构师 Review/演示时的高颜值可视化。

**MVP 范围（用户确认：四阶段全做）**

1. 数据管道：输入 `owner/repo` → GitHub API → 图数据（nodes/links）
2. 3D 星系渲染：力导向布局 + 星系视觉（恒星/行星/卫星/星空/辉光）
3. AI 点击分析：点击文件星球 → 相机聚焦 → 拉源码 → 解析真实 import → 流星光束 + GLM 流式摘要与评分
4. 黑洞扫描：启发式初筛 + GLM 深度评分 → 低分节点切换黑洞材质 + 异常清单

**非目标（本期不做）**

- 全仓库依赖图（不跑 dependency-cruiser / Tree-sitter 全量 AST；import 解析仅对被点击文件做正则级解析）
- 部署与鉴权（本地 `npm run dev` 即交付形态）
- 多仓库对比、历史版本对比
- 移动端适配

## 2. 技术栈

| 层 | 选型 |
| --- | --- |
| 构建 | Vite 7 + React 19 + TypeScript（ESM） |
| 3D | three + @react-three/fiber + @react-three/drei + @react-three/postprocessing |
| 布局 | d3-force-3d，跑在 Web Worker |
| UI | TailwindCSS 4 + shadcn 风格组件 |
| API 层 | Vite dev server 中间件（`configureServer`），Node 端 fetch 代理 |
| AI | 智谱 GLM（`ZHIPU_API_KEY`，SSE 流式） |
| 测试 | vitest（纯逻辑层单测） |
| 包管理 | npm（与用户既有项目一致） |

## 3. 目录结构

```
codegalaxy-3d/
├── index.html
├── vite.config.ts            # 内嵌 server/ 中间件注册
├── src/
│   ├── app/                  # 入口、全局状态（仓库元信息、选中节点、扫描结果）
│   ├── server/
│   │   ├── github.ts         # /api/repo、/api/file 代理
│   │   ├── ai.ts             # /api/ai/summarize、/api/ai/scan（SSE）
│   │   └── prompts.ts        # GLM prompt 模板
│   ├── features/
│   │   ├── repo-input/       # 输入框 + 行内错误提示 + 示例仓库快捷入口
│   │   ├── galaxy/
│   │   │   ├── GalaxyCanvas.tsx      # <Canvas> 场景容器（Bloom、Stars、灯光）
│   │   │   ├── CelestialBodies.tsx   # 恒星/行星 Mesh + 卫星 InstancedMesh
│   │   │   ├── OrbitLinks.tsx        # 归属轨道线（LineSegments）
│   │   │   ├── CometStreams.tsx      # import 流星光束
│   │   │   ├── BlackHole.tsx         # 黑洞 ShaderMaterial + 吸积盘
│   │   │   └── NebulaPoints.tsx      # 超限文件的"星云"粒子
│   │   ├── ai-panel/         # 流式打字机分析面板
│   │   └── anomaly-scan/     # 扫描按钮 + 黑洞清单侧栏
│   ├── lib/
│   │   ├── graph-builder.ts  # 文件树 → {nodes, links}（纯函数）
│   │   ├── layout-worker.ts  # d3-force-3d 布局 Worker
│   │   ├── import-resolver.ts# 源码 → import → 图节点匹配（纯函数）
│   │   ├── heuristics.ts     # 代码异味启发式评分（纯函数）
│   │   └── types.ts          # GalaxyNode / GalaxyLink / ScanResult 等共享类型
│   └── components/ui/        # 悬浮控制台壳（pointer-events 处理）
└── tests/                    # vitest 单测
```

## 4. 数据流

### 4.1 仓库解析

1. 用户输入 `owner/repo` 或完整 GitHub URL；`repo-input` 解析出 owner/repo。
2. `GET /api/repo?owner=&repo=`（服务端）：
   - `GET https://api.github.com/repos/{owner}/{repo}` → 默认分支、stars、描述、语言；
   - `GET .../git/trees/{branch}?recursive=1` → 文件树（含每文件 size 与 truncated 标志）。
   - 请求头带可选 `GITHUB_TOKEN`（环境变量，未配置则匿名，限额 60/h——单仓库解析两次调用，够用）。
3. 响应缓存：同仓库元信息在内存 Map 缓存 10 分钟，避免重复解析。

### 4.2 图构建（graph-builder，纯函数）

- 输入：扁平路径数组 + size；输出：`GalaxyNode[]` 与 `GalaxyLink[]`。
- **过滤**：路径含 `node_modules/`、`.git/`、`dist/`、`build/`、`vendor/`；文件名匹配 lock 文件；二进制/图片/字体按扩展名黑名单（png/jpg/gif/ico/pdf/woff/ttf/zip 等）。
- **节点类型**：
  - `star`：仓库根，1 个；
  - `planet`：目录节点，全部保留；
  - `moon`：文件节点，按目录内 size 降序取 top-K（K=8），其余计入所在 planet 的 `overflowCount`；
  - 全局 moon 上限 2500，超限时按目录比例缩减 K，保证任何仓库规模下节点总数可控。
- **边**：目录归属边（`contains`）。
- 每节点计算：`depth`（路径深度）、`size`、`langColor`（扩展名→颜色表：ts/tsx 蓝、js/jsx 黄、py 黄绿、rs 橙、go 青、md 灰、json 紫等）。

### 4.3 布局（layout-worker）

- Worker 内 d3-force-3d：`forceLink`（归属，距离按子节点类型区分）+ `forceManyBody`（斥力）+ `forceRadial`（按 depth 分层：根在中心，深层在外）——形成星系旋臂感。
- 迭代 300 tick 收敛后 postMessage 全量坐标；主线程仅做渲染，布局期间显示进度态。

### 4.4 点击文件 → AI 分析

1. Raycasting 命中 moon → `CameraControls` 平滑聚焦（drei）。
2. `GET /api/file?owner=&repo=&path=` → raw.githubusercontent 拉源码，截断 50KB。
3. `import-resolver`（纯函数，正则提取 ESM `import ... from '...'`、CommonJS `require('...')`、动态 `import('...')` 三种形态）→ 相对路径规范化（补扩展名 .ts/.tsx/.js/.jsx、目录 index）→ 匹配图中节点 → 命中节点间绘制 `CometStreams` 流星光束（发光 Line + 移动光点），3 秒后淡出。
4. `POST /api/ai/summarize`（SSE）→ GLM prompt："用一句话总结这个文件在整个项目中的作用，并给出代码质量评分(1-10)与一句理由" → 面板打字机输出。
5. planet（目录）点击：仅聚焦 + 显示目录统计（文件数、总大小、语言分布），不调 AI。

### 4.5 黑洞扫描

1. 全局按钮"扫描异常"→ `POST /api/ai/scan`：
2. 服务端启发式初筛（`heuristics.ts` 同逻辑在 Node 端复用）：拉取全局 size top-30 文件内容（并发 5），按行数、TODO/FIXME/HACK 计数、`any` 类型密度、空 catch、超长函数段等打分；
3. 可疑 top-8 并发调 GLM 深度评分（1-10 + 一句话诊断）；
4. 评分 ≤4 的节点返回前端，切换为 `BlackHole` 材质（暗核 + 扭曲吸积盘 + 周围粒子），侧栏列出清单（分数、诊断、点击聚焦）；
5. 再次点击可撤销扫描，恢复正常材质。

## 5. 视觉规格

- 恒星：半径 ~14 的 emissive 球（仓库主语言色），Bloom 阈值使其发光。
- 行星：半径 ∝ log(目录文件数)，`MeshStandardMaterial` 柔和材质。
- 卫星：单个 `InstancedMesh`（球，半径 ~1.2），instanceColor 按语言着色。
- 轨道线：`LineSegments`，低透明度归属连线。
- 星云：overflow 文件用 `Points` 渲染（不建 Mesh），点击所在行星可显示"还有 N 个文件"。
- 背景：drei `<Stars>` 深空 + 微弱雾效。
- 悬浮 UI：全屏壳 `pointer-events: none`，按钮/面板/侧栏局部恢复 `auto`。

## 6. 错误处理

| 场景 | 行为 |
| --- | --- |
| 仓库不存在（404） | 输入框下方行内提示"仓库不存在或为私有" |
| GitHub 限额（403） | 提示"API 限额已用尽，可配置 GITHUB_TOKEN 环境变量" |
| 树 truncated | 顶部提示"仓库过大，已部分渲染" |
| 拉文件失败/非文本 | 面板提示"无法获取源码"，聚焦与轨道线仍可用 |
| GLM 调用失败 | 面板显示重试按钮；扫描降级为纯启发式结果并注明 |
| 未配置 ZHIPU_API_KEY | AI 入口显示"未配置"，3D 主体功能不受影响 |
| 超大仓库节点爆量 | 由 4.2 聚合策略兜底；布局超时 10s 强制取当前坐标 |

## 7. 性能策略

- 卫星单 InstancedMesh、星云走 Points：万级文件仓库 Draw Call 保持个位数。
- 布局计算隔离在 Worker，主线程仅渲染。
- 文件内容 50KB 截断；AI 扫描并发 5 拉取、并发 8 评分，成本可控。
- postprocessing 只保留 Bloom（视觉核心），不开 SSAO 等重特效。

## 8. 测试策略

- vitest 单测（纯函数，无 DOM）：
  - `graph-builder`：过滤规则、top-K 聚合、全局上限缩减、深度/颜色计算；
  - `import-resolver`：三种 import 形态、相对路径补扩展名、index 解析、不匹配返回空；
  - `heuristics`：样例代码字符串的异味计数与评分；
  - `server/github.ts`、`server/ai.ts`：mock fetch 的状态码分支（404/403/truncated/正常）。
- 3D 视觉层：浏览器手工验收 + 截图（react 系 E2E 对 WebGL 场景性价比低，不引入）。

## 9. 里程碑

1. **M1 数据管道**：脚手架 + server 代理 + graph-builder（含单测）→ 命令行/页面可打印图 JSON。
2. **M2 星系渲染**：Worker 布局 + Canvas 场景 + 视觉四件套（恒星/行星/卫星/轨道线）+ 聚焦交互。
3. **M3 AI 分析**：文件拉取 + import 流光 + GLM SSE 面板。
4. **M4 黑洞扫描**：启发式 + GLM 评分 + 黑洞材质 + 清单侧栏 + 撤销。

每个里程碑结束可 `npm run dev` 独立体验。
