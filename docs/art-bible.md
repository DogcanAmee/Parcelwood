# Parcelwood 美术圣经 v0.1（2026-11-02，草案）

目的：让物品、居民、图标和 UI 看起来像**同一个人、同一天**画的。任何新图在进仓库前都按本文验收。
状态：草案。以 tin-robot 重画做 A/B 验证（`docs/art-bible/ab-tin-robot.png`），通过后才批量重做。

对比图生成：`art-source/bible/ab-sheet.sh <输出.png> <旧图.png> [新图.png]`（每张图出 180/64/34px、牛皮纸底和深色底、剪影）。

2026-11-02 进度：

- **B 侧（推荐）用 fal.ai 生成**：`docs/art-bible/ab-tin-robot-fal.png`。母版 `art-source/bible/tin-robot-v2-fal.png`（1024 透明）、200px 旧版 `art-source/bible/tin-robot-v2-fal-200.png`。
  脚本 `art-source/bible/fal-gen.sh`，提示词 `art-source/bible/tin-robot-prompt.txt`。还没替换 `public/items/`，等确认方向。
- B 侧（备选）手写矢量：`art-source/bible/tin-robot-v2.svg` → `render-svg.sh` → `tin-robot-v2-1024.png`、`tin-robot-v2.png`；对比图 `docs/art-bible/ab-tin-robot.png`。
- `codex/gpt-image-2`（内置出图）返回 403：账号是 Free 计划，该计划不支持内置出图。用 fal.ai 的 key 绕开，按张付费、不动订阅。

### fal.ai 用法（已验证）

```bash
# key 放 ~/.config/fal/key（chmod 600）或 export FAL_KEY=...
art-source/bible/fal-gen.sh -o out.png -p prompt.txt -r reference.png   # 带参考图 → /edit，保住物件身份
art-source/bible/fal-gen.sh -o out.png -p prompt.txt -k                 # -k 跳过抠图，保留白底
```

- 默认模型 `openai/gpt-image-2/edit`；改 `-m fal-ai/nano-banana-pro/edit` 可换模型，`-n` 出多张。
- fal 上的 OpenAI 模型**不支持**直接出透明底（`background:transparent` 会被拒），所以流程是：白底出图 → `fal-ai/birefnet` 抠图。约 60–80 秒/张。

A 侧实际查到的问题：tin-robot 脚下烘焙了一圈米白色地面阴影，在深色底上露成一块白斑（违反第 2 节的“投影”和“背景”）；描边是软边的浅色，不是 `--edge`。
B 侧（fal）验收：34px 能认出、剪影能认出、深色底无白边、无文字、除墨线外 4 个色相，全部通过。
取舍：B 比 A 干净、统一，颜色更亮，带一圈很淡的“贴纸”白边（可接受，也可以抠掉）。
两个 B 版本（矢量 vs fal）风格接近；fal 版细节更多、更接近 merge 类游戏，矢量版更扁平、更可控。

## 1. 方向：一句话

**“邮局贴纸”**：圆润、块状的手绘物件，统一深棕墨线描边，2–3 层色阶的平涂上色，暖光。
它跟 UI 现有的墨线 + 硬投影（`--edge`、`.panel`、`.btn`）是同一种语言——图向 UI 靠拢，不改 UI。

## 2. 锁定规则（每张图都必须满足）

| 项 | 规则 |
|---|---|
| 相机 | 正面偏 3/4，视线略高于物体（约 15° 俯视），物体朝画面左前方。所有物品同一角度。 |
| 光源 | 唯一主光在**左上方**，暖白。暗面在右下。不加第二个彩色光、不加轮廓光。 |
| 描边 | 外轮廓统一 `#3a2c1f`（= `--edge`），1024px 母版上约 14px，400px 成品上约 6px；内部结构线更细（约外轮廓的一半）。不允许无描边的软边。 |
| 上色 | 每个色块最多 3 层：底色 + 一层暗部 + 一个小高光。可以有一层很轻的渐变，**不画写实质感**（没有锈斑颗粒、划痕、毛孔、噪点）。 |
| 造型 | 粗短、圆角、简化。整体能在 **34px** 下认出来；内部可读细节不超过约 6 处。 |
| 投影 | 图里**不画**地面投影和光晕。投影由 CSS（`.slot .mini` 的 `drop-shadow`、开箱 `.floor`）负责。 |
| 背景 | 透明，单个物件，无底座、无桌布、无道具、无蒸汽/烟雾的白色晕边。 |
| 文字 | 图里**不出现任何文字、数字、字母**（AI 生成的乱码字是最明显的破绽）。 |
| 构图 | 物件占画布约 80%，水平居中，底部留约 8% 空白。 |

