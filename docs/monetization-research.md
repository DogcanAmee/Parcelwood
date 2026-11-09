# Parcelwood 多渠道上架、广告与内购调研

最后更新：2026-11-05  
适用：Parcelwood 网页版、手机版（Capacitor 打包）、CrazyGames 版、H5 手机网页版。  
说明：这不是法律或税务意见。平台规则会变，签约和付款前请以账户后台和合同为准。

## 0. 结论摘要

1. **先上 CrazyGames**：版本已经在做，没有公开的上架费，广告 SDK 已接好，最适合先换流量和真实留存数据。缺点是平台分成不公开，而且当前版本不能卖东西。
2. **第二步做自有网页 + H5**：同一套网页代码，不经过应用商店审核，也没有 30% 商店抽成。用 Paddle 做全球收款和税务代扣，先卖“去广告、确定性装饰、入门包”，不要卖随机包裹。
3. **第三步 Google Play**：$25 一次性注册费，Android 测试和上架成本低于 Apple；符合条件时首 100 万美元流水的平台费可低到约 15%。
4. **第四步 Apple App Store**：$99/年，审核和隐私要求更严，但 iOS 用户付费能力通常更好。先用 Android 把商品、退款和留存跑顺，再上 iOS。
5. **Poki 和 Facebook Instant 暂不作为首发**：Poki 默认要 5 年网页独家，会挡住自有网页和 Discord；Facebook 的 Instant Games IAP 文档对 iOS 的说法仍有冲突，审核链也最长。
6. **收入不要按“爆款”算**：按本文中等假设，1,000 DAU 约 $380/月（未税、未扣获客成本）；如果全部流量在 CrazyGames，按 50% 分成做敏感性测算只剩约 $170/月。先看留存和广告实际 eCPM，再决定是否买量。

> 本文覆盖任务点名的 6 个渠道组：Google Play、Apple App Store、自有网页、H5 手机网页、CrazyGames、其他小游戏平台（Poki / Facebook Instant Games）。“小游戏平台”内部差异很大，后面拆开说明。

---

## 1. 六个渠道对比

### 1.1 总表

| 渠道 | 上架费用 | 审核 / 上线周期 | 平台抽成 | 支付规则 | 关键合规 | 对 Parcelwood 的判断 |
|---|---:|---|---|---|---|---|
| **Google Play** | **$25 一次性**，不退款 [G1] | 常见最长约 7 天，特殊情况更久；没有保证时限 [G2] | 首 100 万美元年收益约 **10% + 5% 账单费 = 15%**（需符合条件）；超出后按地区/安装类型约 **20%–30%**；标准旧规则 30% [G3][G4] | 数字商品必须用 **Google Play Billing**；替代支付只限获批项目 [G5] | Data safety、应用内 + 网页账号删除、IARC 年龄分级、儿童/混合受众的 Families 规则 [G6][G7][G8][G9] | 第三条上。Android 成本低，先验证手机端。 |
| **Apple App Store** | **$99/年**，个人或公司都要会员 [A1] | 官方典型值：50% 在 24 小时内、90% 在 48 小时内；没有保证时限 [A2] | 标准 **30%**；Small Business Program 符合条件 **15%**；自动续订订阅满一年后 15% [A3][A4] | App 内解锁功能、游戏币、关卡、订阅必须用 **Apple IAP / StoreKit**；美国店面外链有特殊规则，不能当全球通用 [A5] | App Privacy 标签、隐私政策、账号删除、年龄分级；Kids Category 基本禁第三方分析/广告 [A6][A7][A8][A9] | 第四步上。先复用 Google 的商品和退款经验；$99/年不算贵，但审核细节最多。 |
| **自有网页** | 平台 $0；域名约 **$10–20/年**，托管可从 $0 起 | 无平台审核，自己测试发布 | 平台 **0%**；广告网络/支付服务另收费 | **Stripe / Paddle** 可直接收款；Paddle 是 Merchant of Record，替你处理销售税 [S1][S2] | 隐私政策、服务条款、退款/取消、COPPA、GDPR/CCPA、广告同意；税务责任取决于用 Stripe 还是 Paddle | 第二步做。控制力最高，适合试验内购，但最大问题是流量。 |
| **H5 手机网页** | 同自有网页；没有商店费 | 无商店审核；H5 Games Ads 是申请制，不保证批 [H1] | 同自有网页；AdSense/H5 游戏广告的分成不公开的部分不能硬套 80% [H4] | 同自有网页，浏览器内支付 | 移动端触控、安全区、广告不能遮挡核心操作；儿童流量按 COPPA 处理 [L1] | 和自有网页同一套代码，先当“分享链接 + 手机浏览器”版本，不指望它自带流量。 |
| **CrazyGames** | **$0 上架费**；开发者条款未规定上架收费 [C7] | 初审没有公开 SLA；Basic Launch 至少 **7 天**、至少 **500 plays**，否则 21 天自动结束；Full Launch 再 QA [C1][C2] | **不公开固定比例**。按流量、广告表现、广告主需求按月计算；不能把 50% 当合同事实 [C7] | 只能用 CrazyGames SDK 广告；IAP 是邀请制，走 Xsolla，当前版本不适合 [C4] | 主站 13+ / PEGI 12；不能写成面向儿童；儿童站无广告、无登录、无 IAP [C6] | **先上**。已有版本和广告逻辑，边际开发成本最低。 |
| **其他小游戏平台（Poki / Facebook Instant）** | 公开资料未列出上架费；开发者工具免费 [P1][F1] | Poki：测试 + 最终审核，通常 **2–3 个月**到全球发布 [P3][P4]；Facebook：Approved Partner **1–4 周** + App Review **1–5 个工作日** + Quality Review **3–10 个工作日** [F2][F3][F4] | Poki：用户直接进入 **100%**；Poki 带来的流量 **50/50**；默认网页独家 5 年（指示性，最终看合同）[P2]；Facebook：IAP **70/30 gross**，广告约 **70% net** [F5][F6] | Poki **禁止 IAP**，也禁止第三方广告 [P7][P8]；Facebook 必须用 FBInstant Payments，iOS 是否走 Apple 账单需后台核实 [F5] | Poki 全年龄、严格内容审核、不能收集个人信息、不能聊天 [P9][P10]；Facebook 需隐私政策 + 数据删除回调、遵守 COPPA [F7][F8] | **Poki 暂缓**，不要先签 5 年独家；**Facebook 最后或不做**，审核长且 IAP 规则不确定。 |

