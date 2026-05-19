/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 订单管理模块 —— 查单 / 下单 / 撤单
 *
 * @module order
 *
 * @example
 *   npm run order              # 交互式菜单
 *   npm run order -- list      # 查看订单列表
 *   npm run order -- buy 700.HK 100 380   # 限价买入
 *   npm run order -- cancel <order-id>    # 撤单
 */

import { LongbridgeClient } from "../client.js";
import { configFromEnv } from "../env.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface OrderArgs {
  /** 操作 */
  action: string;
  /** 参数列表 */
  params: string[];
  /** 代理地址 */
  proxy?: string;
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

const ACTIONS = ["list", "detail", "buy", "sell", "cancel"] as const;

function parseArgs(argv: string[]): OrderArgs {
  const args: OrderArgs = { action: "", params: [], proxy: undefined };

  let proxyIdx = argv.indexOf("--proxy");
  if (proxyIdx !== -1) {
    args.proxy = argv[proxyIdx + 1];
    argv.splice(proxyIdx, 2);
  }

  // 第一个非 - 参数是 action
  for (const arg of argv) {
    if (!arg.startsWith("-") && ACTIONS.includes(arg as typeof ACTIONS[number])) {
      args.action = arg;
      break;
    }
  }

  // 剩余参数
  const actionIdx = argv.indexOf(args.action);
  if (actionIdx !== -1) {
    args.params = argv.slice(actionIdx + 1);
  }

  return args;
}

function printUsage(): void {
  console.log(`
用法: npm run order -- <操作> [参数...]

操作:
  list                       查看订单列表
  detail <order-id>          查看订单详情
  buy <代码> <数量> <价格>    限价买入
  sell <代码> <数量> <价格>   限价卖出
  cancel <order-id>          撤销订单

示例:
  npm run order -- list
  npm run order -- buy 700.HK 100 380
  npm run order -- sell 700.HK 100 400
  npm run order -- cancel 123456789
`);
}

// ---------------------------------------------------------------------------
// 主逻辑
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.action) {
    printUsage();
    return interactiveConsole();
  }

  const envConfig = configFromEnv();
  const client = new LongbridgeClient({
    ...envConfig,
    proxy: args.proxy ?? envConfig.proxy,
  });

  switch (args.action) {
    // 订单列表
    case "list": {
      console.log("\n═══ 订单列表 ═══\n");
      const res = await client.getOrders();
      console.log(JSON.stringify(res.data, null, 2));
      break;
    }

    // 订单详情
    case "detail": {
      const orderId = args.params[0];
      if (!orderId) throw new Error("用法: order detail <order-id>");

      console.log(`\n═══ 订单详情 (${orderId}) ═══\n`);
      const res = await client.getOrderDetail(orderId);
      console.log(JSON.stringify(res.data, null, 2));
      break;
    }

    // 买入
    case "buy":
    case "sell": {
      const [symbol, quantity, price] = args.params;
      if (!symbol || !quantity || !price) {
        throw new Error(`用法: order ${args.action} <代码> <数量> <价格>`);
      }

      const order = {
        symbol,
        side: args.action === "buy" ? "Buy" : "Sell",
        order_type: "LO",
        price: String(price),
        quantity: String(quantity),
        time_in_force: "Day",
      };

      console.log(`\n═══ 提交 ${args.action === "buy" ? "买入" : "卖出"}订单 ═══\n`);
      console.log(`  代码:     ${order.symbol}`);
      console.log(`  方向:     ${order.side}`);
      console.log(`  数量:     ${order.quantity}`);
      console.log(`  价格:     ${order.price}`);
      console.log(`  类型:     限价单 (Day)`);
      console.log();

      const res = await client.placeOrder(order);
      console.log("  ✅ 订单提交成功");
      console.log(`  响应: ${JSON.stringify(res.data, null, 2)}`);
      break;
    }

    // 撤单
    case "cancel": {
      const orderId = args.params[0];
      if (!orderId) throw new Error("用法: order cancel <order-id>");

      console.log(`\n═══ 撤销订单 ═══\n`);
      const res = await client.cancelOrder(orderId);
      console.log(`  ✅ 撤销成功: ${orderId}`);
      break;
    }

    default:
      printUsage();
  }
}

/**
 * 交互式订单控制台（简易版）
 *
 * 用户直接在终端输入命令
 */
async function interactiveConsole(): Promise<void> {
  const envConfig = configFromEnv();
  const client = new LongbridgeClient({
    ...envConfig,
  });

  console.log(`
╔══════════════════════════════════════╗
║   长桥 订单控制台                      ║
║                                      ║
║   输入 help 查看命令                   ║
║   输入 exit 或 Ctrl+C 退出            ║
╚══════════════════════════════════════╝
`);

  // 简易交互 - 从 stdin 读取
  for await (const line of consoleLines()) {
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case "help":
        printUsage();
        break;
      case "exit":
      case "quit":
        console.log("👋 再见");
        process.exit(0);
      case "list": {
        const res = await client.getOrders();
        console.log(JSON.stringify(res.data, null, 2));
        break;
      }
      default:
        console.log(`未知命令: ${cmd}（输入 help 查看帮助）`);
    }
  }
}

/**
 * 从 stdin 读取行（AsyncIterator）
 */
async function* consoleLines(): AsyncGenerator<string> {
  process.stdin.setEncoding("utf-8");

  let buffer = "";
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      yield line;
    }
  }

  if (buffer) yield buffer;
}

main().catch((err) => {
  console.error("❌ 操作失败:", (err as Error).message);
  process.exit(1);
});
