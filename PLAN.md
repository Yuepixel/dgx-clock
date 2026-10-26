# 任务章程 · DGX CLOCK（三眼表盘浮窗）

> 独立项目，**与 dashboard 无代码耦合**：采集链从 `../dashboard` 复用，视觉自成一派。
> 2026-10-26 起窗口外壳由 pywebview 换成 Electron（透明窗体的唯一可靠路线）。

## 1. 目标（一句话）
一个无边框、置顶、**窗体透明**的小窗：标题栏保留深灰不透明条，其余区域透出桌面；
中央蓝钢针 = decode t/s，12 点 GPU / 9 点 TTFT / 6 点 MEMORY 三眼小表盘，
3 点 DGX 标识 + 双格并发窗 + 斜体引擎名；**只显示表盘本身，无背景染色、无底部数字行**。

## 2. 非目标（明确不做）
- **不修改** `../dashboard/` 下任何文件（采集链只读复用；发布树内 vendor 一份便于独立构建）。
- 开发时采集链以 `../dashboard` 为单一真源；`dashboard/` 里的副本只用于开源发布/便携打包，不改逻辑。
- 不做曲线 / 历史 / 告警 / 配置界面（dashboard 已有，本窗只求一眼看清）。
- 不做开机自启注册（提供 `launch.vbs`，自启由用户自行决定是否挂）。

## 3. 验收标准（可客观判定）
| # | 标准 | 判定方式 |
|---|---|---|
| A1 | 窗口起来、无边框、置顶、任务栏隐藏；**窗体透明**，标题栏保持 `#22252a` 不透明 | 观察桌面透出 + 点标题栏按钮 |
| A2 | 中央针 = 引擎实时 decode（0–120 t/s），与 dashboard 同屏对照一致 | 两窗并排对照 |
| A3 | 12 点 GPU% / 9 点 TTFT / 6 点 MEMORY% 三眼与真机一致 | 对照 dashboard 与 `nvidia-smi` |
| A4 | 3 点显示 `RUN\|MAX` 双格（如 `02\|04`）+ 斜体引擎名 | 截图 |
| A5 | 只显示表盘：无背景染色、无底部数字行、立体表圈保留 | 截图 |
| A6 | 无引擎 / 断连时优雅降级（`--`，不崩、不留上一台引擎的旧值） | 停引擎 / 拔 SSH 观察 |
| A7 | `python -m py_compile` 通过；`/metrics` 能拿到真机数据 | 命令 / 浏览器 |
| A8 | 窗口默认 380×424，四边 + 四角 + 右下抓手可缩放；位置/尺寸/置顶跨重启保留 | 拖拽缩放、重启对照 |
| A9 | 本地 commit（不 push） | `git log` |
| A10 | 表盘由 `themes.json` 的 `faces` 定义；点击标题栏胶囊按 `faces` 顺序整套轮换（布局 + 配色），胶囊显示表盘短名，当前表盘跨重启保留；旧 state 只有 `theme` 时映射到同配色经典表盘 | 点击标题、重启对照 |
| A11 | decode / TTFT 没有新数据时（含引擎 idle），指针从最后一次有效值在约 2.2s 内缓缓回落到 0；有数据立即接管 | 断引擎/引擎空闲观察，或 mock 停数据后采样角度 |
| A12 | 外圈温度环：正常温度用当前主题主色，>60°C 推向暖沙、>80°C 砖红；无数据隐藏；不改变主题盘面 | 改 mock 温度 40/54/88 截图对照 |
| A13 | 表盘切换：四档经典（原色/石庭/雾林/翡翠）点击循环、配色与布局同时切换、`state.json` 写入 `face`；旧 `theme` 状态可无感迁移 | 真机点击 + 读 state.json + 重启 |
| A14 | 数据卡表盘：霓虹配色（黑底/粉卡/青字/绿环/橙黄侧弧），中央 decode 60s 曲线（卡片 200×112），两侧 POWER/TTFT 真弧 + 横排两行标签，左上 E2E 小环，GPU/MEM 小环，卡下四格细并发柱（按负载绿→红），底部温度弧；DGX 居中、时间缩小右上并内收 | 5 档循环截图 + run=1/4 色阶 + 真机对照 |

