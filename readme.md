# koishi-plugin-kancolle-time

[![npm](https://img.shields.io/npm/v/koishi-plugin-kancolle-time?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kancolle-time)

在已配置的频道中，按 **Koishi 进程所在机器的本地时区** 的**整点**推送《舰队 Collection》风格的舰娘时报：日文台词、中文台词以及一条语音。**语音文件来自舰娘百科（uploads.kcwiki.cn）**；舰娘与时间轴数据内置在插件随附的 `time_list.json` 中（当前共 **213** 位舰娘）。

支持通过 **`targets` 配置**预置频道，也支持在会话内用指令开关报时、切换舰娘或开启每日随机。

---

## 依赖

在安装本插件的同时，请在 Koishi 中启用并保持运行：

| 依赖 | 说明 |
|------|------|
| `koishi-plugin-cron`（或提供 `cron` 服务的插件） | 用于整点报时与每日换船任务 |
| 数据库插件（提供 Koishi `database` 服务） | 持久化每个频道的启用状态、舰娘与「是否每日随机」设置 |

Koishi 最低版本请以 `package.json` 中 `peerDependencies` 为准（当前为 Koishi `^4.18.11`、`@satorijs/element` `^3.2.0`）。插件使用 JSX 渲染消息元素，需由 Koishi 运行时提供 `@satorijs/element`。

---

## 配置

频道报时通过插件配置里的 **`targets`** 数组登记。每个频道还可通过指令在运行时调整启用状态、舰娘与随机模式（见下文「指令」）。

### `targets` 每一项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用报时；也可在频道内用 `kancolle-time.on` / `kancolle-time.off` 切换 |
| `platform` | `string` | — | 平台标识，与会话中的一致（如 OneBot 下常用 `onebot`） |
| `channelId` | `string` | — | 频道 ID，与该平台下的频道 ID 一致 |
| `random` | `boolean` | `false` | `true`：每日随机换一艘有时报数据的舰娘；`false`：固定使用 `ship` |
| `ship` | `string` | 随机 | 舰娘名（与 `time_list.json` 中 `ship_name` 一致）；`random: false` 时**必填**；`random: true` 时可省略，由插件随机指派 |

> 通过指令（如 `kancolle-time.on`、`kancolle-time.ship`）首次为频道写入数据库时，若该行尚未存在，数据库字段 **`enabled` 默认 `true`**，即默认开启报时。在 `targets` 中预置的频道，`enabled` 配置项默认亦为 `true`。

### 配置示例（`koishi.yml`）

每日随机舰娘：

```yaml
plugins:
  kancolle-time:
    targets:
      - enabled: true
        platform: onebot
        channelId: '123456789'
        random: true
```

固定舰娘：

```yaml
plugins:
  kancolle-time:
    targets:
      - enabled: true
        platform: onebot
        channelId: '123456789'
        random: false
        ship: 长门
```

### 与数据库同步方式

配置与数据库之间是**双向同步**的：

| 方向 | 触发时机 |
|------|----------|
| 配置 → 数据库 | 插件**加载 / 重载**时：删除不在 `targets` 中的频道记录，再 **upsert** `targets` 中的条目 |
| 数据库 → 配置 | 加载 / 重载完成 upsert 后、频道指令（`on` / `off` / `ship` / `random`）或 **23:59 换船**完成后，调用 `syncScope()`，通过 `ctx.scope.update` 将数据库中的全部频道写回 `targets` 并持久化 |

各字段含义：

- **`enabled: true`**：该频道参与整点报时与（若开启）每日换船。
- **`random: true`**：启动或换船时会随机指派一艘舰娘；23:59 更换后同样会回写配置。
- **`random: false`**：使用固定舰娘 `ship`（配置校验要求填写有效舰娘名）。

在频道内通过指令修改启用状态、舰娘或随机模式后，变更会**立即生效并写回配置文件**，一般无需再手动编辑 `koishi.yml`。若你在控制台或直接修改 `koishi.yml` 中的 `targets`（增删频道、改初始参数等），则需保存并重启/重载插件，才会按文件中的配置覆盖数据库中对应条目。

---

## 行为说明

### 整点报时

- 使用 Cron：**每小时的第 0 分钟**执行（`0 * * * *`）。
- 为减少整点漂移，插件在计算「当前是几点」时对系统时间做了 **约 1 分钟的前向偏移**，再换算为日文数字风格的时报标签（例如 20 点对应 `time_list.json` 中的「二〇〇〇时报」）。
- 仅对数据库中 **`enabled: true`** 的频道发送报时。
- 对每个已启用频道，根据该行存储的舰娘查找对应整点的条目；发送内容顺序为：**日文台词** → **中文台词** → **`<audio>` 外链语音**。
- 若某舰娘缺少该小时的条目，会向日志打出警告并跳过该次发送。
- 单个频道发送失败时仅记录警告日志，不影响其他频道。

### 每日随机舰娘（`random: true`）

- 每天在 **23:59**（本地时区）为所有 **`enabled: true` 且 `random: true`** 的行重新 **`Random.pick` 一艘舰娘**并写回数据库，从而在次日全天使用新的一艘舰娘的时报语音与台词。

### 数据来源与限制

- 仅包含有内置数据的舰娘；配置 Schema 会将 `ship` 限定为 `time_list.json` 中的名称，`kancolle-time.ship` 指令也会校验舰娘名是否有效。
- 报时需要能够访问语音 URL（通常为 `uploads.kcwiki.cn`）；若服务端返回错误或网关异常，机器人侧可能出现发送失败（如下文「常见问题」）。

---

## 指令

以下指令均在**当前会话所属平台与频道**上生效，并写入数据库。

| 指令 | 作用 |
|------|------|
| `kancolle-time.info` | 查询当前频道的启用状态、舰娘名称与是否每日随机；若该频道未登记，返回「未设置」 |
| `kancolle-time.list` | 以合并转发消息列出全部可选舰娘（共 213 位，全角序号），并提示设置方式 |
| `kancolle-time.on` | 开启当前频道的舰娘报时（`enabled: true`） |
| `kancolle-time.off` | 关闭当前频道的舰娘报时（`enabled: false`） |
| `kancolle-time.ship <舰娘名>` | 将当前频道的报时舰娘设为指定名称，例如 `kancolle-time.ship 长门`；名称无效时返回提示 |
| `kancolle-time.random <true\|false>` | 开启或关闭当前频道的每日随机舰娘，例如 `kancolle-time.random true` |

（指令名不含子命令别名；以 Koishi 市场/配置中展示的为准。）

---

## 常见问题

### 发送后出现 `retcode: 1200` 等与语音相关的报错

报错形态可能类似：

```
[W] bot Error: Error with request send_group_msg ... "type":"record" ... retcode: 1200
```

常见原因之一是语音文件 CDN（如舰娘百科侧）短时 **502/不可用**，导致远端文件无法作为语音正常下发。可多试几次或稍后重试；若长期失败，需检查该 URL 是否能在运行环境中访问。

### 整点没有消息

- 确认该频道 **`enabled` 为 `true`**（配置、`kancolle-time.on`，或通过指令首次登记时的数据库默认值）。
- 确认该频道已在 `targets` 中登记，且 `platform` / `channelId` 与真实会话一致。
- 确认已安装 Cron 插件且插件无报错日志。
- 查看日志是否有「未找到报时条目」类警告（该舰娘可能没有该小时的内置数据）。

### 手动改配置后，和指令里的设置对不上？

插件重载时会按 **`koishi.yml` 中的 `targets`** upsert 数据库，并移除不在 `targets` 中的频道记录。通过指令做的修改会先经 `syncScope()` 写回配置，因此正常重载不会丢失。若你**绕过指令、直接编辑配置文件**后又重载，则以文件内容为准；请确认文件中的 `targets` 与预期一致。

---

## 数据与致谢

- 时报结构与语音链接来自 **[舰娘百科](https://zh.kcwiki.cn)**（及 uploads 域名）。
- 历史爬虫/数据流水线可参考：`https://github.com/HeiBuNeko/kancollebot`。

---

## 开源与仓库

- 许可证：**MIT**
- 仓库：https://github.com/HeiBuNeko/koishi-plugin-kancolle-time

---

## 更新日志

### 2.0.2

- **`enabled` 配置项默认值改为 `true`**，与数据库 `initial` 及指令首次登记行为一致。
- 插件加载时**不再清空整张 `kancolle_time` 表**：仅删除不在 `targets` 中的频道，再 upsert 配置条目，随后 `syncScope()` 写回配置。
- 加载 / 重载完成后也会执行 `syncScope()`，保证配置文件与数据库一致。

### 2.0.1

- 新增 `targets` 配置项 **`enabled`**，用于控制频道是否参与报时。
- 新增频道级指令：`kancolle-time.on`、`kancolle-time.off`、`kancolle-time.ship`、`kancolle-time.random`、`kancolle-time.list`。
- `kancolle-time.info` 现同时返回启用状态与每日随机设置。
- 整点报时与每日换船仅作用于 **`enabled: true`** 的频道。
- 指令与 23:59 换船完成后通过 **`syncScope()`** 将数据库状态回写 `targets` 配置。
- 数据库 `enabled` 字段 **`initial` 改为 `true`**：通过指令首次登记频道时默认开启报时，无需额外执行 `kancolle-time.on`。
- 声明 `@satorijs/element` 为 peerDependency，修复 JSX 构建时的依赖缺失报错。

### 2.0.0

- 重构为 **`targets` 配置驱动**：在 `koishi.yml` 中预置平台、频道、舰娘与随机模式。
- 引入数据库表 `kancolle_time` 持久化各频道状态；插件加载时按配置全量同步。
- 新增 `kancolle-time.info` 查询当前频道舰娘。
- 统一报时数据结构（`time_list.json`），使用 `ctx.broadcast` 投递整点报时。
- 移除旧版基于会话子命令动态增删频道的用法，改为配置 + 指令组合。
