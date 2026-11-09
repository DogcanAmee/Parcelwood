# Credits and third-party licenses / 素材与第三方授权

Everything in this repository is released under the MIT License (see `LICENSE`) unless listed below.
除下面列出的部分外，本仓库全部内容按 MIT 授权（见 `LICENSE`）。

| What / 内容 | Where / 位置 | Source / 来源 | License / 授权 |
| --- | --- | --- | --- |
| Music and sound effects / 音乐与音效 | `src/ui/music.ts`, `src/ui/sfx.ts` | Original, synthesized at runtime with Web Audio. No audio files. 原创，运行时合成，没有音频文件。 | CC0 1.0 (see `docs/audio-credits.md`) |
| Line icons used in `public/icons/*.svg` / SVG 图标线条 | `public/icons/` | [Lucide](https://lucide.dev) | ISC, see `public/icons/lucide-license.txt` |
| Fonts: Lilita One, Figtree, Courier Prime / 字体 | installed from npm via `@fontsource/*`, not committed | Google Fonts | SIL Open Font License 1.1 |
| npm dependencies / npm 依赖 | `package.json` | see each package | their own licenses (MIT / Apache-2.0 / ISC …) |
| Item, resident, UI and icon artwork (`.png` / `.webp`) / 物件、居民、界面图 | `public/items/`, `public/residents/`, `public/ui/`, `public/icons/*.webp`, `art-source/` | Generated with AI image models (OpenAI gpt-image via fal.ai, plus fal-ai/birefnet for cutouts), then curated and edited by the author. Prompts are in `art-source/bible/prompts/`. 用 AI 出图（经 fal.ai 调用 OpenAI gpt-image，birefnet 抠图），作者筛选和修改。 | Offered under MIT like the rest of the repo. AI-generated images may not be protected by copyright in some countries, so no stronger rights are claimed. 同样按 MIT 提供；部分国家 AI 生成图可能不受版权保护，作者不主张更多权利。 |

Not included / 不包含：the CrazyGames SDK and Discord Embedded App SDK are loaded from their own providers or npm and are not part of this repository's license. CrazyGames、Discord 的 SDK 由各自提供方加载，不在本仓库授权范围内。
