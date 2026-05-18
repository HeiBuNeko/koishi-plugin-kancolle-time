# koishi-plugin-kancolle-time

[![npm](https://img.shields.io/npm/v/koishi-plugin-kancolle-time?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kancolle-time)

在已配置的频道中，按 **Koishi 进程所在机器的本地时区** 的**整点**推送《舰队 Collection》风格的舰娘时报：日文台词、中文台词以及一条语音。**语音文件来自舰娘百科（uploads.kcwiki.cn）**；舰娘与时间轴数据内置在插件随附的 `time_list.json` 中。

---

## 依赖

在安装本插件的同时，请在 Koishi 中启用并保持运行：

| 依赖 | 说明 |
|------|------|
| `koishi-plugin-cron`（或提供 `cron` 服务的插件） | 用于整点报时与每日换船任务 |
| 数据库插件（提供 Koishi `database` 服务） | 持久化每个频道的舰娘与「是否每日随机」设置 |

Koishi 最低版本请以 `package.json` 中 `peerDependencies.koishi` 为准。

---

## 配置

所有「在哪些频道报时、用哪艘舰娘」均通过插件配置里的 **`targets`** 数组设置，不支持在运行时通过额外子命令动态增删频道（运行时仅可查当前舰娘）。

### `targets` 每一项

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | `string` | 平台标识，与会话中的一致（如 OneBot 下常用 `onebot`） |
| `channelId` | `string` | 频道 ID，与该平台下的频道 ID 一致 |
| `random` | `boolean` | `true`：每日随机换一艘有时报数据的舰娘；`false`：固定使用 `ship` |
| `ship` | `string` | 仅在 `random` 为 `false` 时必填；取值必须为内置数据中存在的舰娘名（与 `time_list.json` 中 `ship_name` 一致） |

### 配置示例（`koishi.yml`）

```yaml
plugins:
  kancolle-time:
    targets:
      - platform: onebot
        channelId: '123456789'
        random: true
      - platform: onebot
        channelId: '987654321'
        random: false
        ship: 长门
```

### 与数据库同步方式

插件在**加载时会清空表 `kancolle_time`**，再根据当前配置 `targets` **全量写入**数据库：

- **`random: true`**：启动时会为该行随机指派一艘舰娘并写入数据库；此后由定时任务负责在深夜更换。
- **`random: false`**：写入你选择的那艘固定舰娘。

修改 `targets` 后需保存配置并重启/重载插件，新的频道列表才会生效。

---

## 行为说明

### 整点报时

- 使用 Cron：**每小时的第 0 分钟**执行（`0 * * * *`）。
- 为减少整点漂移，插件在计算「当前是几点」时对系统时间做了 **约 1 分钟的前向偏移**，再换算为日文数字风格的时报标签（例如 20 点对应 `time_list.json` 中的「二〇〇〇时报」）。
- 对每个已配置频道，根据该行存储的舰娘查找对应整点的条目；发送内容顺序为：**日文台词** → **中文台词** → **`h.audio` 外链语音**。
- 若某舰娘缺少该小时的条目，会向日志打出警告并跳过该次发送。

### 每日随机舰娘（`random: true`）

- 每天在 **23:59**（本地时区）为所有 `random: true` 的行重新 **`Random.pick` 一艘舰娘**并写回数据库，从而在次日全天使用新的一艘舰娘的时报语音与台词。

### 数据来源与限制

- 仅包含有内置数据的舰娘；若固定填写了数据中不存在的名称，校验阶段即可能无法通过配置。
- 报时需要能够访问语音 URL（通常为 `uploads.kcwiki.cn`）；若服务端返回错误 or 网关异常，机器人侧可能出现发送失败（如下文「常见问题」）。

---

## 指令

| 指令 | 作用 |
|------|------|
| `kancolle-time.info` | 在当前会话所属平台与频道查询数据库中配置的舰娘名称；若该频道未在 `targets` 中登记，返回未设置 |

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

- 确认 `targets` 里 `platform` / `channelId` 与真实会话一致。
- 确认已安装 Cron 插件且插件无报错日志。
- 查看日志是否有「未找到报时条目」类警告（该舰娘可能没有该小时的内置数据）。

### 为什么没有 `ship` / `random` / `off` 等子命令？

当前代码仅实现 **配置驱动的 `targets` + `kancolle-time.info` 查询**。若文档或旧 README 中记载了其他子命令，请以仓库内 **`src/index.tsx`** 为准。

---

## 数据与致谢

- 时报结构与语音链接来自 **[舰娘百科](https://zh.kcwiki.cn)**（及 uploads 域名）。
- 历史爬虫/数据流水线可参考：`https://github.com/HeiBuNeko/kancollebot`。

---

## 开源与仓库

- 许可证：**MIT**
- 仓库：https://github.com/HeiBuNeko/koishi-plugin-kancolle-time