### 1.2 几个容易误解的点

- **“首 100 万美元 15%”不是永久低价**：Google 的新费率按地区和“新安装/存量安装”判断，2026-06-30 先在美国、英国、EEA 生效，2026-09-30 才到澳大利亚、日本，其他市场排到 2027-09-30；具体以 Play Console 为准。[G3][G4][G11] Apple 的 15% 也要主动加入 Small Business Program，且所有关联账号合计年收益不超过 100 万美元。[A3]
- **应用商店的“数字商品”不能用网页 Stripe 绕过**：Apple 要求 App 内解锁功能、游戏币、关卡、订阅用 IAP；Google 也要求 Play Billing，除非参加获批的替代支付项目。[A5][G5] 自有网页和 H5 才可以独立收款。
- **Poki 的 100% 不是“所有流量都 100%”**：Poki 带来的用户是 50/50；直接搜索、书签、社交、自己社区带来的用户才是 100%。但 Poki 默认要网页独家，Discord 和 YouTube Playables 也算网页，且 5 年期限只是官方“指示性”条款，最终以合同为准。[P1][P2]
- **CrazyGames 的抽成不是 30%**：官方开发者条款只写按流量和广告表现计算，未公开固定百分比；本文后续出现的 50% 只是敏感性假设，不是平台承诺。[C7]
- **审核时间都不是 SLA**：Apple 的 24/48 小时是典型值，Google 的 7 天也可能更长；排期要留缓冲。[A2][G2]
- **Facebook Instant Games 仍开放，但不是完全自助**：要先通过 Approved Partner Program，之后还有 App Review、Quality Review；不要把它当成“上传即上线”的渠道。[F1][F2][F3]

---

## 2. 广告方案

### 2.1 各渠道能用什么

| 渠道 | 推荐广告网络 / SDK | 可用形式 | 备注 |
|---|---|---|---|
| CrazyGames | **CrazyGames SDK** | 激励视频、midgame 视频、横幅（按平台 SDK） | 只能用平台 SDK，不能接外部广告；现有版本已接奖励和插屏。[C3] |
| Poki | **Poki SDK** | `commercialBreak()` midroll、`rewardedBreak()` 激励；竖屏游戏有平台侧 display ads | 禁止第三方广告系统；必须实现 SDK 事件，adblock 下也要能玩。[P7][P8][P11] |
| 自有网页 / H5 | **Google H5 Games Ads（Ad Placement API）**，备选普通 AdSense | 只提供 **插屏（含 preroll）和激励**，没有 H5 横幅 API | H5 Games Ads 是申请制，需要有已批准的 AdSense 账号；不保证通过。[H1][H2][H3] |
| Google Play / App Store | **AdMob 优先**；Unity Ads 作为备选；AppLovin 不要放进全年龄版本 | 激励、插屏、横幅、原生、App Open | AdMob 是原生 SDK，不是网页广告；Capacitor 需要原生桥接。AppLovin 不是 Google Families 认证 SDK，不能向儿童或未知年龄用户初始化。[M1][M2][M3] |

