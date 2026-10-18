# 美术资源接入规范（Art Handoff Spec）

> **状态更新**：游戏的 16-bit 像素美术**已全部实装**——`js/art.js` 内含 15 组代码精灵、统一调色板与主菜单主视觉，`js/render.js` 负责地块/墙体/光影/氛围。
> 本文件现在是**替换 / 扩展规范**：若要与 AI 或外包素材混用，按以下尺寸、命名与调色板产出即可。
>
> 代码精灵 id 与尺寸（`ZTS.art.SPR`）：`player 12×15` · `walker 11×13` · `runner 11×13` · `dog 18×9` · `spitter 12×13` · `boomer 12×13` · `brute 17×15` · `screamer 12×13` · `butcher/hive/tyrant 24×17` · `barrel/crate 8×8` · `supply 11×10` · `intel 8×8`。**1 个美术像素 = 2 世界单位**，统一 1px 深色描边（`#08090c`），调色板见 `js/art.js` 的 `PAL`。

## 一、通用规范

| 项 | 要求 |
|----|------|
| 格式 | PNG-24，透明背景，**不要**抗锯齿边缘（保留硬像素边） |
| 像素网格 | 所有素材按整数像素网格对齐；游戏内 1 像素 = 1 世界单位 |
| 描边 | 角色/道具统一 1px 深色描边（明度约为填充色 45%） |
| 色彩 | 见"色板"一节；同类物件 ≤ 4 色（含描边） |
| 体积 | 单张 ≤ 512KB，整套 ≤ 3MB |
| 目录 | `assets/sprites/`、`assets/tiles/`、`assets/ui/`、`assets/fx/`、`assets/sfx/` |

## 二、角色精灵（sprites）

命中判定半径为固定值，**美术尺寸可与判定不一致**（以画面视觉为准）。

| 文件 | 内容 | 建议尺寸 | 帧数 | 说明 |
|------|------|----------|------|------|
| `player_idle.png` | 玩家站立 | 16×24 | 1 | 四方向：`player_up/right/down/left.png`，或单张横向排列 4 帧 |
| `player_walk.png` | 走路 | 16×24 | 4（2 循环步态） | 步频与移速挂钩 |
| `player_gun.png` | 持枪手部层（单独绘制，跟随瞄准角度旋转） | 16×16 | 1 | 枪口位置请居中偏右 |
| `zombie_walker.png` | 步行尸 | 16×16 | 2 | 拖步摆动 |
| `zombie_runner.png` | 疾行尸 | 16×16 | 4 | 前倾、手臂后摆 |
| `zombie_dog.png` | 尸犬 | 20×14 | 4 | 四足折线跑 |
| `zombie_spitter.png` | 呕吐者 | 18×18 | 2 | 腹部鼓胀 |
| `zombie_boomer.png` | 自爆尸 | 20×20 | 2 | 脓包发光（可用浅黄高光表达） |
| `zombie_brute.png` | 装甲尸 | 24×24 | 2 | 板甲块面、深灰 |
| `zombie_screamer.png` | 尖啸者 | 18×20 | 2 | 张口嘶吼轮廓 |
| `boss_butcher.png` | 屠夫（Boss） | 48×48 | 4 | 血肉围裙、巨钩武器 |
| `boss_hive.png` | 母巢（Boss） | 52×52 | 4 | 肉团隆起 + 触须 |
| `elite_overlay.png` | 精英光效 | 32×32 | 1 | 紫色描边光晕，叠加在任意丧尸上 |

**动画命名**：多帧素材请横向排列，文件名后缀 `_f1.png...` 或单图内等距切帧，交付时请附 `slice.json`（帧宽、帧高、间隔）：

```json
{ "frameWidth": 16, "frameHeight": 16, "columns": 2, "rows": 1, "fps": 6 }
```

## 三、地块与场景（tiles）

| 文件 | 内容 | 尺寸 | 说明 |
|------|------|------|------|
| `tileset_hospital.png` | 医院地块集 | 每组 32×32 | 地砖×4 变体 + 血迹×2 + 病床/木箱 |
| `tileset_subway.png` | 地铁隧道 | 同上 | 含轨道条、警示黄线 |
| `tileset_base.png` | 军事基地 | 同上 | 集装箱、沙袋、砾石地 |
| `tileset_prison.png` | 监狱 | 同上 | 铁栏、牢房地面、探照灯痕迹 |
| `tileset_lab.png` | 生化研究所 | 同上 | 冷色地砖、培养舱、毒渍 |

每张地图的配色方向（供取色参考）：

| 地图 | 主色 | 辅色 | 强调 |
|------|------|------|------|
| 圣玛丽医院 | `#2a2d33` 灰白 | `#1f2227` | `#7a2b2b` 血污 |
| 地铁隧道 | `#1c2026` 蓝黑 | `#171b20` | `#c9a23c` 钠黄 |
| 军事基地 | `#26261f` 橄榄 | `#20201a` | `#5e7a3c` 军绿 |
| 铁壁监狱 | `#20242a` 铁灰 | `#1a1e23` | `#aab6c2` 探照白 |
| 生化研究所 | `#1e2528` 冷青 | `#191f22` | `#5fd4b8` 荧光绿 |

## 四、道具与特效（ui / fx）

