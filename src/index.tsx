import { $, Context, Random, Schema } from "koishi";
import {} from "koishi-plugin-cron";
import timeListJson from "./time_list.json";

declare module "koishi" {
  interface Tables {
    kancolle_time: {
      enabled: boolean;
      platform: string;
      channelId: string;
      random: boolean;
      ship: string;
    };
  }
}

type TimeTarget = {
  enabled: boolean;
  platform: string;
  channelId: string;
  random: boolean;
  ship: string;
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

/** 将小时转换为报时时间 */
const hourToReportTime = (hour: number): string => {
  const tens = Math.floor(hour / 10);
  const ones = hour % 10;
  return `${CN_HOUR_DIGITS[tens]}${CN_HOUR_DIGITS[ones]}〇〇时报`;
};

/** 将数字转换为全角数字 */
const toFullWidthDigits = (str: string): string =>
  str.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));

const shipNames = [...new Set(timeList.map((i) => i.ship_name))];

const TargetSchema: Schema<TimeTarget> = Schema.intersect([
  Schema.object({
    enabled: Schema.boolean().default(true).description("是否启用"),
    platform: Schema.string().description("平台名").required(),
    channelId: Schema.string().description("频道 ID").required(),
    random: Schema.boolean().default(false).description("每日随机舰娘"),
  }),
  Schema.union([
    Schema.object({
      random: Schema.const(false),
      ship: Schema.union(shipNames).description("舰娘").required(),
    }),
    Schema.object({
      random: Schema.const(true),
      ship: Schema.union(shipNames).description("舰娘"),
    }),
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
      enabled: {
        type: "boolean",
        initial: true,
      },
      platform: "string",
      channelId: "string",
      random: {
        type: "boolean",
        initial: false,
      },
      ship: {
        type: "string",
        initial: Random.pick(shipNames),
      },
    },
    {
      primary: ["platform", "channelId"],
    },
  );

  /** 从数据库同步配置 */
  const syncScope = async () => {
    const targets = await ctx.database.get("kancolle_time", {});
    ctx.scope.update({ targets });
  };

  // 同步配置到数据库
  const configKeys = new Set(
    config.targets.map((target) => `${target.platform}:${target.channelId}`),
  );
  const existing = await ctx.database.get("kancolle_time", {});
  const removed = existing.filter(
    (target) => !configKeys.has(`${target.platform}:${target.channelId}`),
  );
  if (removed.length) {
    await ctx.database.remove("kancolle_time", {
      $or: removed.map(({ platform, channelId }) => ({ platform, channelId })),
    });
  }
  await ctx.database.upsert("kancolle_time", config.targets);
  // 从数据库同步配置
  await syncScope();

  // 整点报时
  ctx.cron("0 * * * *", async () => {
    try {
      // 偏移 1 分钟，避免整点偏差
      const hour = new Date(Date.now() + 60_000).getHours();
      const reportTime = hourToReportTime(hour);
      const targets = await ctx.database.get("kancolle_time", {
        enabled: true,
      });
      for (const target of targets) {
        const shipTimeList = timeList.filter(
          (i) => i.ship_name === target.ship,
        );
        const item = shipTimeList.find((i) => i.time_label === reportTime);
        if (!item) {
          logger.warn(
            `「舰娘报时」未找到报时条目 舰娘「${target.ship}」 时间「${reportTime}」`,
          );
          continue;
        }

        const content = [
          <p>{item.voice_line_ja}</p>,
          <p>{item.voice_line_zh}</p>,
          <audio src={item.audio_url} />,
        ];

        const channel = `${target.platform}:${target.channelId}`;
        try {
          await ctx.broadcast([channel], content);
        } catch (error) {
          logger.warn(`「舰娘报时」发送失败 ${channel}: ${error}`);
        }
      }
    } catch (error) {
      logger.error("「舰娘报时」整点报时失败", error);
    }
  });

  // 更换舰娘
  ctx.cron("59 23 * * *", async () => {
    try {
      const randomTargets = await ctx.database.get("kancolle_time", {
        enabled: true,
        random: true,
      });
      await ctx.database.upsert(
        "kancolle_time",
        randomTargets.map(({ platform, channelId }) => ({
          platform,
          channelId,
          ship: Random.pick(shipNames),
        })),
      );
      logger.info(
        `「舰娘报时」更换舰娘成功 共更换 ${randomTargets.length} 个舰娘`,
      );
      await syncScope();
    } catch (error) {
      logger.error("「舰娘报时」更换舰娘失败", error);
    }
  });

  // 查询报时信息
  ctx.command("kancolle-time.info", "报时信息").action(async ({ session }) => {
    const targets = await ctx.database.get("kancolle_time", {
      platform: session.platform,
      channelId: session.channelId,
    });
    return `「舰娘报时」${targets[0]?.enabled ? "已开启" : "已关闭"} 当前舰娘: ${targets[0]?.ship ?? "未设置"} 每日随机: ${targets[0]?.random ? "是" : "否"} `;
  });

  // 查询舰娘列表
  ctx.command("kancolle-time.list", "舰娘列表").action(async () => (
    <message forward>
      <message>
        <p>「舰娘报时」舰娘列表（共 {shipNames.length} 位）</p>
        <p>使用 kancolle-time.ship 舰娘名 设置舰娘</p>
      </message>
      <message>
        {shipNames.map((name, index) => (
          <p>
            {toFullWidthDigits((index + 1).toString().padStart(3, "0"))}「{name}
            」
          </p>
        ))}
      </message>
    </message>
  ));

  // 舰娘报时开关
  ctx
    .command("kancolle-time.on", "开启舰娘报时")
    .action(async ({ session }) => {
      await ctx.database.upsert("kancolle_time", [
        {
          platform: session.platform,
          channelId: session.channelId,
          enabled: true,
        },
      ]);
      await syncScope();
      return "「舰娘报时」已开启舰娘报时";
    });

  // 舰娘报时关闭
  ctx
    .command("kancolle-time.off", "关闭舰娘报时")
    .action(async ({ session }) => {
      await ctx.database.upsert("kancolle_time", [
        {
          platform: session.platform,
          channelId: session.channelId,
          enabled: false,
        },
      ]);
      await syncScope();
      return "「舰娘报时」已关闭舰娘报时";
    });

  // 设置报时舰娘
  ctx
    .command("kancolle-time.ship <ship:text>", "设置舰娘")
    .example("kancolle-time.ship 长门")
    .action(async ({ session }, ship) => {
      if (!shipNames.includes(ship)) {
        return (
          <>
            <p>「舰娘报时」未找到「{ship}」</p>
            <p>请使用完整舰娘名，例如: kancolle-time.ship 长门</p>
            <p>使用 kancolle-time.list 查看全部可选舰娘</p>
          </>
        );
      }

      await ctx.database.upsert("kancolle_time", [
        { platform: session.platform, channelId: session.channelId, ship },
      ]);
      await syncScope();
      return `「舰娘报时」已将舰娘设置为: ${ship}`;
    });

  // 开关每日随机舰娘
  ctx
    .command("kancolle-time.random <random:string>", "每日随机舰娘")
    .example("kancolle-time.random true")
    .action(async ({ session }, random) => {
      await ctx.database.upsert("kancolle_time", [
        {
          platform: session.platform,
          channelId: session.channelId,
          random: random === "true",
        },
      ]);
      await syncScope();
      return random === "true"
        ? "「舰娘报时」已开启每日随机舰娘"
        : "「舰娘报时」已关闭每日随机舰娘";
    });
};
