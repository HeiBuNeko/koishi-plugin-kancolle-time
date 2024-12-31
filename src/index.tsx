import { Context, Schema } from "koishi";
import {} from "koishi-plugin-cron";
import fs from "fs";
import path from "path";

export const name = "kancolle-time";
export const inject = ["database", "cron"];

export interface Config {}

export const Config: Schema<Config> = Schema.object({});

declare module "koishi" {
  interface Tables {
    kancolle_time: IKancolleTime;
  }
}

export interface IKancolleTime {
  platform: string;
  guildId: string;
  ship: string;
}

export interface ITimeItem {
  name: string;
  time: string;
  time_word_jp: string;
  time_word_cn: string;
  href: string;
}

export interface IShipItem {
  name: string;
  href: string;
}

export async function apply(ctx: Context) {
  // 可任命的舰娘列表
  const shipList = JSON.parse(
    fs.readFileSync(path.join(__dirname, "ship_list.json"), "utf-8")
  ) as IShipItem[];
  const shipNameList = shipList.map((item) => item.name);

  ctx.model.extend(
    "kancolle_time",
    {
      platform: "string",
      guildId: "string",
      ship: "string",
    },
    {
      primary: ["platform", "guildId"],
    }
  );

  ctx
    .command("kancolle-time.ship <ship>", "指定舰娘报时")
    .example("kancolle-time ship 长门")
    .action(async ({ session }, ship) => {
      const { platform } = session.event;
      const { id: guildId } = session.event.guild;
      if (!ship) {
        return "请补充舰娘名称，例如：kancolle-time ship 长门";
      }
      if (shipNameList.includes(ship)) {
        await ctx.database.upsert("kancolle_time", [
          {
            platform,
            guildId,
            ship,
          },
        ]);
        return `舰娘报时已开启-${ship}`;
      } else {
        return "舰娘名称有误或该舰娘不存在报时语音";
      }
    });

  ctx
    .command("kancolle-time.off", "关闭舰娘报时")
    .action(async ({ session }) => {
      const { platform } = session.event;
      const { id: guildId } = session.event.guild;
      try {
        await ctx.database.remove("kancolle_time", {
          platform,
          guildId,
        });
        return "舰娘报时已关闭";
      } catch (error) {
        return "舰娘报时不存在";
      }
    });

  ctx.cron("0 * * * *", async () => {
    // 读取报时
    const timeList = JSON.parse(
      fs.readFileSync(path.join(__dirname, `time_list.json`), "utf-8")
    ) as ITimeItem[];

    const bcRows = await ctx.database.get("kancolle_time", {});
    bcRows.forEach(async (row) => {
      const guildTimeList = timeList.filter((item) => item.name === row.ship);

      // 当前小时
      const date = new Date();
      const hour = date.getHours();

      // 发送广播
      await ctx.broadcast(
        [`${row.platform}:${row.guildId}`],
        <>
          <p>{guildTimeList[hour].time_word_jp}</p>
          <p>{guildTimeList[hour].time_word_cn}</p>
          <audio src={guildTimeList[hour].href} />
        </>
      );
    });
  });
}