### 2.2 哪种形式适合这个游戏

**优先：激励视频。**  
适合“多一条线索、多一件包裹、提前送货、失物加急”这类玩家主动选择、奖励明确的场景。现有 CrazyGames 版已经是这个思路，继续保留。奖励必须是游戏内、不可转让、非现金；如果是随机奖励，购买前要披露概率和全部可能结果。[M3]

**其次：插屏，但只放自然断点。**  
放在“开完 3 个包裹、且本局满 3 分钟，点下一个包裹”这种位置；不要放在返回、导航、购买确认、装饰摆放、关闭按钮上。现有 CrazyGames 的节奏可以作为基准，不要为了多一次曝光把间隔缩短。

**补充：横幅，低优先级。**  
横幅 eCPM 低，而且会破坏“温暖邮局”的界面。真要放，只放在设置页、收藏页等静态页面，并预留空间；不要覆盖货架、拖拽和购买按钮。H5 没有官方横幅 API，不要为了横幅引入第三方广告把合规搞复杂。

**不建议：App Open、连续插屏、激励插屏。**  
会伤留存，也容易违反“不要突然打断、不要连续全屏”的广告政策。首版不做。

### 2.3 参考 eCPM（不是承诺）

以下都是“发布商侧 eCPM”，不是平台给你的报价。广告填充率、地区、季节、广告位和用户年龄都会改变结果。

| 数据口径 | 激励视频 | 插屏 | 横幅 | 来源 / 日期 |
|---|---:|---:|---:|---|
| Android 休闲游戏，全球 | **$3.02** | **$2.34** | **$0.57** | TopOn《2025 H1 全球手游变现报告》，数据 2025-01-01–06-30，PDF 创建 2025-08-14 [E1] |
| iOS 休闲游戏，全球 | **$8.09** | **$7.52** | **$2.60** | 同上 [E1] |
| iOS 休闲游戏，EU + NA | **$12.24** | **$10.27** | — | 同上 [E1] |
| Android 全类型游戏，北美 | 约 **$9.0** | 约 **$9.6** | 约 **$0.5** | Appodeal 2024 Q4 报告，2025-03 上传；二手图表读数，仅作方向 [E2] |
| iOS 全类型游戏，北美 | 约 **$13.6** | 约 **$10.4** | 约 **$0.4** | 同上 [E2] |
| 网页，美国 | 公开数据不足 | **$3.35** | **$0.74** | AnyMind 2025 Q1 网页报告，2025-05-26 发布；约 1,200 个亚洲网页发布商 [E4] |
| 网页，日本/新加坡 | 公开数据不足 | **$1.78** | — | 同上 [E4] |
| 网页，印度 | 公开数据不足 | **$0.20** | — | 同上 [E4] |

补充参考：Playwire 在 2025-09-17 给出 Tier-1 激励 **$15–30**、插屏 **$5–8**、横幅 **$0.50–1.50**；全球混合激励 **$8–18**、插屏 **$2.50–5**、横幅 **$0.20–0.80**。该文没有公开方法论，只能当上限参考，不能拿来做预算。[E3]

**结论：**
- 移动 App 的 eCPM 明显高于网页，但移动用户更贵、审核更重；不能只看 eCPM。
- 网页激励视频没有可靠公开基准，首版不要把“移动 App 的 $10–30”直接套到 H5。
- 首月先按 **$2.5–5** 的综合 eCPM 做预算，跑满 2–4 周后用真实数据替换。

---

## 3. 内购方案

### 3.1 卖什么

现有 Discord 已在卖 60 宝石 $0.99、330 宝石 $4.99、制服 $1.99；设计文档也计划把宝石从“买额外盲盒”转向装饰、制服、周故事季票（见 `docs/ship-plan.md` 和 `docs/design-v2.md`）。这个方向是对的：**卖确定内容，不卖随机结果**。

| 商品 | 建议定价 | 类型 | 适合渠道 | 说明 |
|---|---:|---|---|---|
| 去广告 | **$3.99 一次性** | 非消耗型 | 自有网页、H5、Google Play、Apple | 必须支持恢复购买；CG/Poki 没有这种商品。 |
| 装饰包（车站/制服/包裹街） | **$1.99–3.99** | 非消耗型 | 自有网页、H5、Google Play、Apple；CG 需邀请制 IAP | 最符合游戏气质，确定性内容，不涉及抽奖概率。 |
| 入门装饰包 | **$4.99** | 非消耗型 | 应用商店、网页 | 比单件更划算，用来提高首购。 |
| 月卡 / 季票 | **$4.99/月** 起 | 订阅 | 先只做网页/应用商店 | 需要持续内容更新、取消入口、续订披露；首版先不做。 |
| 宝石 / 金币包 | **$0.99 / $4.99** | 消耗型 | 可做，但要改用途 | 只能换确定装饰；不要用真钱买“随机包裹”。当前 Discord 的盲盒模式不要复制到应用商店。 |