## 4. 阶段分解
| 阶段 | 目标 | 交付物 | 状态 |
|---|---|---|---|
| 0 | 设计稿 | `ui.html` + `.mock/preview*.png`（立体表圈 = preview19） | ✅ |
| 1 | 小表盘配色调整 | `SUB_COLOR` + 同色刻度/数值 | ✅（preview21） |
| 2 | 采集服务 + 浮窗 | `clock_server.py` | ✅ |
| 3 | 章程 + 启动脚本 | 本文件 + `launch.vbs` | ✅ |
| 4 | git init + 提交 | 首次提交 | ✅ |
| 5 | 窗体透明（Electron 外壳） | `electron/main.js` / `preload.js` / `package.json` | ✅ |
| 6 | 边缘/刻度/底纹修正 | 表圈去掉固定弧线、刻度逐格径向渐变 + 侧壁、小表盘蜗纹 | ✅ |
| 7 | 缩放与状态 | 8 向缩放手柄 + 右下抓手、`%APPDATA%\dgx-clock\state.json` | ✅ |
| 8 | 文档 + 提交 | 本文件更新 + 本地 commit | ✅ |
| 9 | 配色文件 + 标题轮换 | `themes.json`、`/themes`、`win:set-theme`、标题胶囊 | ✅ |
| 10 | 无数据指针回落 | decode / TTFT 2.2s 线性回零，rAF 逐帧重绘；idle 检测 | ✅ |
| 11 | 温度外圈 | `themes.json` 的 `temperature` + 表圈外温度环/柔光（theme 模式） | ✅ |
| 12 | 配色/温度环/指针回落 | 四套主题、温度环 theme 模式、idle 回落、指针层序 | ✅ |
| 13 | 模块化 + 配置化 + 便携包 | `dgxclock/` 包、`main.py`、`config.json`、`build_portable.py`、`dist/` | ✅ |
| 14 | 前端拆分 | `ui/index.html` + `app.css` + `js/*.js`（原生 ESM，零构建） | ✅ |
| 15 | 表盘切换 | `themes.json` 的 `faces[]`、`ui/js/faces/classic.js`、`applyFace`、`state.face` | ✅ |
| 16 | 数据卡表盘 | `ui/js/faces/card.js`、decode 60s 曲线、功耗/TTFT 竖弧、温度弧 | ✅ |

## 5. 架构（数据流一条链）
```
main.py → dgxclock.app
  ├─ config.py      读 config.json（hosts / ssh / clock / window）
  ├─ dashboard.py   注入 webview 空壳后复用 ../dashboard/gb10_monitor.py
  │                 · build_remote_cmd  远端 bash：nvidia-smi + meminfo + spbm + 引擎 URL
  │                 · MetricsState.push 窗口增量 → decode / prefill / TTFT / 端到端
  │                 · Collector(thread) 每机一条 SSH 长连接（断线 3s 重连）
  ├─ server.py      127.0.0.1:<随机端口>
  │                 GET /        → ui/index.html（缺则 ui.html 回退）
  │                 GET /metrics → JSON（每秒一帧，no-store）
  │                 GET /themes  → themes.json（每次读盘）
  │                 GET /config  → config.json 的 clock / window 摘要（启动时拉一次）
  └─ app.py         spawn electron/electron.exe --url --config --state-dir
                    ↓
electron/main.js  BrowserWindow(transparent, frame:false, alwaysOnTop)
  · 默认尺寸/最小尺寸/默认置顶 ← config.json 的 window
  · 位置/尺寸/置顶/表盘/配色 ← state.json（源码：%APPDATA%\dgx-clock；便携：exe 同目录）
                    ↓
ui/index.html  pickMetrics() → renderClock() → 按 S.FACE.layout 派发
         · face    → 标题胶囊点击按 themes.json 的 faces 顺序整套轮换（布局 + 配色）
         · decode  → 经典脸：中央蓝钢针（config: clock.decode_max，默认 120 t/s）
         · util    → 经典脸：12 点 GPU%（取最高）
         · ttft_ms → 经典脸：9 点 TTFT（config: clock.ttft_max，默认 5000 ms）
         · mem     → 经典脸：6 点 MEMORY%（取最高）
         · run/lanes → 经典脸：3 点双格并发窗
         · model   → 中轴花体引擎名（各脸自行定位）
         · 无数据  → decode / TTFT 从最后一次值（config: clock.decay_seconds）回零（rAF）
```
- **谁负责什么**：`dgxclock/` 只管配置、采集、HTTP、启动顺序；Electron 只管窗口；
  前端只管画。三层互不复制逻辑。
- **前端模块**：`ui/index.html`（骨架）+ `ui/app.css` + `ui/js/{state,dial,theme,decay,temp,metrics,shell,main}.js`
  + `ui/js/faces/*.js`（每种布局一个模块，导出 `defs/staticSvg/live/after`）。
  原生 ES modules、零构建；`ui.html` 保留为单文件回退（只含经典脸，服务端优先 `ui/index.html`）。
- **表盘模型**：`themes.json` 的 `faces[]` 是唯一真源，每档 = `{id, layout, theme, name, short}`；
  `theme` 指向 `themes` 配色库。`S.FACE` 为当前档，`S.FACE_ORDER` 为轮换顺序；
  `applyFace()` 负责换配色 → 重建静态层 → 重画 → 胶囊文字 → 写 `state.json`。
  `main.js` 的 `LAYOUTS` 注册布局模块；新布局 = `faces/<id>.js` + 注册一行 + `faces` 一条。
