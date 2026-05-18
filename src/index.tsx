import { Context, h, Random, Schema, Time } from "koishi";
import {} from "koishi-plugin-cron";
import timeListJson from "./time_list.json";

declare module "koishi" {
  interface Tables {
    kancolle_time: {
      platform: string;
      channelId: string;
      random: boolean;
      ship: string | null;
    };
  }
}

type TimeTarget = {
  platform: string;
  channelId: string;
  random: boolean;
  ship?: string;
};

type TimeItem = {
  ship_name: string;
  time_label: string;
  audio_url: string;
  voice_line_ja: string;
  voice_line_zh: string;
};

export interface Config {
  targets: TimeTarget[];
}

export const name = "kancolle-time";
export const inject = ["cron", "database"];

const timeList = timeListJson as TimeItem[];

/** 与 time_list.json 中 `time_label` 一致，例如 20 点 → 「二〇〇〇时报」 */
const CN_HOUR_DIGITS = "〇一二三四五六七八九";

function hourToReportTime(hour: number): string {
  const tens = Math.floor(hour / 10);
  const ones = hour % 10;
  return `${CN_HOUR_DIGITS[tens]}${CN_HOUR_DIGITS[ones]}〇〇时报`;
}

const shipNames = [...new Set(timeList.map((i) => i.ship_name))];

const TargetSchema: Schema<TimeTarget> = Schema.intersect([
  Schema.object({
    platform: Schema.string().description("平台名").required(),
    channelId: Schema.string().description("频道 ID").required(),
    random: Schema.boolean().default(true).description("每日随机舰娘"),
  }),
  Schema.union([
    Schema.object({
      random: Schema.const(false).required(),
      ship: Schema.union(shipNames).description("舰娘").required(),
    }),
    Schema.object({ random: Schema.const(true) }),
  ]),
]);

export const Config: Schema<Config> = Schema.object({
  targets: Schema.array(TargetSchema).description("舰娘报时").default([]),
});

export const apply = async (ctx: Context, config: Config) => {
  const logger = ctx.logger("kancolle-time");

  // 定义数据库表
  ctx.model.extend(
    "kancolle_time",
    {
      platform: "string",
      channelId: "string",
      random: "boolean",
      ship: "string",
    },
    {
      primary: ["platform", "channelId"],
    },
  );

  // 同步配置到数据库
  const rows = config.targets.map((t) => ({
    platform: t.platform,
    channelId: t.channelId,
    random: t.random,
    ship: t.random ? Random.pick(shipNames) : t.ship,
  }));
  await ctx.database.remove("kancolle_time", {});
  await ctx.database.upsert("kancolle_time", rows);

  // 整点报时
  ctx.cron("0 * * * *", async () => {
    // 偏移 1 分钟，避免整点偏差
    const hour = new Date(Date.now() + 60_000).getHours();
    const targets = await ctx.database.get("kancolle_time", {});
    targets.forEach((target) => {
      const shipTimeList = timeList.filter((i) => i.ship_name === target.ship);
      const reportTime = hourToReportTime(hour);
      const item = shipTimeList.find((i) => i.time_label === reportTime);
      if (!item) {
        logger.warn(`未找到报时条目：舰娘=${target.ship} time=${reportTime}`);
        return;
      }

      const content = [
        h("p", [item.voice_line_ja]),
        h("p", [item.voice_line_zh]),
        h.audio(item.audio_url),
      ];

      const channel = `${target.platform}:${target.channelId}`;
      ctx.broadcast([channel], content).catch((err) => {
        logger.warn(`发送失败 ${channel}: ${err}`);
      });
    });
  });

  // 更换舰娘
  ctx.cron("59 23 * * *", () => {
    ctx.database.get("kancolle_time", {}).then((targets) => {
      targets.forEach(({ platform, channelId, random }) => {
        if (!random) return;
        ctx.database.set(
          "kancolle_time",
          { platform, channelId },
          { ship: Random.pick(shipNames) },
        );
      });
    });
  });
};