**最重要的产品建议：**首版只卖**确定性装饰 + 去广告**。付费随机包裹会同时触发应用商店的“抽奖概率披露”、各地区 loot box 限制、儿童保护和 CrazyGames 的额外审核；对一个以轻度收集为主的游戏，不值得在首版承担这些风险。[A5][C4]

### 3.2 各渠道怎么收钱

| 渠道 | 支付方式 | 合规要点 |
|---|---|---|
| Google Play | **Google Play Billing** | 数字商品必须用；替代支付只在获批项目/地区；不要放网页 Stripe 或二维码。 |
| Apple App Store | **StoreKit / Apple IAP** | 数字内容必须用；美国店面外链有特殊规则，但不要默认全球可用；非消耗型要恢复购买。 |
| 自有网页 / H5 | **Paddle 优先，Stripe 备选** | Paddle 是 Merchant of Record，代处理销售税/VAT/GST；Stripe 费率低，但税务注册和申报通常由你自己承担。 |
| CrazyGames | **Xsolla，邀请制** | 必须登录用户才能买；当前版本不做；CrazyGames App 内要关闭外部支付。 |
| Poki | **无内购** | 必须移除购买货币、去广告等购买 UI；只能靠 Poki 广告。 |
| Facebook Instant | **FBInstant Payments** | IAP 70/30 gross；iOS 实际结算路径和 Apple 费用需要 Dashboard 核实。 |

### 3.3 支付成本：以 $4.99 装饰包为例

| 收款方式 | 费率 | 到手（未税） | 谁处理销售税 |
|---|---:|---:|---|
| Apple，Small Business 15% | 15% | **$4.24** | Apple 代收代缴适用税费 |
| Apple，标准 30% | 30% | **$3.49** | Apple |
| Google Play，首 $1M 档约 15% | 10% + 5% 账单费 | **$4.24** | Google |
| Paddle | 5% + $0.50 | **$4.24** | **Paddle（MoR）** |
| Stripe 美国国内卡 | 2.9% + $0.30 | **$4.55** | **你自己**（可用 Stripe Tax 辅助） |

数据来源：Stripe 与 Paddle 公开定价，访问 2026-11-05。[S1][S2] 未计国际卡 +1.5%、换汇 +1%、退款/争议费；实际到账会更低。小额外购时，Paddle 的固定 $0.50 占比很高；如果客单价长期低于 $10，要向 Paddle 询价或考虑 Stripe + 自己报税。

### 3.4 RevenueCat 值不值得

- 当前价格：**月跟踪收入（MTR）低于 $2,500 免费；达到后按全部 MTR 的 1% 收费**，不是只对超出部分收费。[RC1][RC2]
- 它不处理钱，也不是 Merchant of Record；Apple/Google/Stripe/Paddle 仍是收款方。它解决的是跨平台权益、收据校验、订阅状态和报表。
- **现在不必接**：首版只有一次性装饰包 + 去广告，用平台自带 Billing/StoreKit + 自己的 Supabase 订单表更简单。
- **值得接的信号**：同时上网页、Android、iOS，且同一份“去广告/季票”权益要跨平台；或者开始做订阅、免费试用、恢复购买、退款对账。届时 1% 换掉自建收据后端通常是划算的。
- 官方提供 Capacitor 插件，网页端另有 purchases-js；接之前要确认 Android `launchMode` 和 iOS In-App Purchase capability。[RC3][RC4]

---

## 4. 收入粗算

### 4.1 公式和假设

```text
月广告收入 = DAU × 30 天 × 人均广告展示次数 × eCPM ÷ 1000
月 IAP 净收入 = DAU × 月付费率 × ARPPU × (1 - 平台抽成)
月可结算收入 ≈ 月广告收入 + 月 IAP 净收入
```

- eCPM 按“发布商到手”口径，已经扣掉广告网络分成；但 **CrazyGames/Poki 的平台分成未扣**。
- IAP 按 **30% 平台抽成**保守计算；如果符合 Apple Small Business 或 Google 首 $1M 档，实际会更高。
- 汇率按 **1 美元 ≈ 7.2 元人民币**做预算，不是实时汇率。
- 未扣：所得税、销售税/VAT、退款、支付争议、服务器、人力、买量成本。
- 月付费率指“当月 DAU 中发生至少一次购买的比例”，是简化口径，不是行业标准指标。

### 4.2 三档情景

