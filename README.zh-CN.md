# PPT 工作台（DSH 插件）

[![CI](https://github.com/p8054076283-del/dsh-ppt-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/p8054076283-del/dsh-ppt-studio/actions/workflows/ci.yml)

安装（插件市场 / 一条命令）：

```bash
dsh plugin --profile web add https://github.com/p8054076283-del/dsh-ppt-studio/releases/latest/download/dsh-ppt-studio.tgz
```

English docs: [README.md](README.md)

在 DeepSeek Harness 左侧栏加一个「PPT 工作台」页：把工作区里的 `.ppt-studio/deck.json` 渲染成真实 16:9 缩略图，可就地编辑、可和 AI 对话，AI 改完文件面板自动刷新。

## 用起来

1. 左侧栏点「PPT 工作台」。
2. 面板会自动读取**最近使用的工作区**里的 `.ppt-studio/deck.json`；没有就点「新建示例文稿」。
3. 左列缩略图；中间是 16:9 大预览 + 表单（版式 / 标题 / 正文 / 图片路径 / 表格）；右列是 PPT 专属的连续对话。
4. 缩略图和右列之间**只有一条分隔条**：拖动按比例分配两块宽度（窗口缩放时两边等比变化，始终铺满整页），双击恢复默认比例。
5. 对话里直接说需求（例如「把第 3 页改成两栏」）；AI 的 Markdown 回答会正常渲染（标题、列表、表格、代码、链接），底部三个按钮可一键填入常用提示词。
6. AI 改写 `deck.json` 后，面板约 1 秒内自动刷新——不需要手动刷新。

## 给对话加文件

三种方式都行，效果一样：

- **Ctrl+V 粘贴**截图或从资源管理器复制的文件（焦点在输入框里）；
- **把文件拖进右边对话栏**（会出现蓝色虚线框，松手即添加）；
- 点输入框上方工具行的**回形针**按钮选文件。

文件先上传到工作区再发给 AI：

| 类型 | 存到 | AI 怎么用 |
|---|---|---|
| 图片（png/jpg/gif/webp/svg/bmp/avif） | `.ppt-studio/assets/` | 消息里附带绝对路径，`deck.json` 直接写 `"image": "assets/xxx.png"` |
| 其他文件（pdf/docx/xlsx/md…） | `.ppt-studio/inbox/` | 消息里附带绝对路径，AI 用工具读 |

- 待发清单显示在输入框上方（文件名 / 大小 / ×移除）；上传中不会让你误发。
- 单文件上限 24 MB；同名文件自动加 ` (1)`、` (2)`，绝不覆盖已有文件。

## 导入现成的 PPTX（原样排版）

附件条里出现 `.pptx` 时，点它右边的**「导入」**：工作台会用 python-pptx 把原稿逐页转成
`deck.json` 的 `elements`——保留**每页的绝对坐标、字号、字色、粗体、对齐、图片、表格、
页面底色**，所以预览就是你原来的版面，而不是被 8 种模板重排。

- 页面的 `layout` 记为 `imported`（界面上显示「原样排版」）；这类页不会因为改版式被悄悄重建。
- 图片会抽取到 `.ppt-studio/assets/imported/`（按内容去重）。
- **母版 / 版式里的装饰也会导入**：顶栏、logo、圆点这类放在母版或版式上的元素，每页都会带上；
  页面背景按「本页 → 版式 → 母版」的顺序继承；占位符的字号/粗体/字色若只写在版式里，也能继承下来。
- 不还原：渐变（取首个色标）、阴影、旋转、图表、SmartArt、动画。
- 只在用户明确说「重做版式」时才把那页切回内置版式。

命令行也可以直接跑：

```powershell
python scripts/import-pptx.py <pptx 路径> <工作区目录>
```

## 就地改字（原样排版页）

导入进来的页面不用去改 JSON：**直接把鼠标放到页面上的文字上**，会出现虚线框（表示可编辑），
点一下就在原位打开输入框——字号、颜色、对齐、位置都沿用原稿，改完**点别处自动保存**（Esc 取消，
Ctrl+Enter 立即保存）。

- **表格也能就地改**：点任意单元格，输入框覆盖在单元格上，确认后写回 `columns/rows`。
- 第一次在 AI 生成的页面（非原样排版）上就地改字，会把那一页「烘焙」成手工排版页——之后它的
  `elements` 会留在 deck.json 里，不会再被版式重排冲掉。
- 暂不支持：颜色 / 字号 / 位置 / 层级 / 增删元素（下一步做），这些仍可在 AI 对话里让它改。

## 看 AI 干活：对话 / 过程

对话列顶部有两个标签：

- **对话**：你和 AI 的连续对话（Markdown 正常渲染）。
- **过程**：这一轮 AI 的动作时间线——`读取文件`、`运行命令`、`写入文件`…，带目标（文件路径 / 命令首行）
  和每步耗时；跑着的步骤是品牌色呼吸点，失败的变红。新一轮开始时自动切到「过程」，你手动切回
  「对话」后就固定在对话，不抢你的视线。

**改动页高亮**：AI（或任何外部程序）写 `deck.json` 时，面板比对前后两版，把被改的页在缩略图上
标成暖色并呼吸几秒，台面下出现「AI 改到第 N 页」——点一下直接跳过去。既不会静默替换内容，
也不用你逐页翻着找。

## 视觉语言

隐喻是「放映间」：**左边胶片条**（页码做成穿孔标记，条上一条细脊柱只在卡片缝隙间露出）、**中间放映台**（幻灯片浮在带辉光的台面上，台下一行页码 `04 / 07` + 翻页箭头）、**右边边桌**是 AI。

- 只用 DSH 主题变量（`--dsw-alias-*`），浅色/深色自动跟随；强调色只给「当前页、主按钮、聚焦环、分隔条」。
- 数字（页码、页数、目录路径）一律等宽等宽表格数字（tabular numerals），对齐比装饰更重要。
- AI 回答不套气泡，只用一条强调色发丝线挂在正文左侧——长 Markdown 报告读起来不闷；用户自己的话才用染色的对话泡、靠右。
- 版式选择与标题同行，正文/表格内容独占整行；表格页不显示用不到的「正文」。
- 已有 hover/active/focus-visible 状态与 40px 以上点击区，窄到 900px 面板仍然可读。

## 数据契约（`.ppt-studio/deck.json`）

```json
{
  "version": 1,
  "size": { "width": 13.333, "height": 7.5 },
  "theme": { "bg": "#FFFFFF", "fg": "#1F2328", "accent": "#2F6FED", "font": "Microsoft YaHei" },
  "meta": { "title": "文稿标题" },
  "slides": [
    {
      "id": "s1",
      "layout": "cover|section|bullets|two-col|image-right|image-full|quote|table",
      "title": "页面标题",
      "body": "正文，换行即多条要点",
      "image": "assets/xxx.png",
      "table": { "columns": ["列1"], "rows": [["值"]] },
      "notes": "备注",
      "elements": []
    }
  ]
}
```

- 尺寸单位是**英寸**，画布 13.333 × 7.5（16:9）。
- `elements` 省略即可，由版式自动排布；显式写了 `elements` 的页视为手工排版，编辑时不会被重建。
- 图片放在 `.ppt-studio/assets/` 下，用相对路径引用，面板通过 `/ppt-studio/asset` 读取。

## 结构

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主半边：loopback-only HTTP 路由（`/state` `/sessions` `/deck` `/asset` `/report` `/diag`） |
| `lib/client.js` | 浏览器半边（由 `build2.mjs` 生成，勿手改） |
| `src/bundle/prelude.js` | 常量、诊断上报、样式、侧栏图标 |
| `src/bundle/markdown.js` | 对话里的 Markdown → React 元素（纯函数，可脱离浏览器自测） |
| `src/bundle/panel.js` | 面板页组件（缩略图、编辑、对话、分隔条） |
| `src/bundle/chat.js` | 右列连续对话（会话绑定、提问卡、发送/取消） |
| `src/bundle/register.js` | 槽位注册（`sidebar.panellist` + `main`） |
| `src/client/render.js` | deck 模型 / 版式 / 幻灯片 HTML（从旧 Trae 扩展移植，纯函数） |
| `build2.mjs` | 组装 `lib/client.js`：`node build2.mjs` |
| `scripts/selftest-*.mjs` | 无浏览器自测：`markdown` / `client` / `render` / `host` |

## 开发验证

自测（不需要浏览器，改完源码先跑这一组）：

```powershell
node build2.mjs
node scripts/selftest-markdown.mjs   # Markdown → 元素结构
node scripts/selftest-client.mjs     # 打包产物：槽位注册、面板渲染、样式、分隔条契约
node scripts/selftest-render.mjs     # deck 模型 / 版式 / 幻灯片 HTML
node scripts/selftest-host.mjs       # 宿主路由（读写 deck.json）
```

真机型验证：DSH 桌面端用 `--remote-debugging-port=9222` 启动，脚本通过 CDP 连上正在运行的
渲染进程——只看不动（截图 + 量尺寸），或点开面板拖动分隔条量完再还回对话。

```powershell
node scripts/dev-live-shot.mjs  shots/live.png     # 当前页面截图 + 布局尺寸
node scripts/dev-live-open.mjs  shots              # 打开面板 / 拖分隔条 / 双击复位 / 回到对话
node scripts/dev-live-sweep.mjs shots              # 900→1920 五档宽度扫一遍，查溢出与铺满
node scripts/dev-live-diag.mjs 4 shots             # 选中第 4 页，量预览框/元素几何与计算样式
node scripts/dev-live-panel.mjs shots open        # 只开关面板 / 切「过程」标签 / 截图
python scripts/selftest-import.py                 # 导入器自测（造 pptx：组合/图片/表格/母版/继承）
node scripts/dev-live-ratio.mjs 0.66               # 把分隔比例写回 localStorage（调试后还原用户设置）
```

量表时注意：那个窗口是用户正在用的窗口，脚本会真的点开面板/改比例，跑完记得还回对话页并还原比例。

## 已知限制

- 只支持 8 种内置版式，不支持自由拖拽绘图；复杂动效/图表需在 PowerPoint 里二次加工。
- `elements` 手工排版页在改版式时会被重建。
- 预览始终完整 16:9；表单比可用高度长时整列滚动（不会压缩预览，历史 bug：曾被 flex 压成 2.66:1 裁掉下三分之一）。
- 缩略图卡片同样不参与压缩，页数多时缩略图列滚动，选中的卡片会自动滚到可见区域（历史 bug：卡片被压到 92px，16:9 缩略图被裁掉三成）。
- 对话默认发给**当前工作区里最近活动**的会话；多会话并行时以第一顺位为准。
- 面板的「会话目录」由宿主提供（走 `/ppt-studio/sessions`），不依赖客户端 remote。
