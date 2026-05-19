/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 简易交易控制台 —— 整合账户、行情、下单的交互式界面
 *
 * @module trade/console
 *
 * @example
 *   npm run trade
 */

import { LongbridgeClient } from "../client.js";
import { configFromEnv } from "../env.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main(): Promise<void> {
  const envConfig = configFromEnv();
  const client = new LongbridgeClient(envConfig);

  const rl = createInterface({ input, output });

  console.log(`
╔══════════════════════════════════════════════╗
║          长桥 简易交易控制台                  ║
║                                              ║
║  可用命令:                                    ║
║    assets         查看资产和持仓               ║
║    quote <代码>    查询行情                    ║
║    kline <代码>    查看 K 线                   ║
║    buy <代码> <量> <价>  买入                  ║
║    sell <代码> <量> <价> 卖出                  ║
║    orders         查看订单                    ║
║    watchlist      自选股                      ║
║    help           帮助                        ║
║    exit           退出                        ║
╚══════════════════════════════════════════════╝
`);

  while (true) {
    const line = await rl.question("> ");
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case "":
          continue;

        case "exit":
        case "quit":
          console.log("👋 再见");
          return;

        case "help":
          console.log(`
  命令:
    assets                       查看资产与持仓
    quote <代码>                  实时行情
    kline <代码> [周期] [数量]      K 线数据
    buy <代码> <量> <价>           限价买入
    sell <代码> <量> <价>          限价卖出
    orders                       查看订单
    cancel <order-id>            撤销订单
    watchlist                    自选股
    help                         帮助
    exit                         退出
`);
          break;

        case "assets": {
          const assets = await client.getAssets();
          console.log("资产:", JSON.stringify(assets.data, null, 2));
          const positions = await client.getPositions();
          console.log("持仓:", JSON.stringify(positions.data, null, 2));
          break;
        }

        case "quote": {
          if (!args[0]) throw new Error("需要股票代码");
          const res = await client.getQuote(args[0]);
          const q = res.data as Record<string, unknown>;
          console.log(`\n  ${args[0]}: 最新 ${q.lastDone}  涨跌 ${q.changeRate}`);
          break;
        }

        case "kline": {
          if (!args[0]) throw new Error("需要股票代码");
          const period = args[1] ?? "1D";
          const count = Number(args[2] ?? 10);
          const res = await client.getCandlesticks(args[0], period, count);
          const klines = res.data as Array<Record<string, string>>;
          for (const k of klines ?? []) {
            console.log(`  ${k.timestamp?.slice(0, 10)}  O:${k.open}  H:${k.high}  L:${k.low}  C:${k.close}  Vol:${k.volume}`);
          }
          break;
        }

        case "buy":
        case "sell": {
          const [symbol, qty, price] = args;
          if (!symbol || !qty || !price) throw new Error("用法: buy <代码> <数量> <价格>");
          const order = {
            symbol,
            side: cmd === "buy" ? "Buy" : "Sell",
            order_type: "LO",
            price: String(price),
            quantity: String(qty),
            time_in_force: "Day",
          };
          console.log("提交订单:", order);
          const res = await client.placeOrder(order);
          console.log("✅ 成功:", JSON.stringify(res.data));
          break;
        }

        case "orders": {
          const res = await client.getOrders();
          console.log(JSON.stringify(res.data, null, 2));
          break;
        }

        case "cancel": {
          if (!args[0]) throw new Error("需要 order-id");
          await client.cancelOrder(args[0]);
          console.log("✅ 撤销成功");
          break;
        }

        case "watchlist": {
          const res = await client.getWatchlist();
          const list = res.data as Array<Record<string, string>>;
          for (const item of list ?? []) {
            console.log(`  ${item.symbol}  ${item.symbol_name ?? ""}`);
          }
          break;
        }

        default:
          console.log(`❌ 未知命令: ${cmd}（输入 help 查看帮助）`);
      }
    } catch (error: unknown) {
      console.error("❌ 错误:", (error as Error).message);
    }
  }
}

main().catch((err) => {
  console.error("❌ 程序异常退出:", err);
  process.exit(1);
});