| 情景 | DAU | 人均广告展示/天 | 综合 eCPM | 月广告收入 | 月付费率 | ARPPU | 月 IAP 流水 | 扣 30% 后 IAP | 月可结算收入 | 约合人民币 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 保守 | **300** | 1.5 | $2.50 | **$34** | 0.5% | $3 | $4.50 | $3.15 | **约 $37** | **约 ¥270** |
| 中等 | **1,000** | 2.5 | $4.50 | **$338** | 1.0% | $6 | $60 | $42 | **约 $380** | **约 ¥2,700** |
| 乐观 | **5,000** | 3.5 | $7.00 | **$3,675** | 2.0% | $10 | $1,000 | $700 | **约 $4,375** | **约 ¥31,500** |

**怎么读这张表：**
- 300 DAU 时，即使广告和付费都按中等偏上，月收入也只有几百元人民币；这还不够覆盖买量。**先做留存，不要先加广告位。**
- 1,000 DAU 时，广告仍是主要收入（约 89%），IAP 只是补充。要显著提高收入，先把 DAU 和回访做上去，或者把付费率从 1% 提到 3% 以上。
- 5,000 DAU 时的乐观值仍然只是“小团队可持续”级别，不是暴富模型；而且需要真实的高 eCPM 地区和稳定填充。
- 如果实际只有 CrazyGames、且按中等假设（eCPM $4.50）和 50% 平台分成做敏感性测算：1,000 DAU 的广告毛收入约 $338，开发者侧约 **$169/月**；300 DAU 时约 **$51/月**，仍低于 CrazyGames 的 **€100 最低打款额**，当月不会打款。[C5]

### 4.3 同一批 1,000 DAU 放在不同渠道

以下只是“单位经济”对比，不代表各渠道都能自然获得 1,000 DAU；移动端用户通常需要买量或商店推荐。

| 渠道 | 月广告收入（估算） | 月 IAP 净收入 | 合计 | 关键假设 |
|---|---:|---:|---:|---|
| 自有网页 / H5 | $188 | $51 | **$239** | 网页 eCPM $2.50；Paddle 约 15%；10 个付费用户 × $6 |
| CrazyGames | $169–338 | $0 | **$169–338** | 75,000 次展示 × $4.50，开发者分成按 50% 或 100% 做区间；实际比例不公开 |
| Poki | $169–338 | $0 | **$169–338** | 平台流量 50/50 或直接流量 100%；禁止 IAP；默认独家不能忽略 |
| Facebook Instant | $184 | $42 | **$226** | 广告 eCPM $3.50 × 70% 分成；IAP 70%；iOS 费用未计 |
| Google Play / App Store | $450 | $42–51 | **$492–501** | 移动 eCPM $6；IAP 按 30% 或 15% 抽成 |

**结论：**移动应用的单用户收入最高，但前提是有用户、能过审、能持续更新。CrazyGames 的单用户收入最低，却最容易先拿到用户；自有网页/H5 居中，适合做内购实验。

---

## 5. 风险与创始人要做的事

### 5.1 需要花钱的项目

| 项目 | 金额（公开价/预算） | 什么时候需要 | 说明 |
|---|---:|---|---|
| Google Play 开发者账号 | **$25 一次性** | 上 Android 前 | 个人账号还要完成测试和真机验证；资料无效不退款。[G1] |
| Apple Developer Program | **$99/年** | 上 iOS 前 | 个人或公司都要；公司还要 D-U-N-S。[A1] |
| 域名 | **约 $10–20/年** | 做自有网页前 | 已有域名则跳过。 |
| 托管 | **$0 起；可选约 $20/月** | 做自有网页前 | Vercel 免费档可起步；流量上来再升级。 |
| Paddle | **$0 开户；5% + $0.50/笔** | 网页内购前 | Paddle 是 MoR，代处理全球销售税；小额交易固定费占比高。[S2] |
| Stripe | **$0 开户；美国卡 2.9% + $0.30** | 改用 Stripe 时 | 国际卡 +1.5%，换汇 +1%；销售税通常自己处理。[S1] |
| RevenueCat | **$0（MTR < $2,500）；超过后 1%** | 做跨平台权益/订阅时 | 现在不必买；首版一次性商品用平台自带收银台即可。[RC1] |
| 隐私政策 / 服务条款 | **$0 用现有模板；可选 $300–1,000 请律师** | 每个渠道上架前 | 现有 Discord 版已有隐私/条款页，但需改成“含广告/网页支付/App”的版本。 |
| 税务/会计 | **$0 自己报；可选约 $300–1,000/年** | 有收入前 | 具体看主体和所在州；不是平台收费。 |
| 图标/截图/商店文案 | **$0 自己做；可选 $100–500 外包** | 上商店前 | 商店转化率影响很大，但首版可先自己拍。 |
| 测试设备 | **$0 用现有设备；否则二手 Android 约 $100–200** | Android 测试前 | iOS 构建需要 Mac + Xcode；当前开发机是 macOS，可复用。 |
| 公司注册（可选） | **约 $50–500 起 + 年费** | 想以公司名义签约时 | 个人开发者账号也可起步；公司账号审核更正式。 |