- **两种布局**：`classic`（三眼 + 指针，viewBox 360×360）、`card`（数据卡，viewBox 360×400）。
  `card` 的 60s 曲线由 `main.js` 每秒写入 `S.hist.decode`（最多 60 点，切表盘不重复灌点）；
  功耗/生成 tokens 由 `pickMetrics()` 从 `/metrics` 的 `latest.power` / `eng.gen` 取。
- 端口用 `0` 让系统分配，避免和 dashboard / 其它服务撞车。
- 便携版：`build_portable.py` 把 Python 侧打成 `DGX CLOCK.exe`（PyInstaller onedir）、
  把 Electron 运行时与 `config.json/themes.json/ui.html` 一起放到同目录，整目录可搬迁。

## 6. 配色约定（阶段 1 定稿）
| 表盘 | 环色 | 数值色 | 理由 |
|---|---|---|---|
| GPU | `#76b900` | `#8fd11a` | NVIDIA 品牌绿，全场唯一的纯绿，最亮 |
| TTFT | `#5fa8f0` | `#8cc8ff` | 蓝钢冷蓝，呼应中央蓝钢针 |
| MEMORY | `#1fb894` | `#45d6b0` | 青绿，降饱和，落在两者之间 |

## 6.1 窗口背景（2026-10-26 定稿）
- **窗体透明**：`html/body/#app` 全透明，只有标题栏（`#22252a`）和表盘是实体。
- 标题栏：深灰不透明、整条可拖动；右侧置顶 / 关闭按钮可点击。
- 表盘外缘到窗口边缘的区域完全透明，透出桌面。
- 窗口默认 380×424（旧版 560×600 太大且不可缩放）。

## 6.2 表盘与配色（2026-10-26 初版配色；同日升级为整套表盘切换）
- **`themes.json` 是唯一真源**：`themes` 是配色库，`faces` 是表盘清单（顺序即轮换顺序）。
- 每档表盘 = `layout`（布局模块）+ `theme`（配色）+ `name/short`（胶囊显示）。
- 第一版四档都是 `classic` 布局，分别配 `dgx/stone/mist/emerald`：
  经典三眼·原色 / 石庭 / 雾林 / 翡翠。
- 点击 `DGX CLOCK` 标题胶囊 → **下一整套表盘**（配色 + 布局一起换）；
  胶囊显示当前表盘短名（原色/石庭/雾林/翡翠）。
- 当前表盘存 `state.json` 的 `face` 字段，跨重启保留；`theme` 同步写入，
  供 `ui.html` 回退页使用。
- 新增同布局表盘：在 `faces` 加一条即可；新增布局：`ui/js/faces/<id>.js` +
  `main.js` 的 `LAYOUTS` 注册一行 + `faces` 一条。
- `theme` 的 `face/subFace/title/brand/eng/needle/...` 仍按原配色库定义；
  改 `themes.json` 后重开窗口生效（`/themes` 每次读盘，页面只在启动时拉一次）。
- `default` / `cycle` 两个旧字段仅为 `ui.html` 回退页保留，模块界面不读取。

## 6.3 无数据回落（2026-10-26）
- 解码/引擎断开时 `eng = {}`，`live` / `ttft_ms` 为 null；指针不再瞬跳到 0。
- **引擎 idle 时 `live` / `ttft_ms` 仍保留最后一次非零值**（dashboard 既有语义），
  不能只等 null。判定：`run <= 0` 且 1.2s 内 `gen / prompt / done / rounds / ttft_count / lat_count`
  都没有变化 → 视为没有新数据。
- decode 主针、TTFT 柳叶针 + 进度环，从最后一次有效值用 **2.2s 线性**回零
  （TTFT 先夹到量程 5000ms，避免 13s 的旧值让指针先卡在满格）。
- 数值文字立即显示 `--`（表示无数据），指针/环负责过渡；有数据时立刻接管、不回落。
- 本地 `/metrics` 拉取失败（服务短断）也触发同样的回落，并点亮红点。
- 实现：`decay` 状态 + `requestAnimationFrame` 逐帧只重绘两根针/一个弧，不重建整层 SVG。

