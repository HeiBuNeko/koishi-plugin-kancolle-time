import { Context, h, Schema } from "koishi";
import {} from "koishi-plugin-cron";
import timeListJson from "./time_list.json";

export const name = "kancolle-time";
export const inject = ["cron", "database"];

const DIGITS = "〇一二三四五六七八九";

export interface TimeTarget {
  ship: string;
  platform: string;
  channelId: string;
}

export interface Config {
  targets: TimeTarget[];
}

interface TimeItem {
  name: string;
  time: string;
  time_word_jp: string;
  time_word_cn: string;
  href: string;
}

const timeList = timeListJson as TimeItem[];

const shipNames = [...new Set(timeList.map((i) => i.name))];

const ShipSchema = Schema.union(
  shipNames.map((name) => Schema.const(name)),
) as Schema<string>;

const TargetSchema: Schema<TimeTarget> = Schema.object({
  ship: ShipSchema.description("舰娘"),
  platform: Schema.string().description("平台名"),
  channelId: Schema.string().description("频道 ID"),
});

export const Config: Schema<Config> = Schema.object({
  targets: Schema.array(TargetSchema)
    .description("整点报时：每条对应该频道使用指定舰娘语音与台词")
    .default([]),
});

const hourToTimeLabel = (hour: number): string => {
  const tens = Math.floor(hour / 10);
  const ones = hour % 10;
  return `${DIGITS[tens]}${DIGITS[ones]}〇〇时报`;
};

export const apply = (ctx: Context, config: Config) => {
  const logger = ctx.logger("kancolle-time");

  ctx.cron("0 * * * *", async () => {
    const hour = new Date().getHours();
    const label = hourToTimeLabel(hour);

    for (const target of config.targets) {
      const byShip = timeList.filter((i) => i.name === target.ship);
      const item = byShip.find((i) => i.time === label);
      if (!item) {
        logger.warn(`未找到报时条目: ${target.ship} ${label}`);
        continue;
      }

      const content = [
        h("p", [item.time_word_jp]),
        h("p", [item.time_word_cn]),
        h.audio(item.href),
      ];

      const channel = `${target.platform}:${target.channelId}`;
      await ctx.broadcast([channel], content).catch((err) => {
        logger.warn(`广播失败 ${channel}: ${err}`);
      });
    }
  });
};