**现在不要花的钱：**RevenueCat、AppLovin、付费买量、Poki 独家签约、先买一堆广告 SDK。等 CrazyGames 和网页版有真实留存数据后再决定。

### 5.2 需要做但不一定花钱的事

- [ ] 决定首发主体：个人还是公司；准备法定名称、地址、银行账户、税务表（美国 W-9，非美国通常 W-8BEN/W-8BEN-E）。[A10][G10]
- [ ] 建 Google Play Console 和 App Store Connect 账号，完成身份验证；公司账号准备 D-U-N-S。
- [ ] 把隐私政策、服务条款、账号删除页放到公开 HTTPS 地址；Google 要求 App 内 + 网页都能删号，Apple 要求 App 内能发起删除。[A7][G7]
- [ ] 给每个渠道单独写隐私披露：广告 SDK 收集什么、是否个性化、是否与身份关联；Apple 填 App Privacy，Google 填 Data safety。[A6][G6]
- [ ] 保持 **13+** 定位，不要写成“儿童游戏”；如果让 13 岁以下进入，就要走 Google Families / Apple Kids，广告收入会下降，首版不建议。
- [ ] 完成年龄分级问卷（Google 用 IARC，Apple 用 App Store Connect 问卷）。[A8][G8]
- [ ] 商品只做确定性内容；如果坚持卖随机包裹，先做概率公示和各地区合规评估。
- [ ] 在沙盒测试购买、恢复购买、退款、重复发放、跨设备权益；网页要测 Paddle webhook。
- [ ] 准备商店素材：图标、截图、预览、英文/中文/西班牙语文案；截图不要只放标题图。[A5]
- [ ] Apple 如果保留 Google/邮箱登录，要同时提供 Sign in with Apple；App 内删号要撤销 Apple token。[A5]
- [ ] 给应用商店写审核备注：这是游戏、如何玩、内购在哪里、测试账号是什么；不要用“网页壳”敷衍。
- [ ] 广告上线前确认同意管理：EEA/英国/瑞士的个性化广告需要合规同意；儿童/未知年龄不能个性化。广告后台的要求优先于本文。
- [ ] 每季度复查平台费率和新政策；Google 费率在 2026–2027 仍在滚动切换。[G4]

### 5.3 主要风险

1. **CrazyGames 分成不透明**：不能用固定比例做财务预测；先看后台实际月结单和 €100 最低打款额。[C5][C7]
2. **Poki 独家条款**：默认 5 年网页独家，Discord、YouTube Playables 也算网页；签了会限制自有网页和其他网页平台。首版不要签，至少让律师看合同。[P2]
3. **Facebook IAP 文档冲突**：新 IAP 文档说支持 iOS（走 Apple billing），旧 Business Help 页面说只支持 facebook.com 和 Android；上线前必须在 Dashboard 确认实际结算和费用。[F5][F9]
4. **应用商店“网页壳”风险**：Apple 4.2 要求 App 有持续价值，Google 也打击纯 WebView/重复内容；Capacitor 版要加原生登录、支付、推送/离线等真实集成，不能只是把网址装进壳里。[A5]
5. **付费随机包裹**：应用商店要求披露概率，部分地区限制或禁止；儿童流量下风险更高。最稳的是改卖装饰和去广告。
6. **儿童广告合规**：AdMob 对儿童/未知年龄要设置年龄标记和最大广告内容分级；AppLovin 不是 Families 认证 SDK，不能向儿童初始化；Apple Kids Category 基本不允许第三方广告。[M2][M4][A9]
7. **网页税务**：Stripe 模式下你是 Merchant of Record，销售税/VAT 要自己注册申报；Paddle 省事但每笔贵。不要等有收入才补税。
8. **退款与虚拟货币**：退款要能扣回已发放的宝石/装饰；当前 Supabase 已有 `refund_order` 思路（见 `docs/ship-plan.md`），但网页/应用商店要分别接 webhook 并测试。
9. **广告拦截和填充不足**：游戏必须在没有广告时也能玩；现有 CrazyGames 版已经做了降级，其他渠道也要保持。
10. **流量风险**：自有网页和 H5 没有天然入口；没有社区、SEO、买量或平台推荐，日活不会自己出现。

---

## 6. 推荐顺序和理由

### 推荐顺序

1. **CrazyGames（现在）**  
   已有构建，广告已接，没有公开的上架费；先用 Basic Launch/Full Launch 换真实用户和留存数据。首版不碰 IAP，不签任何独家。