## 6.4 温度外圈（2026-10-26 定稿；同日改三锚点）
- 只做**表圈外沿**：温度环 + 柔光，叠在表圈外侧；不染盘面、不动三眼/指针。
- **默认 `theme` 模式**（三个温度锚点，都在 `themes.json`）：
  - `warn`（默认 55°C）以下：直接用当前主题的 `brand` 主色（石庭陶粉 / 雾林鼠尾草 / 翡翠绿 / 原色绿）。
  - `warn → warmAt`（55–62°C）：**sqrt 缓入**推向暖橙 `#D98F4E`，刚过热区就明显变暖。
  - `warmAt → hot`（62–80°C）：暖橙 → 砖红 `#C05B4D`；`hot` 以上保持砖红。
  - 热区同时把环加粗、提亮（宽度 ×(1+0.4·heat)，不透明度向 0.95 靠），不热时保持原样。
  - 旧版 `60→80` 线性混暖沙在石庭下（陶粉→暖沙）几乎看不出来，故改为三锚点 + 更饱和的暖橙。
- `mode:"fixed"` 时退回固定色带（`stops`：35 冷蓝 → 55 绿 → 70 琥珀 → 85 红）。
- 取所有主机最高温（`pickMetrics` 的 `temp`）；无数据/断连 → `opacity:0` 隐藏。
- 温度是**语义层**，不参与主题轮换；三套主题共用同一热区色带，正常温度随主题。
- 颜色用 CSS `transition: stroke .7s` 平滑过渡；阈值/色带/环宽改 `themes.json` 的 `temperature`。
- 55/62/70/80°C 对照：主题色 → 暖橙 → 橙红 → 砖红（四种主题一致）。

## 6.5 引擎名（2026-10-26 定稿）
- **位置**：中轴正下方一行（y=225），不再放 3 点日期窗下；3 点只留 `DGX` + `RUN | MAX`。
- **字体**：系统 `French Script MT` 19px，回退 `Gabriola` / `Segoe Script`；超长自动缩字号
  （宽度上限 260 用户单位），不再折两行。用户截图的 Italiana 不是系统字体，不打包。
- **呼吸**：引擎有请求（`run > 0`）时 `opacity .45 ↔ 1`、2.2s 循环；空闲/断连停在 `.5`
  暗底色，不闪。
- **实现**：单独 `<g id="dial-name">` 层，`updateEngineLabel()` 只在名字/状态变化时改 DOM，
  避免每秒重绘重置 CSS 动画。
- 指针仍在最上层，decode≈60（正指 6 点）时会从名字上扫过——这是既定层序，不改。

## 6.6 数据卡表盘（2026-10-26 首版）
- **布局**：`ui/js/faces/card.js`，viewBox 360×400；同一窗口内按高度等比缩放，
  386×465 与 301×331 都可读，不改窗口尺寸。圆心 (180,190)、表壳 R=163，
  **所有内容控制在 R≤158 内**（2026-10-26 修过一次出界）。
- **顶部**：`DGX` 居中（y=62）；日期/时间缩小放右上（**x=252**，日期 y=76 / 时间 y=96，
  18px），并再向内收，离右上表圈留足空隙；并发信息在卡下方。
- **配色**：数据卡使用 `neon` 主题（参考用户手表样图）：黑盘面、荧光粉卡、白曲线、
  青蓝刻度/文字、绿色环、橙色 POWER 弧、黄色 TTFT 弧。颜色 token 在
  `themes.json` 的 `themes.neon.card`，由 `theme.js` 写入 `--card-*` CSS 变量；
  经典四色脸不受影响。
- **左上小环**：E2E 端到端延迟（`eng.e2e_ms`，满格 `clock.e2e_max`，默认 30s；
  圆心 90,94、r14，值显示秒）。
- **中央卡**：DECODE 当前值 + 最近 60s 均值 + 曲线（0–`decode_max`，60 个 1s 采样）；
  卡片 x=80..280、y=112..224（**200×112**，已收窄），值字号 20。
  曲线来自 `S.hist.decode`，由 `main.js` 每秒推入、最多 60 点；切表盘不重复灌点。
- **两侧真弧**：左 = `latest.power`（满格 `clock.power_max`，默认 200 W），
  半径 **144**、角度 250°–290°；右 = `eng.ttft_ms`，半径 144、70°–110°。
  **不是直线**——用 `dial.js` 的 `arc()` 生成；离盘面边缘留约 10 单位；
  线宽 **4.2**（2026-10-26 加粗）；标签改**横排两行**：左 x=58 / 右 x=302，
  标签 y=186、数值 y=194（不再旋转）。
- **刻度**：外圈 60 格分钟刻度，主格长 6.2 / 宽 1.4、次格长 3.4 / 宽 0.9，
  颜色走 `theme.card.tick/tickDim`（霓虹主题已提亮）。
- **下排**：GPU% / MEMORY% 小环（r17、300° 弧、宽 3.4，圆心 82/278,276）；
  中间是**并发柱状窗**（x=120..240）：四根 **10 宽**细柱（间距 12），
  点亮数量 = `eng.run`（上限 4），右侧显示 `run/lanes`（如 `2/4`）。
  柱子颜色按负载连续变化：**1 路绿 → 2 路黄绿 → 3 路橙 → 4 路红**
  （HSL hue 140→0，`loadColor()`）；卡片/面板底色不变。tokens 暂不显示。
