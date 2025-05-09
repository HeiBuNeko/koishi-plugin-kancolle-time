# koishi-plugin-kancolle-time

[![npm](https://img.shields.io/npm/v/koishi-plugin-kancolle-time?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-kancolle-time)

舰娘报时插件，报时语音来源于舰娘百科，数据来源于舰娘百科 Scrapy 项目：[https://github.com/HeiBuNeko/kancollebot](https://github.com/HeiBuNeko/kancollebot "kancolle-bot")

依赖的数据源包括 `time_list.json` 时报列表

目前内置于插件中暂不支持客制化

# 使用方法

#### kancolle-time ship `<ship>` 指定舰娘报时

传入 `random` 参数时指定随机舰娘报时

- 使用示例：kancolle-time ship 长门 / kancolle-time ship random

仅限于存在于舰娘 Wiki 上有具体页面且有报时的舰娘

整点报时时会从舰娘 Wiki 上请求语音文件，请确保与舰娘 Wiki 的连接畅通

#### kancolle-time random 每日随机舰娘报时

开启每日随机舰娘报时，报时舰娘将于当天 0 点更新

#### kancolle-time status 当前群组舰娘报时状态

#### kancolle-time off 关闭舰娘报时

# 常见问题

#### 发送群组消息 retcode: 1200 报错

```
[W] bot Error: Error with request send_group_msg, args: {"group_id":xxx,"message":[{"type":"record","data":{"file":"xxx.mp3","cache":0}}]}, retcode: 1200
```

通常是由于舰娘百科文件服务器 502 错误

# 更新日志

- v1.1.2 ship_list “zh-cn”替换“wiki” fix: time_list 简繁随机出现的问题
- v1.1.1 数据更新 舰娘百科 v2025.02.25
- v1.1.0 数据更新 舰娘百科 v2025.01.20
- v1.0.6 优化每日随机舰娘，更新 time_list.json 补充缺少的秋月
- v1.0.5 更新 README.md，添加 help 菜单说明
- v1.0.4
  - 优化数据库结构
  - 当前群组舰娘报时状态
  - 每日随机舰娘报时
  - 指定随机舰娘报时
- v1.0.3 代码写法
- v1.0.2 数据源修正 - Wiki 部分页面中 时报 为折叠元素
- v1.0.1 添加缺失的 `json` 文件
- v1.0.0 指定舰娘报时功能