2. **自有网页 + H5（紧接着）**  
   和网页版共用代码；用 Paddle 做全球 MoR，先卖“去广告 + 确定性装饰”。这一步的目的不是立刻赚大钱，而是用最低合规成本验证“玩家会不会付钱”。代码工作交回 CEO 排期。
3. **Google Play（第 3）**  
   $25 一次性，Android 打包和测试成本低；先跑 Play Billing、AdMob、Data safety、账号删除和退款。符合条件时首 $1M 约 15%，比 Apple 标准 30% 友好。
4. **Apple App Store（第 4）**  
   $99/年不是门槛，真正的门槛是审核细节和 iOS 付费/隐私要求；等商品和退款在 Android/网页跑顺后再上，减少来回改包。
5. **Poki（条件成熟再谈）**  
   只有在 CrazyGames 数据证明游戏适合网页、且你愿意放弃自有网页/其他网页平台时才考虑；优先谈**非独家一次性授权**，不要直接接受 5 年独家。
6. **Facebook Instant Games（最后或不做）**  
   需要先申请 Approved Partner，再做 App Review、Quality Review；IAP 的 iOS 结算还有冲突。除非 Facebook 能带来明确流量，否则不值得排在前面。

### 一句话版本

**先用 CrazyGames 拿用户，再用自有网页/H5 验证付费，然后用 Google Play 和 Apple 放大；Poki 的独家条款和 Facebook 的审核/IAP 不确定性，都不适合当前阶段。**

---

## 7. 来源

访问日期均为 **2026-11-05**，另有标注的以标注为准。官方页面多数不标“最后更新日”。

### Apple

