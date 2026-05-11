import { Context, h, Schema, Universal } from "koishi";
import "koishi-plugin-cron";

import timeListJson from "./time_list.json";

export const name = "kancolle-time";
export const inject = ["cron"];

const DIGITS = "〇一二三四五六七八九";

export interface TimeTarget {
  ship: string;
  platform: string;
  guild: string;
  selfId?: string;
}

export interface Config {
  targets: TimeTarget[];
}

interface ITimeItem {
  name: string;
  time: string;
  time_word_jp: string;
  time_word_cn: string;
  href: string;
}

const timeList = timeListJson as ITimeItem[];

const shipNames = [...new Set(timeList.map((i) => i.name))].sort();

const ShipSchema = Schema.union(
  shipNames.map((name) => Schema.const(name)),
) as Schema<string>;

const TargetSchema: Schema<TimeTarget> = Schema.object({
  ship: ShipSchema.description("舰娘（可搜索下拉）"),
  platform: Schema.string().description(
    "机器人平台，与 Bot#platform 一致（如 onebot）",
  ),
  guild: Schema.string().description(
    "频道 ID：QQ 群填群号字符串（与 session.channelId 一致）；其他平台填对应 channelId",
  ),
  selfId: Schema.string()
    .required(false)
    .description("可选。同平台有多账号时填写 bot.selfId 以指定机器人"),
});

export const Config: Schema<Config> = Schema.object({
  targets: Schema.array(TargetSchema)
    .description("整点报时：每条对应该频道使用指定舰娘语音与台词")
    .default([]),
});

function hourToTimeLabel(hour: number): string {
  const tens = Math.floor(hour / 10);
  const ones = hour % 10;
  return `${DIGITS[tens]}${DIGITS[ones]}〇〇时报`;
}

function buildTimeIndex(list: ITimeItem[]): Map<string, ITimeItem> {
  const map = new Map<string, ITimeItem>();
  for (const item of list) {
    map.set(`${item.name}\0${item.time}`, item);
  }
  return map;
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger("kancolle-time");
  const byKey = buildTimeIndex(timeList);

  ctx.cron("0 * * * *", async () => {
    const hour = new Date().getHours();
    const label = hourToTimeLabel(hour);

    for (const target of config.targets) {
      const item = byKey.get(`${target.ship}\0${label}`);
      if (!item) {
        logger.warn(
          `整点 ${label} 无数据：舰娘「${target.ship}」，已跳过 guild=${target.guild}`,
        );
        continue;
      }

      const content = [
        h("p", [item.time_word_jp]),
        h("p", [item.time_word_cn]),
        h.audio(item.href),
      ];

      let bots = ctx.bots.filter(
        (b) =>
          b.platform === target.platform &&
          b.status === Universal.Status.ONLINE,
      );
      if (target.selfId)
        bots = bots.filter((b) => String(b.selfId) === target.selfId);

      if (!bots.length) {
        logger.warn(
          `未找到在线机器人：platform=${target.platform}${target.selfId ? ` selfId=${target.selfId}` : ""}`,
        );
        continue;
      }

      for (const bot of bots) {
        await bot.sendMessage(target.guild, content).catch((err: unknown) => {
          logger.warn(
            `发送失败 bot=${bot.selfId} guild=${target.guild}: ${err}`,
          );
        });
      }
    }
  });
}
