# 玩法指标（design v2 §9）

`src/core/metrics.ts` 在存档里记几个玩法计数，用来判断第 1、2 步改版有没有用。只有游戏内数字，没有姓名、邮箱、设备、IP 等个人信息，也不另发任何上报请求。

## 存了什么

`state.metrics = { first, days }`

| 字段 | 含义 |
|---|---|
| `first` | 计数开始的第一天（本地日期 `YYYY-MM-DD`），用来算次日 / 7 日回访 |
| `days[].d` | 那一天 |
| `days[].o` | 当天拆开的包裹数（不含交还 / 退回的） |
| `days[].g` | 其中先选了系列再拆的数量（“先猜再拆”） |
| `days[].dl` | 每日之谜：0 没玩、1 猜过但没结束、2 已结束（猜中或用完次数） |
| `days[].sh` | 当天复制每日之谜成绩的次数 |

- 打开游戏时记一天；标签页开着跨过午夜，下一次时钟检查（约 1 分钟）也会记新的一天。
- 只留最近 60 天。坏掉的计数只会把计数清零，不会影响存档的其他部分（`src/core/sanitize.ts`）。
- 开发版的开发面板里有一行 `v2 metrics`，显示本机这份存档的汇总。

## 指标怎么算

| 指标 | 算法 | 目标（design v2 §9） |
|---|---|---|
| 先猜再拆比例 | Σg ÷ Σo（只算拆开的包裹） | > 60% |
| 每日之谜完成率 | `dl = 2` 的天数 ÷ 玩过的天数 | 上升 |
| 每日之谜分享率 | 完成且 `sh > 0` 的天数 ÷ 完成的天数 | 上升 |
| 次日 / 7 日回访 | `first + 1` / `first + 7` 那天有没有记录；那天还没到算“未知”，不算“没回来” | 不在第 6–7 天断崖 |

## 各平台能不能看到真实数据

| 平台 | 数据去哪 | 后台能不能查 |
|---|---|---|
| 网页版 / Discord（已登录，含游客账号） | 存档随云存档上传到 Supabase `public.saves.state` | **能**，用下面的 SQL。前提是云存档真的在上传；Discord 要等 `docs/ship-plan.md` 的 B12/B14 登录链核实 |
| CrazyGames | 存档存在 CrazyGames SDK Data 里 | **不能**。我们的后台拿不到。上线后的整体行为只能看 CrazyGames 开发者后台；如果以后要自己的汇总，需要另行批准匿名统计上报 |
| 未登录的本地存档 | 只在本机 | 不能 |

## Supabase 查询（SQL 编辑器，只读）

整体先猜再拆比例、每日之谜完成率和分享率（最近 30 天）：

```sql
with d as (
  select s.user_id, (r->>'d')::date as day, (r->>'o')::int as o, (r->>'g')::int as g,
         (r->>'dl')::int as dl, (r->>'sh')::int as sh
  from public.saves s
  cross join lateral jsonb_array_elements(coalesce(s.state->'metrics'->'days', '[]'::jsonb)) r
  where (r->>'d')::date >= current_date - 30
)
select count(distinct user_id)                                                     as players,
       round(100.0 * sum(g) / nullif(sum(o), 0), 1)                                as guess_first_pct,
       round(100.0 * count(*) filter (where dl = 2) / nullif(count(*), 0), 1)      as daily_finish_pct,
       round(100.0 * count(*) filter (where dl = 2 and sh > 0)
             / nullif(count(*) filter (where dl = 2), 0), 1)                       as daily_share_pct
from d;
```

按天看趋势：把上面最后的 `select` 换成 `select day, …, group by day order by day`。

次日 / 7 日回访（只算那一天已经过去的玩家）：

```sql
with p as (
  select s.user_id, (s.state->'metrics'->>'first')::date as first,
         array(select (r->>'d')::date from jsonb_array_elements(s.state->'metrics'->'days') r) as days
  from public.saves s
  where s.state->'metrics'->>'first' is not null
)
select count(*) filter (where first + 1 < current_date)                              as d1_cohort,
       round(100.0 * count(*) filter (where first + 1 < current_date and (first + 1) = any(days))
             / nullif(count(*) filter (where first + 1 < current_date), 0), 1)       as d1_pct,
       count(*) filter (where first + 7 < current_date)                              as d7_cohort,
       round(100.0 * count(*) filter (where first + 7 < current_date and (first + 7) = any(days))
             / nullif(count(*) filter (where first + 7 < current_date), 0), 1)       as d7_pct
from p;
```

注意：只留 60 天，所以 `first` 早于 60 天前的玩家，第 1 / 7 天的记录可能已被删掉，回访只看近期新玩家才准。