- [A1] [Become a member — Apple Developer Program](https://developer.apple.com/programs/enroll/)（$99/年）
- [A2] [App Review](https://developer.apple.com/distribute/app-review/)（典型审核时间）
- [A3] [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)（15% 条件）
- [A4] [Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)（订阅抽成）
- [A5] [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)（IAP、Kids、广告、账号删除、4.2）
- [A6] [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- [A7] [Offering account deletion in your app](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [A8] [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [A9] [Design safe and age-appropriate experiences for your apps](https://developer.apple.com/app-store/kids-apps/)
- [A10] [Provide tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/)
- [A11] [Enter banking information](https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/)

### Google Play

- [G1] [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)（$25、个人账号测试）
- [G2] [Publish your app](https://support.google.com/googleplay/android-developer/answer/9859751?hl=en)（审核时间）
- [G3] [Service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)（费率表）
- [G4] [Understanding Google Play's lower service fees](https://support.google.com/googleplay/android-developer/answer/16954621?hl=en)（地区和生效日期）
- [G5] [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)（Play Billing）
- [G6] [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [G7] [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [G8] [Content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en)
- [G9] [Google Play Families Policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- [G10] [Understanding Your Tax Responsibilities on Google Play](https://support.google.com/googleplay/android-developer/answer/16408159?hl=en)
- [G11] [Create a payments profile](https://support.google.com/googleplay/android-developer/answer/7161426?hl=en)

### CrazyGames

- [C1] [Introduction — CrazyGames Documentation](https://docs.crazygames.com/)
- [C2] [FAQ & Contact](https://docs.crazygames.com/faq/)
- [C3] [Advertisement](https://docs.crazygames.com/requirements/ads/)
- [C4] [In-game purchases](https://docs.crazygames.com/sdk/in-game-purchases/)
- [C5] [Payouts](https://docs.crazygames.com/payouts/)（€100 最低打款、Tipalti）
- [C6] [Gameplay requirements](https://docs.crazygames.com/requirements/gameplay/)（13+/PEGI 12）
- [C7] [Developer Portal Terms and Conditions (PDF, 2025-08-18)](https://files.crazygames.com/documents/developer_terms_20250818.pdf)
- [C8] [Technical requirements](https://docs.crazygames.com/requirements/technical/)

### Poki

- [P1] [Working with Poki](https://developers.poki.com/guide/working-with-poki)（100% 直接 / 50-50、独家）
- [P2] [How we partner with you](https://developers.poki.com/guide/revenue-deal-types)（5 年指示性条款、非独家 flat fee）
- [P3] [How testing works](https://developers.poki.com/guide/how-testing-works)
- [P4] [Release process](https://developers.poki.com/guide/release-process)（2–3 个月全球发布）
- [P5] [Final review](https://developers.poki.com/guide/final-review)
- [P6] [Requirements](https://developers.poki.com/guide/requirements-quality)
- [P7] [Monetization overview](https://developers.poki.com/guide/how-monetization-works)
- [P8] [PokiSDK: HTML5](https://developers.poki.com/guide/sdk-html5)
- [P9] [Content & player safety](https://developers.poki.com/guide/content-player-safety)
- [P10] [Poki Privacy Statement](https://poki.com/en/c/privacy-statement)
- [P11] [Payouts & billing](https://developers.poki.com/guide/payouts-billing)

### Facebook Instant Games

- [F1] [Instant Games](https://developers.facebook.com/docs/games/instant-games)（Updated 2026-03-03）
- [F2] [Approved Partner Program](https://developers.facebook.com/documentation/games/launch/approved-partner-program)
- [F3] [Launch / Reviews](https://developers.facebook.com/documentation/games/launch/reviews/overview)
- [F4] [Quality Guidelines](https://developers.facebook.com/documentation/games/launch/reviews/quality-guidelines)
- [F5] [In-App Purchases (IAP)](https://developers.facebook.com/documentation/games/monetize/in-app-purchases)（Updated 2026-10-25；70/30）
- [F6] [In-App Ads overview](https://developers.facebook.com/documentation/games/monetize/in-app-ads/overview)（约 70% net）
- [F7] [Game Setup](https://developers.facebook.com/documentation/games/launch/game-setup)
- [F8] [Platform Terms](https://developers.facebook.com/terms/)
- [F9] [Monetize Instant Games with In-App Purchases（旧 Business Help）](https://www.facebook.com/business/help/472362043174078/?id=211412110064838)
- [F10] [Quick Start Guide](https://developers.facebook.com/documentation/games/build/quick-start)

### 网页广告

- [H1] [Sign up for AdSense H5 Games Ads](https://support.google.com/adsense/answer/1705831?hl=en)（申请制）
- [H2] [Get started with AdSense H5 Games Ads](https://support.google.com/adsense/answer/9959170?hl=en)
- [H3] [Ad Placement API](https://developers.google.com/ad-placement/apis)（插屏/preroll/激励）
- [H4] [AdSense revenue share](https://support.google.com/adsense/answer/180195)（内容广告 80%，其他产品不公开）
- [H5] [Ad Placement API 文档](https://developers.google.com/ad-placement)

### 广告网络与 eCPM

- [M1] [AdMob ad formats](https://support.google.com/admob/answer/6128738?hl=en)
- [M2] [Comply with Google Play Families Policy using AdMob](https://support.google.com/admob/answer/6223431?hl=en)
- [M3] [AdMob rewarded ads policy](https://support.google.com/admob/answer/7313578?hl=en)
- [M4] [AppLovin privacy / children restrictions](https://developers.applovin.com/en/max/android/overview/privacy)
- [M5] [Unity Ads COPPA compliance](https://docs.unity.com/grow/ads/privacy/coppa-compliance)
- [E1] [TopOn Global Mobile Games Monetization Report 2025 H1 (PDF)](https://mores.toponad.com/reports/TopOn%20Global%20Mobile%20Games%20Monetization%20Report%20_%202025%20H1.pdf)（数据 2025 H1，PDF 创建 2025-08-14）
- [E2] [Appodeal The Latest eCPM Report 2025 (PDF)](https://appodeal.com/wp-content/uploads/2025/03/Appodeal-The-Latest-eCPM-Report-2025.pdf)（数据 2024 Q4，2025-03 上传）
- [E3] [Playwire — AdMob eCPM benchmarks](https://www.playwire.com/blog/admob-ecpm-benchmarks-what-publishers-should-expect)（2025-09-17；方法论未公开）
- [E4] [AnyMind — eCPM Trends for Interstitial & Rewarded Ads 2024 & Q1 2025 (Web)](https://anymindgroup.com/report/download-ecpm-trends-interstitial-rewarded-ads-2025/)（2025-05-26，数据 Q1 2025）

### 支付、内购工具与儿童隐私

- [S1] [Stripe Pricing](https://stripe.com/pricing)（访问 2026-11-05）
- [S2] [Paddle Pricing](https://www.paddle.com/pricing)（访问 2026-11-05）
- [RC1] [RevenueCat Pricing](https://www.revenuecat.com/pricing/)（$2,500 MTR 以下免费，之后 1%）
- [RC2] [RevenueCat MTR 说明](https://www.revenuecat.com/docs/welcome/set-up-revenuecat/account-management)
- [RC3] [RevenueCat Web billing overview](https://www.revenuecat.com/docs/web/overview)
- [RC4] [RevenueCat Capacitor 安装](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [L1] [16 CFR Part 312 — COPPA Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312)（内容截至 2026-11-03）

### 本仓库相关文档

- `docs/ship-plan.md`：当前 CrazyGames/Discord 上线计划和变现决定（2026-11-04）。
- `docs/design-v2.md`：宝石转向装饰、制服、季票的方向。
- `discord/legal/privacy.html`、`discord/legal/terms.html`：现有隐私政策和服务条款，可作为网页/应用版本的底稿，但必须增加广告和网页支付披露。