## 3. 色板（锁定）

UI 基础色（来自 `src/styles.css`，图里可直接用）：

| 用途 | 色值 |
|---|---|
| 墨线 / 最深色 | `#3a2c1f` |
| 木 / 暖棕 | `#b5763f`、`#7d4a24` |
| 牛皮纸 | `#c99a62`、`#a87a45` |
| 黄铜 / 金 | `#e8b33f`、高光 `#ffe08a` |
| 邮戳红 | `#c8402f` |
| 邮政蓝 | `#2456c4` |
| 纸白（高光、白色物件） | `#fffaf0` |

系列强调色（用于系列内物件的主色，不跨系列混用）：

| 系列 | 主色 | 配色方向 |
|---|---|---|
| Midnight Snack Shop | `#e8962a` | 暖橙、米白、酱棕 |
| Retro Toy Box | `#23a091` | 青绿、奶油、旧红、黄铜 |
| City Souvenirs | `#d4507a` | 玫粉、天蓝、纸白 |
| Lost Letter Office | `#2456c4` | 邮政蓝、牛皮纸、火漆红、奶油白、黄铜 |

规则：一张图里除墨线外最多 **5 个主色相**。不用纯黑、纯白、霓虹色、紫色渐变。

## 4. 稀有度怎么体现

靠**物件本身**（材质更贵、造型更讲究、多一个黄铜/金色部件），不靠图里加发光。
发光、光柱、粒子都交给 CSS（`.beam`、`.burst`、`glow-*`）。

## 5. 生成流程（锁参考）

1. 先有一张**锚点图**（第一张通过验收的图，v0.1 起是重画后的 tin-robot）。
2. 生成新物件时，同时提供：锚点图 + 本页第 2、3 节规则 + 该物件的旧图（保住它的身份特征）。
3. 以 1024×1024 透明画布生成，再缩到 400×400 存到 `art-source/items/`，转 WebP 放到 `public/items/`。
4. 一次只改一个系列；新图要和锚点图一起放进对比图里检查。

提示词骨架（按物件替换 `<>`）：

```text
Single game item sticker for a cozy post-office collection game: <item>, <identity details from the old art>.
Chunky rounded simplified shapes, uniform dark brown outline (#3a2c1f), flat cel shading with 2-3 tones per color,
one small hard highlight, warm key light from the upper left, 3/4 front view slightly from above, facing left.
Palette limited to: <series colors> plus #3a2c1f, #e8b33f, #fffaf0.
Transparent background, centered, fills ~80% of canvas. No cast shadow, no glow, no base or props, no text or numbers,
no realistic texture, no rust, no scratches, no noise.
```

## 6. 验收清单

每张新图都要过：

- [ ] **34px 测试**：缩到 34px 还能认出是什么。
- [ ] **剪影测试**：全涂黑后（等于 `--sil` 未收集卡片）轮廓仍能认出。
- [ ] **并排测试**：和锚点图在 64px 并排放，光源方向、描边粗细、上色层数一致。
- [ ] **背景测试**：放在牛皮纸 `#f1e4c8` 和深色模式 `#222a3d` 上都没有白边/光晕。
- [ ] 图里没有文字、乱码字、地面投影、底座。
- [ ] 除墨线外不超过 5 个主色相。
- [ ] **镂空测试**：只看 alpha 通道，物体内部不能有被抠掉的洞（钥匙圈、摩天轮辐条之间这种真空隙除外）。BiRefNet 会把画面里的天空/白底区域当背景抠掉（明信片、冰箱贴出过这个问题），且洞下面的颜色也坏了，不能只补 alpha。处理：`fal-gen.sh -k` 重新出白底图，再用 `art-source/bible/cutout-flood.sh white.png out-1024.png out-400.png` 从画布边缘泛洪抠图（靠一圈深色描边挡住，内部白色保留）。

## 7. 不在本版范围（之后按同一规则扩展）

- 居民立绘：同一描边/光源/色板，胸像，表情 3 种（平常、开心、着急）。现在先用统一的笑脸图标占位，靠窗框颜色区分。
- 包裹盒本身目前是 CSS 绘制，已经是墨线风格，暂不改。

## 7.1 UI 不再使用系统 emoji