- **底部**：**固定彩虹温度弧**（蓝→青→绿→黄→橙→红，`tempRainbow` 渐变），
  弧上白色游标按温度沿弧滑动（30–90°C，`temperature.arcMin/arcMax`）。
  游标在静态层，`after()` 用 `animateDot()` 沿二次贝塞尔逐帧移动：首次从弧**左端
  （低温端）滑入 700ms**，之后温度变化 500ms；不要用 CSS transform 直线过渡
  （会从 (0,0) 斜飞、不贴弧）。数值在弧上方 y=316。经典脸的表圈温度环仍走
  `temperatureColor()` 语义色，不受影响。
- **引擎名**：y=306 / 17px / 最大宽度 210，`updateEngineLabel` 支持每档自定义位置。
- **配色**：目前 `faces` 里只有 `card-dgx`；要加石庭/雾林版，只加 `faces` 条目即可。

## 7. 配置入口（改哪里）
- 主机 / SSH 私钥 / 采样间隔 / 表盘满格 / 回落时长 → **`config.json`（唯一配置入口）**
  （`clock.e2e_max` 供数据卡左上小环、`clock.power_max` 供功耗弧，默认 30s / 200 W）
- 表盘清单 / 轮换顺序 / 配色 / 温度外圈 → **`themes.json`（`faces[]` + `themes`）**
  （数据卡温度弧的显示范围见 `temperature.arcMin/arcMax`，默认 30/90°C）
- 表盘几何（半径、角度）→ `ui/js/dial.js` 顶部常量（`SZ/CX/CY/R_*`；card 有自己的 `CCX/CCY`）
- 表盘布局（每档怎么画）→ `ui/js/faces/*.js`；布局注册 → `ui/js/main.js` 的 `LAYOUTS`
- 数据卡取数：60s 曲线 = `main.js` 的 `S.hist.decode`；功耗/tokens = `metrics.js` 的 `power/gen`
- 数据卡专属色 → `themes.<id>.card`（bg1/bg2/edge/fg/mut/line/area/panel/power/ttft/gpu/mem/
  e2e/run/tick），`theme.js` 写入 `--card-*` CSS 变量；卡内渐变在 `card.js` 的 `defs()`
- 前端行为（表盘切换/回落/温度环/缩放）→ `ui/js/*.js`；单文件回退 `ui.html` 保持经典脸
- 引擎名位置/字体/呼吸 → 经典脸 `ui/js/faces/classic.js` + `ui/app.css` 的 `.engname`
  （中轴下方 y=225，19px French Script MT → Gabriola 回退；`run>0` 时 2.2s 呼吸）
