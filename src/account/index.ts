/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 账户资产与持仓查询模块
 *
 * @module account
 *
 * @example
 *   npm run account                         # 查询所有
 *   npm run account -- --currency USD       # 指定货币
 *   npm run account -- --proxy http://127.0.0.1:7890  # 走代理
 */

import { LongbridgeClient } from "../client.js";
import { configFromEnv } from "../env.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface AccountArgs {
  /** 货币类型 */
  currency: string;
  /** 代理地址 */
  proxy?: string;
  /** 是否显示原始 JSON */
  raw: boolean;
}

// ---------------------------------------------------------------------------
// 命令行参数解析
// ---------------------------------------------------------------------------

/**
 * 解析命令行参数
 */
function parseArgs(argv: string[]): AccountArgs {
  const args: AccountArgs = {
    currency: "HKD",
    raw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--currency":
      case "-c":
        args.currency = argv[++i] ?? "HKD";
        break;
      case "--proxy":
        args.proxy = argv[++i];
        break;
      case "--raw":
      case "-r":
        args.raw = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  return args;
}

/**
 * 打印使用说明
 */
function printUsage(): void {
  console.log(`
用法: npm run account -- [选项]

选项:
  -c, --currency <货币>  指定货币类型 (HKD / USD / CNY)  [默认: HKD]
  --proxy <地址>         通过代理连接 (如 http://127.0.0.1:7890)
  -r, --raw              显示原始 JSON 响应
  -h, --help             显示此帮助
`);
}

// ---------------------------------------------------------------------------
// 格式化输出
// ---------------------------------------------------------------------------

/**
 * 格式化金额（带千分位分隔）
 */
function formatMoney(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 格式化百分比
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * 格式化日期时间
 */
function formatDate(timestamp: string | number): string {
  const date = new Date(typeof timestamp === "string" ? Number(timestamp) * 1000 : timestamp);
  return date.toLocaleString("zh-CN");
}

// ---------------------------------------------------------------------------
// 主逻辑
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // 构建客户端
  const envConfig = configFromEnv();
  const client = new LongbridgeClient({
    ...envConfig,
    proxy: args.proxy ?? envConfig.proxy,
  });

  // 查询账户资产
  console.log("\n═══════════════════════════════════════════");
  console.log("             账户资产总览");
  console.log("═══════════════════════════════════════════\n");

  try {
    const assetsRes = await client.getAssets();
    const assets = assetsRes.data as Record<string, unknown>;
    const cashInfos = (assets.cashInfos as Array<Record<string, unknown>>) ?? [];

    if (args.raw) {
      console.log(JSON.stringify(assets, null, 2));
    } else {
      console.log(`  总现金:       HK$ ${formatMoney(assets.totalCash as string)}`);
      console.log(`  净资产:       HK$ ${formatMoney(assets.netAssets as string)}`);
      console.log(`  购买力:       HK$ ${formatMoney(assets.buyPower as string)}`);
      console.log(`  最大融资:     HK$ ${formatMoney(assets.maxFinanceAmount as string)}`);
      console.log(`  风险水平:     ${assets.riskLevel as number}`);
      console.log(`  保证金:       ${(assets.marginCall as number) > 0 ? "⚠️ 已触发" : "✅ 正常"}`);
      console.log();

      if (cashInfos.length > 0) {
        console.log("  ── 现金明细 ──");
        for (const cash of cashInfos) {
          console.log(`    ${cash.currency as string}: 可提 ${formatMoney(cash.withdrawCash as string)}  |  可用 ${formatMoney(cash.availableCash as string)}  |  冻结 ${formatMoney(cash.frozenCash as string)}`);
        }
      }
    }
  } catch (error) {
    console.error("  ❌ 获取资产失败:", (error as Error).message);
  }

  // 查询持仓
  console.log("\n───────────────────────────────────────────");
  console.log("             持仓明细");
  console.log("───────────────────────────────────────────\n");

  try {
    const positionsRes = await client.getPositions(args.currency);
    const positions = positionsRes.data as Array<Record<string, unknown>>;

    if (args.raw) {
      console.log(JSON.stringify(positions, null, 2));
    } else if (!positions || positions.length === 0) {
      console.log("  (暂无持仓)");
    } else {
      const header = `  ${"代码".padEnd(12)} ${"名称".padEnd(14)} ${"持仓".padEnd(8)} ${"成本".padEnd(12)} ${"现价".padEnd(12)} ${"盈亏".padEnd(14)} ${"市值".padEnd(14)}`;
      const separator = "  " + "─".repeat(86);

      console.log(header);
      console.log(separator);

      for (const pos of positions) {
        const symbol = (pos.symbol as string) ?? "-";
        const name = ((pos.symbolName as string) ?? symbol).padEnd(14);
        const quantity = String(pos.quantity ?? 0);
        const costPrice = formatMoney(pos.costPrice as string);
        const currentPrice = formatMoney(pos.currentPrice as string);
        const unrealizedPnl = pos.unrealizedPnl as string;
        const marketValue = formatMoney(pos.marketValue as string);
        const pnlDisplay =
          Number(unrealizedPnl) >= 0
            ? `+${formatMoney(unrealizedPnl)}`
            : formatMoney(unrealizedPnl);

        console.log(
          `  ${symbol.padEnd(12)} ${name.slice(0, 14)} ${quantity.padStart(6)}  ${costPrice.padStart(10)}  ${currentPrice.padStart(10)}  ${pnlDisplay.padStart(12)}  ${marketValue.padStart(12)}`
        );
      }
    }
  } catch (error) {
    console.error("  ❌ 获取持仓失败:", (error as Error).message);
  }

  // 查询自选股
  console.log("\n───────────────────────────────────────────");
  console.log("             自选股");
  console.log("───────────────────────────────────────────\n");

  try {
    const watchlistRes = await client.getWatchlist();
    const watchlist = watchlistRes.data as Array<Record<string, unknown>>;

    if (args.raw) {
      console.log(JSON.stringify(watchlist, null, 2));
    } else if (!watchlist || watchlist.length === 0) {
      console.log("  (自选股列表为空)");
    } else {
      console.log("  " + watchlist.map((item) => `${item.symbol as string}`).join("  "));
    }
  } catch (error) {
    console.error("  ❌ 获取自选股失败:", (error as Error).message);
  }

  console.log("\n═══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ 程序异常退出:", err);
  process.exit(1);
});