| 文件 | 内容 | 尺寸 | 备注 |
|------|------|------|------|
| `pickup_xp.png` | 经验球 | 8×8 | 金黄，带高光 |
| `pickup_health.png` | 医疗包 | 16×16 | 白底红十字 |
| `pickup_ammo.png` | 弹药箱 | 16×16 | 橄榄绿木箱 |
| `pickup_grenade.png` | 手雷 | 12×12 | 深绿 |
| `pickup_serum.png` | 血清 | 12×16 | 荧光绿试管 |
| `pickup_supply.png` | 空投补给箱 | 32×32 | 金色信标光效（游戏内会脉冲发光） |
| `prop_barrel.png` | 油桶（可打爆） | 32×32 | 锈红桶身 + 黄色危险条，**会在 0.3 秒内连锁爆炸** |
| `prop_crate.png` | 补给木箱 | 32×32 | 木板纹理 + 铁角，打碎掉物资 |
| `fx_pool.png` | 毒池 | 64×64 | 荧光黄绿，可叠加；精英「剧毒」词条产物 |
| `fx_beam.png` | 暴君光束 | 256×64 | 横向渐变（中心白 → 边缘橙红），运行时按角度旋转并拉伸到 1150 长度 |
| `elite_aura.png` | 精英词条光环 | 48×48 | 4 色版本：狂暴 `#ff6b4a` / 护盾 `#6bb4ff` / 再生 `#6bff9a` / 剧毒 `#c9ff4a`，弧形旋转 |
| `ui_curse_icons.png` | 契约图标 | 4 × 24×24 | 顺序：无契约 / 血肉 / 狂潮 / 暗影 |
| `ui_reroll.png` | 刷新图标 | 24×24 | 用于三选一界面「刷新」按钮 |
| `portrait_<id>.png` | 人物半身立绘 | 1024×1536 | 8 人（老鸮/小满/白鸦/铁砧/囚徒07/屠戈/沈副所长/铁砧-00），色板与外观见 `../zombie-tide-survivors-story-bible.zh.md` 第 6 章 |
| `avatar_<id>.png` | 电台头像 | 96×96 | 与立绘同色板；用于电台播报与档案室人物卡 |
| `intel_card.png` | 情报日志卡片底 | 320×180 | 三种磨损度（新 / 旧 / 血渍） |
| `boss_card_<id>.png` | Boss 登场卡 | 1280×720 | 3 张（屠夫 / 母巢 / 暴君），可作全屏闪烁卡 |
| `pickup_intel.png` | 情报日志（掉落物） | 20×20 | 青色数据板，带微光 |
| `fx_blood.png` | 血溅 | 8×8 ×4帧 | 覆盖在地面为持久贴花 |
| `fx_spark.png` | 火花/弹着 | 8×8 ×3帧 | 枪口与命中 |
| `fx_boom.png` | 爆炸 | 32×32 ×4帧 | 环状扩散 |
| `fx_flame.png` | 火焰 | 16×16 ×3帧 | 喷射粒子 |
| `ui_weapon_icons.png` | 武器图标 | 每格 24×24 | 6 格横排，顺序：手枪/霰弹/冲锋/步枪/火焰/电磁 |
| `cover.png` | 首页主视觉（可选） | 1280×720 | 若存在将作为主菜单背景；程序化细节会被覆盖 |

## 五、工程接入点（给工程侧）

> 素材就绪后，工程侧只需要替换以下函数，世界逻辑与数值完全不用动。

| 现函数（`js/render.js`） | 替换为 |
|--------------------------|--------|
| `drawZombie(ctx, world, e)` | 按 `e.kind` / 朝向取精灵图，`ctx.drawImage` + 受击白闪（`globalCompositeOperation="source-atop"` 覆盖白色矩形） |
| `drawPlayer(ctx, world)` | 同上；枪械层按 `p.facing` 旋转绘制 |
| `drawPropStatic(g, pr, th)` | 从 tileset 取对应格子 |
| `buildFloorLayer(world)` | 用 tileset 平铺 32×32 地块，替换现有程序化地砖 |
| 拾取物 / 粒子段落（`draw()` 内） | 用 `pickup_*` / `fx_*` 精灵替换 |

接入约定：

1. 所有 `drawImage` 请保持整数坐标（无需四舍五入到位图内部像素，渲染层已按 1:1 世界坐标绘制）。
2. 保留"受击白闪 + 精英紫色描边 + 冰冻/燃烧叠加色"三种着色效果（可用 `globalAlpha` 叠加实现）。
3. 若提供 `sprites/slice.json`，请以它为准切帧；未提供时按"横向等距切帧"处理。

## 六、音效（可选，sfx）

当前音效为 WebAudio 实时合成（见 `js/audio.js` 的 `SFX` 表）。若要替换为素材，请按以下命名放入 `assets/sfx/`（16-bit WAV 或 44.1kHz MP3，单文件 ≤ 100KB）：

```
pistol / shotgun / smg / rifle / flamer / railgun / reload / hit / crit /
zdie / zgroan / boom / spit / hurt / dash / pickup / serum / medkit /
grenade / levelup / buy / deny / click / waveClear / boss / train / alarm /
victory / defeat / heartbeat / turret
```

命名与 `js/audio.js` 中 `SFX` 键一一对应，替换时无需改动任何游戏逻辑。