- 窗口默认/最小尺寸、默认置顶 → `config.json` 的 `window`（仅首次启动用）
- 窗口位置/尺寸/置顶/**表盘** → `state.json`
  - 源码运行：`%APPDATA%\dgx-clock\state.json`
  - 便携版：exe 同目录 `state.json`
- 打包 → `python build_portable.py`（`--zip` 额外打 zip）
- 端口由系统分配（`--port` 可固定）；采集链仍复用 `../dashboard`（便携包内为打入的副本）

## 8. 风险与前置件
- **Electron 运行时**：`electron/node_modules` 约 300 MB，由 `npm install` 重建，不入库。
- **便携包体积**：`dist/DGX CLOCK` 约 377 MB（Electron 45 + PyInstaller Python 运行时）；
  办公机不需要装 Python / Node / Electron，整目录拷贝即可。
- **便携包内采集链**：`gb10_monitor.py` + `engine_adapters.py` 由打包时从 `../dashboard` 打入；
  dashboard 更新后要重跑 `build_portable.py` 才会进包（源码模式始终用最新 dashboard）。
- **单实例锁**：Electron 按 userData（`%APPDATA%\dgx-clock-shell`）判重，源码窗口与便携窗口
  不能同时开；调试可用 `--user-data-dir=<临时目录>` 错开（该参数原样转给 Electron）。
- **`ELECTRON_RUN_AS_NODE`**：本机全局设为 1，会让 `electron.exe` 变成 node 解释器；
  `dgxclock/app.py` 启动前会从子进程环境里删掉它（手动启动 `electron.exe` 也要注意）。
- dashboard 的 `Collector` 是 SSH 长连接；**与 dashboard 同时运行 = 两条 SSH/机**，负载可忽略。
- 窗口位置/尺寸存在 `state.json`（源码在 `%APPDATA%\dgx-clock`，便携版在 exe 同目录），
  与 dashboard 的 `gb10-monitor\state.json` 互不干扰。
- 引擎空闲时 decode 保留上一轮非零值（dashboard 既有语义，非本窗引入）。

## 9. 已知坑
- **pywebview 透明不可行（历史）**：WinForms 宿主只能把 WebView2 自身背景设透明，
  透出的是窗体底色；`SetLayeredWindowAttributes` / `TransparencyKey` / DWM 都试过，
  上游 issue #1779 也承认无通用解。→ 换 Electron 后一次通过。
- **`ELECTRON_RUN_AS_NODE=1`**：本机环境变量会让 Electron 以 Node 模式跑，
  `require('electron')` 直接报 `Cannot find module`；启动前必须 pop 掉。
- **Edge headless 最小宽度**：Windows 上 `--window-size=380,424` 会被放大成 518×327 的布局
  再裁切，窄窗预览失真。→ `.mock/shot.js` 改用项目自带 Electron 截窗口。
- **颗粒滤镜的方形伪影**：`feTurbulence` 输出必须 `feComposite ... operator="in"`
  用 `SourceGraphic` 裁到圆内，否则会盖出一块方形噪点。
- **刻度立体感**：整盘统一线性渐变会让每格几乎纯色；改为**每格一条沿径向的
  `linearGradient`（底暗尖亮）+ 全盘光照加权 + 侧壁 + 双层投影 + 两端倒角**。
- **表圈白线**：旧版用固定弧线 `arc(R0+6.4, 212, 328)` 做高光，正好落在 70–110 方向；
  现改为整环 `rimLight` 线性渐变，不存在固定弧线。
- **无边框缩放**：`frame:false` + `thickFrame:false` 无原生缩放边；
  `ui.html` 的 8 向热区 + 右下抓手经 IPC 调 `win.setBounds`。
  `pointermove` 必须忽略 `buttons===0`（鼠标已松开）并设 3px 起步阈值，避免误缩到最小。
- **viewBox**：表盘实际半径 163，viewBox 用 360（中心 180），四周留 17 给投影，不能再用 320。
- **`.mock/shot.py`**：用 Electron 截图，mock 脚本必须同步调 `renderClock()`，headless 不等 `setTimeout`。
- **窗口状态迁移**：旧 pywebview 的 state 没有 `shell:"electron"`，只继承 `on_top`，
  几何尺寸作废（旧版太大）。
- **标题按钮 vs 拖动区**：整条 header 是 `-webkit-app-region: drag`，标题按钮必须
  `no-drag` 才能收到 click；代价是「DGX CLOCK」文字本身不能拖窗，拖空白/状态区即可。
- **主题重绘**：`face/subFace/brand/needle` 参与 SVG 静态层（盘面/刻度/表圈），
  换主题必须 `svg.dataset.built=''` 后重建；只改 CSS 变量不会更新盘面。
- **主题持久化**：页面随机端口会让 localStorage 每次启动换 origin，不能用；
  走 Electron `state.json` 的 `theme` + `win:set-theme`。
- **配置生效**：`/themes` 每次请求读盘，但页面只在启动时拉一次；改色后关窗重开。
- **回落动画与隐藏窗口**：`requestAnimationFrame` 在 `show:false` 的测试窗里会被降频，
  2.2s 的回落会拖长；`decay-test` 必须用可见窗口测，不能拿隐藏窗的耗时当结论。
- **回落只针对 null**：引擎真实报 0 t/s 时仍然立即到 0（那是有效数据），
  只有 `live` / `ttft_ms` 为 null（无数据）才走 2.2s 回落。
- **idle 不是 null（重要）**：dashboard 的 `MetricsState` 在空闲时保留最后一次
  `live` / `ttft_ms` 非零值，`eng.ok` 仍为 true；只判断 null 会导致指针永远不回落。
  必须用 `run<=0` + 工作计数（gen/done/rounds/ttft_count）1.2s 不动来判定 idle。
- **TTFT 旧值可能超量程**：实测空闲时 `ttft_ms=13566.7`，量程只有 5000ms；
  回落的起始值要夹到 `TTFT_MAX`，否则前 1.5s 指针/环不动。
- **温度环与主题分层**：温度环画在静态层表圈外侧，颜色由 `renderClock` 每帧更新；
  不要把温度色混进 `face/gpu/ttft/mem`，否则三套主题失去意义。
- **温度环用主题主色打底**：一开始用固定 35 蓝→85 红的色带，实机在翡翠主题下配青蓝环
  显得不协调；改为 theme 模式（正常温度 = `THEME.brand`，热区才转暖/红），
  三套主题各自协调，又保留高温警告。
- **温度环节点**：主题切换会重建静态层，`temp-ring` 随之重建；`renderClock` 末尾
  必须再 `updateTempRing()`，否则换主题后温度环消失。
- **指针层序**：`#live-needle` 必须在 `dateWindow()` **之后**写进 `#dial-live`；
  否则 3 点日期窗 / DGX 标志 / 引擎名会盖住中央蓝钢针（实测 decode≈32 时被挡）。
- **打包时 dashboard 的 webview**：`gb10_monitor.py` 顶部 `import webview` 只为 dashboard 自己的
  面板；本窗口运行前注入空壳模块，PyInstaller 用 `--exclude-module webview`，否则会拖进
  pywebview/pythonnet，办公机反而起不来。
- **PyInstaller 找得到采集链**：打包命令带 `--paths ../dashboard` + `--hidden-import
  gb10_monitor --hidden-import engine_adapters`；缺了会在打包时静默漏掉，运行时
  `ModuleNotFoundError: gb10_monitor`。
- **可编辑文件位置**：便携包里 `config.json / themes.json / ui.html` 在 exe 同目录（服务每次读盘）；
  `_internal` 里的同名文件只是兜底。改完重开窗口生效，`clock` 参数由 `/config` 启动时拉一次。
- **便携 state**：删掉 exe 同目录的 `state.json` 即回到 `config.json` 的默认尺寸/置顶；
  源码版仍在 `%APPDATA%\dgx-clock\state.json`，两者互不影响。
- **前端 ES module 作用域**：拆成 `ui/js/*.js` 后，`THEME/CFG/DECAY…` 不再是 window 全局；
  共享可变状态统一放 `state.js` 的 `S` 对象，`theme.js` 通过 `S.render` 回调重绘（避免
  theme ↔ main 循环 import）；`window.renderClock/pickMetrics/applyTheme` 仍在 `main.js` 末尾暴露给预览脚本。
- **静态路由的 MIME 必须写死**：Windows 的 `mimetypes` 常把 `.js` 认成 `text/plain`，
  ES module 会因严格 MIME 检查拒绝加载；`server.py` 里 `.js` 固定 `text/javascript; charset=utf-8`。
- **单文件回退只到经典脸**：`ui.html` 仍可被 `/ui.html` 打开（`/` 优先 `ui/index.html`），
  但不再同步新布局；它只保留四色轮换。改经典脸视觉时仍建议两边对一下，
  新表盘（数据卡/极简等）不回填。
- **表盘切换真源只有 `faces`**：`themes.json` 的 `default/cycle` 是给回退页的遗留字段，
  模块界面不读；两边都改会漂移，新增表盘只动 `faces`。
- **静态层缓存键**：`ensureStatic` 以 `layout:faceId` 为键，切表盘/换配色都会重建
  `#dial-static / #dial-name / #dial-live`；布局模块的 `staticSvg()` 里不能引用
  `#dial-live` 的节点（每次切换都会重建）。
- **布局模块接口**：`defs()`（可选）+ `staticSvg()` + `live(d, view)` + `after(d, view)`（可选）。
  数据/衰减由 `main.js` 算好放进 `view`，模块不自己算回落，避免每档重复实现。
- **每档可带自己的 viewBox**：`svg` 按 `viewBox` 缩放，小窗/高窗都能自适应；
  新增高表情报时别改窗口尺寸，先给布局模块一个更高的 viewBox。
- **旧 state 迁移**：只有 `theme` 没有 `face` 时，`initFaces()` 映射到同配色经典表盘
  并立刻写回 `face`；删掉 `state.json` 则回 `default_face`。
- **无 `window.dgx` 环境**：预览/截图/纯浏览器打开时，`applyFace` 跳过 IPC 写盘，
  `initFaces` 用默认表盘；验证脚本可注入假 preload 模拟已有 state（`.mock/preload-face.js`）。
- **A/B 验证方法**：模块页与 `ui.html` 同源、同 mock、同冻结秒，各自 `capturePage` 后
  用 Pillow 比像素；经典脸本轮最大通道差 5、>8 的像素 0，说明拆分无视觉回归。
- **数据卡曲线是客户端缓冲**：`S.hist.decode` 只在内存，重开窗口/换电脑从空开始；
  真实要 60s 才攒满，预览用 `window.seedHistory([...])` 一次灌入。
- **静态层/动态层别画两遍**：数据卡的 AVG/RUN 曾同时在 `staticSvg()` 和 `live()` 里画，
  文字叠字发虚；静态层只留标签，数值一律放 `live()`。
- **SVG 的 CSS `fill` 会压过 presentation attribute**：卡片底用 `fill="url(#cardFill)"`，
  `.cdcard` 只设描边，别在 class 里再设 fill，否则渐变失效。
- **数据卡没有 `#temp-ring`**：温度环由 `after()` 更新 `#card-temp` 路径和 `#card-temp-v`；
  `updateTempRing()` 对它是 no-op，温度语义色仍统一走 `temperatureColor()`。
- **`power` / `gen` 可能为空**：`latest.power` 由 GPU 功耗上报、`eng.gen` 由引擎适配器给；
  缺失时竖弧归零、数字显示 `--`，不要回退到上一台引擎的旧值。
- **数据卡别用 `<line>` 画“竖弧”**：用户 2026-10-26 明确否掉直杆；两侧必须是
  `arc(180,190,154,…)` 的 40° 真弧，且角度避开 6/9/12 点的环和小表盘。
- **所有元素收进表壳**：圆心 (180,190)、表壳 R=163、盘面 R=154；侧环圆心到中心距离 + 半径
  必须 ≤154（左上 E2E 环因此从 (64,94)r18 改到 (82,96)r15），底部弧端点半径约 150。
  改坐标后用 `.mock/faces.py --大图` 对照表圈，别只看 386 小图。
- **侧标签横排两行**：POWER/TTFT 放在 x=58 / x=302，标签 y=186、数值 y=194；
  不要再旋转（用户 2026-10-26 明确要求“横过来 上下 2 行”）。宽度要控制在
  弧（x≈36/324）与卡片（x=80/280）之间，数值过长会压卡边。
- **游标必须沿弧动画**：`animateDot()` 用 `bezier()` 逐帧改 transform；不要用
  `transition: transform`（两点直线插值，会从左上/弦上飞，不是沿弧）。
  首次入场从 t=0（弧左端）开始，700ms；温度更新 500ms。
- **右上时间同理**：y=96 时表壳内沿约 x≈302，时间右对齐取 x=252；日期 y=76 内沿约 283，
  也取 252。再往外就压到表圈/透明区（2026-10-26 实窗踩过）。
- **并发四柱只表示槽位**：点亮数 = `run`（上限 4），不是每条 lane 的真实负载；
  `/metrics` 没有分 lane 指标，别把柱高解释成每路 t/s。柱宽 10、间距 12（用户嫌 20 太粗）。
  颜色按负载：`loadColor()` 用 HSL hue 140→0，1 路绿、2 路黄绿、3 路橙、4 路红；
  只换柱子颜色，面板/卡片底色不动（用户 2026-10-26 明确）。
- **数据卡颜色别写死**：卡底/文字/曲线/面板都走 `theme.card` → `--card-*` 变量；
  换主题时 `applyPalette` 会清 `dataset.built`，`card.js` 的 `defs()` 重新生成卡底渐变。
  只改 CSS 不改 `defs()`，换配色后卡底仍是旧渐变。
- **霓虹卡是粉底**：卡内文字用白/极浅青（`fg`/`mut`），不要再把黑色文字放进卡里；
  外部 Power/TTFT 标签也用 `mut`，保证黑底可读。
- **前端入口路径**：`ui/index.html` 里 `app.css` / `js/main.js` 必须用 `/ui/...` 绝对路径；
  页面在 `/` 被服务时相对路径会 404，表现为只剩浅色 header、出滚动条、表盘空白、状态栏 `--:--:--`。
- **呼吸动画与重绘**：引擎名不能放在每秒重建的 `#dial-live` 里，否则 CSS 动画每秒重启；
  已独立成 `#dial-name` 层，引擎名/状态变化时才重建，`classList.toggle('on', run>0)`。
- **引擎名字体**：按用户要求只用系统字体（`French Script MT` → `Gabriola` → `Segoe Script` → cursive），
  用户截图的 Italiana 非系统字体、不打包；
  不打包 webfont；字号 12px、行距 11.2，`ui.html` 与 `ui/js/dial.js` 两处要一致。

## 10. 开工检查
- [x] 设计稿完成并经用户看过（preview19 / preview39）
- [x] 采集链来源已确认（`gb10_monitor.py` 的 `Collector` / `MetricsState`）
- [x] 章程落盘
- [x] 小表盘配色定稿
- [x] 真机冒烟通过
- [x] 启动脚本 + 首次提交
- [x] 只显示表盘（去背景染色、去底部数字行、保留表圈）
- [x] PREFILL → TTFT
- [x] 窗体透明（Electron）+ 标题栏不透明
- [x] 边缘白线 / 刻度立体 / 小表盘底纹
- [x] 无边框缩放 + 状态持久化
- [x] 配色配置化 + 点击标题轮换（`themes.json`）
- [x] decode / TTFT 无数据 2.2s 缓缓回零（含 idle 检测）
- [x] 外圈温度环（语义色，不影响主题盘面）
- [x] 表盘切换（faces 真源 + 布局模块 + state.face + 旧 theme 迁移）
- [x] 数据卡表盘（decode 60s 曲线 + 功耗/TTFT 竖弧 + 温度弧）