- `src/ui/icons.ts` 在渲染后扫描文本，把所有系统 emoji 换成手绘图标；翻译字符串和数据表可以继续保留 emoji，界面实际显示的是图标。
- 第 2 批图标是 SVG（`public/icons/*.svg`）：奶油色圆底 + 墨线，和第一批 WebP 同一套颜色。线条取自 **Lucide**（ISC / MIT 授权，可商用），统一重绘成圆底墨线；这不是付费素材。许可全文在 `docs/lucide-license.txt`。
- 新增：📌 pin、📖 book、🎨 art、🎯 target、🎉 party、❔ unknown、📋 clipboard、🔍 search、⏱ clock、♻️ recycle、⚖️ scale、🔧 wrench、✂️ scissors、🩻 xray、👂 ear、☕ coffee、💨 wind、⭐ star、📄 paper、🪨 rock、💧 drop、🎲 die、⚙️ gear、🔑 key、🔔 bell、🎐 chime、🐭 mouse、⏸ pause、👀 eyes、↩ back、🏆 trophy、🖋 pen、🌧️ rain、🕯️ candle、🚚 truck、⏭ next、▶ play、⛔ no-stop、🏠 house、🤝 handshake、↗/↙ arrows、🏅 medal、🗺️ map、🏮 lamp、🎀 ribbon、📯 horn、🪑 armchair、⛱️ umbrella、🌷/🌻 flower、🪧 signpost、🛋️ sofa、💡 bulb、🛞 wheel、🎏 flag、🚪 door、🧦 footprints、🧼 bubbles、🐝 bug、🍋 citrus、🖼️ picture、🎻 violin、🍎 apple、🐓 bird、🚲 bike、🧺 basket、🌿 leaf、✉️ mail、🚂 train、🍐 pear、🥘 soup、🍞 bread、🎃 pumpkin、🫖 teapot、🛎️ bell。
- 测试：`tests/no-emoji.test.ts` 先检查 `src/` 里出现的每个 emoji 都在 `ICONS` 里有图标，再把三语文案逐条 iconize，确认渲染后的文本没有 emoji。新增界面文案如果带 emoji 却忘了配图标，测试会红。

## 8. 进度

| 系列 | 状态 | 说明 |
|---|---|---|
| Retro Toy Box（8 件） | ✅ 已装进游戏 | 2026-11-02；对比图 `docs/art-bible/ab-series-toys.png`；原图备份 `art-source/items-backup-v0/` |
| Midnight Snack Shop（8 件） | ✅ 已装进游戏 | 2026-11-02；`docs/art-bible/ab-series-snacks.png`；清单 `art-source/bible/series-snacks.tsv` |
| City Souvenirs（8 件） | ✅ 已装进游戏 | 2026-11-02；`docs/art-bible/ab-series-souvenirs.png`；清单 `art-source/bible/series-souvenirs.tsv`；postcard / magnet 用泛洪抠图 |
| Greenhouse Row（8 件，新系列） | ✅ 已装进游戏 | 2026-11-04；`docs/art-bible/ab-series-garden.png`；清单 `art-source/bible/series-garden.tsv`；新物件没有旧图，用 clay-pot 当风格参考（提示词要求“画全新物件，参考图只看风格”） |
| Lost Letter Office（8 件，新系列） | 🎨 美术已交接待装游戏 | 2026-11-07；母版 `art-source/bible/redraw/<id>.png`、游戏 WebP `public/items/<id>.webp`；清单 `art-source/bible/series-lost-letter-office.tsv`；样片见 TAO-146，Lv8 解锁；$0（Doubao Seedream Flash） |

三个系列的原图（24 张 PNG + 24 张 WebP）都在 `art-source/items-backup-v0/`，回滚就是把它们拷回 `art-source/items/` 和 `public/items/`。

### UI 图标（第 1 批，16 个）

- 一次出一张 4×4 图标表（`art-source/bible/prompts/icons-sheet-1.txt`），保证 16 个图标风格一致；`art-source/bible/slice-icons.sh` 切成 `public/icons/<name>.webp`（96px）。
- 代码不改文案：`src/ui/icons.ts` 在渲染后把文字里的 emoji 换成 `<img class="ico">`（包括翻译字符串里的「+5 🪙」），`<option>` 里的文字不动。映射表就是 `ICONS`。
- 已替换：🪙 coin、✨ shard、💎 gem、♥ heart、📮 station、🏘️ town、📒 album、🏪/🏬 shop、👤 account、🔊/🔇 sound、🌐 globe、🔒 lock、🎁 gift、📦 parcel、💌 stamp。
- 第 2 批（2026-11-05）：📌 🎯 ⚖️ 🩻 🧩 📝 ⏱ 🔍 👂 等任务/线索图标已补齐，改用 SVG 圆底墨线，见 7.1。

安装：`art-source/bible/install.sh <rows.tsv>`（先备份，再写 `art-source/items/*.png` 和 `public/items/*.webp`）。
