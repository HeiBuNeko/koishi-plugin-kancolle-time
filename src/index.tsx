import { Bot, Context, Random, Schema } from "koishi";
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

interface IKancolleTime {
  platform: string;
  guildId: string;
  ship: string;
  random: boolean;
}

interface ITimeItem {
  name: string;
  time: string;
  time_word_jp: string;
  time_word_cn: string;
  href: string;
}

const CNSwitch = (status: boolean) => (status ? "开启" : "关闭");

export async function apply(ctx: Context) {
  // 读取报时列表
  const timeList = JSON.parse(
    fs.readFileSync(path.join(__dirname, `time_list.json`), "utf-8")
  ) as ITimeItem[];

  // 可任命的舰娘列表
  const shipNameList = new Set(timeList.map((item) => item.name));

  ctx.model.extend(
    "kancolle_time",
    {
      platform: "string",
      guildId: "string",
      ship: {
        type: "string",
        initial: "长门",
      },
      random: {
        type: "boolean",
        initial: false,
      },
    },
    {
      primary: ["platform", "guildId"],
    }
  );

  ctx.command("kancolle-time", "舰娘报时");

  ctx
    .command("kancolle-time.status", "当前群组舰娘报时状态")
    .action(async ({ session }) => {
      const { platform } = session.event;
      const { id: guildId } = session.event.guild;
      const ktRows = await ctx.database.get("kancolle_time", {
        platform,
        guildId,
      });
      return ktRows.length
        ? `报时舰娘：${ktRows[0].ship} 每日随机：${CNSwitch(ktRows[0].random)}`
        : "当前群组未开启舰娘报时";
    });

  ctx
    .command("kancolle-time.random", "每日随机舰娘报时")
    .action(async ({ session }) => {
      const { platform } = session.event;
      const { id: guildId } = session.event.guild;

      const ktRows = await ctx.database.get("kancolle_time", {
        platform,
        guildId,
      });
      const random = ktRows.length ? !ktRows[0].random : true;
      await ctx.database.upsert("kancolle_time", [
        {
          platform,
          guildId,
          random,
        },
      ]);
      return `每日随机已${CNSwitch(random)}`;
    });

  ctx
    .command("kancolle-time.ship <ship>", "指定舰娘报时")
    .example("kancolle-time ship 长门")
    .action(async ({ session }, ship) => {
      if (!ship) {
        return `请填写舰娘名称或"random"\n使用示例：kancolle-time ship 长门`;
      }

      const { platform } = session.event;
      const { id: guildId } = session.event.guild;

      if (shipNameList.has(ship)) {
        // 指定舰娘
        await ctx.database.upsert("kancolle_time", [
          { platform, guildId, ship },
        ]);
        return `指定舰娘报时-${ship}`;
      }
      if (ship === "random") {
        // 随机舰娘
        const randomShip = Random.pick([...shipNameList]);
        await ctx.database.upsert("kancolle_time", [
          { platform, guildId, ship },
        ]);
        return `随机舰娘报时-${randomShip}`;
      }
      return "舰娘名称有误或Wiki不存在报时语音";
    });

  ctx
    .command("kancolle-time.off", "关闭舰娘报时")
    .action(async ({ session }) => {
      const { platform } = session.event;
      const { id: guildId } = session.event.guild;
      await ctx.database.remove("kancolle_time", {
        platform,
        guildId,
      });
      return "舰娘报时已关闭";
    });

  ctx.cron("0 * * * *", async () => {
    const ktRows = await ctx.database.get("kancolle_time", {});
    const hour = new Date().getHours();

    // 0点随机舰娘名称
    if (hour === 0) {
      const newRows = ktRows.map((row) => ({
        ...row,
        ship: row.random ? Random.pick([...shipNameList]) : row.ship,
      }));
      await ctx.database.upsert("kancolle_time", newRows);
    }

    // 发送广播
    setTimeout(async () => {
      ktRows.forEach(async (row) => {
        const guildTimeList = timeList.filter((item) => item.name === row.ship);
        await ctx.broadcast(
          [`${row.platform}:${row.guildId}`],
          <>
            <p>{guildTimeList[hour].time_word_jp}</p>
            <p>{guildTimeList[hour].time_word_cn}</p>
            <audio src={guildTimeList[hour].href} />
          </>
        );
      });
    }, 0);
  });
}
