/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 实时行情与 K 线查询模块
 *
 * @module quote
 *
 * @example
 *   npm run quote -- 700.HK                    # 查腾讯
 *   npm run quote -- 700.HK 9988.HK            # 批量查询
 *   npm run quote -- 700.HK --period 1W       # 周 K 线
 *   npm run quote -- --help                    # 查看帮助
 */

import { LongbridgeClient } from "../client.js";
import { configFromEnv } from "../env.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface QuoteArgs {
  /** 股票代码列表 */
  symbols: string[];
  /** K 线周期 */
  period: string;
  /** K 线条数 */
  count: number;
  /** 代理地址 */
  proxy?: string;
  /** 是否显示原始 JSON */
  raw: boolean;
}

/** K 线数据 */
interface CandlestickData {
  close: string;
  open: string;
  high: string;
  low: string;
  volume: number;
  turnover: string;
  timestamp: string;
  trade_session?: string;
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

/** 支持的 K 线周期 */
const PERIOD_MAP: Record<string, string> = {
  "1m": "1M",
  "5m": "5M",
  "15m": "15M",
  "30m": "30M",
  "1h": "60M",
  "1d": "1D",
  "1w": "1W",
  "1M": "1M", // 月线
};

/**
 * 解析命令行参数
 */
function parseArgs(argv: string[]): QuoteArgs {
  const args: QuoteArgs = {
    symbols: [],
    period: "1D",
    count: 30,
    raw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--") continue; // npm run quote -- 后的分隔符

    switch (argv[i]) {
      case "--period":
      case "-p":
        args.period = PERIOD_MAP[argv[++i]?.toLowerCase()] ?? "1D";
        break;
      case "--count":
      case "-n":
        args.count = Number.parseInt(argv[++i] ?? "30", 10);
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
      default:
        if (!argv[i].startsWith("-")) {
          args.symbols.push(argv[i]);
        }
    }
  }

  return args;
}

/**
 * 打印使用说明
 */
function printUsage(): void {
  console.log(`
用法: npm run quote -- <股票代码...> [选项]

参数:
  股票代码      要查询的股票代码，多个用空格分隔
                (如 700.HK 9988.HK AAPL.US)

选项:
  -p, --period <周期>  K 线周期 (1m/5m/15m/30m/1h/1d/1w/1M) [默认: 1d]
  -n, --count <数量>   返回 K 线条数 [默认: 30]
  --proxy <地址>       通过代理连接
  -r, --raw            显示原始 JSON
  -h, --help           显示此帮助

示例:
  npm run quote -- 700.HK
  npm run quote -- 700.HK 9988.HK
  npm run quote -- 700.HK --period 1W --count 52
`);
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

/**
 * 格式化 K 线为表格行
 */
function formatCandlestick(k: CandlestickData, index: number): string {
  const change = ((Number(k.close) - Number(k.open)) / Number(k.open) * 100).toFixed(2);
  const changeSign = Number(change) >= 0 ? "+" : "";

  return [
    `#${(index + 1).toString().padStart(2)}`,
    new Date(k.timestamp).toLocaleDateString("zh-CN"),
    `O:${k.open.padStart(8)}`,
    `H:${k.high.padStart(8)}`,
    `L:${k.low.padStart(8)}`,
    `C:${k.close.padStart(8)}`,
    `Vol:${(k.volume / 10000).toFixed(1).padStart(8)}万股`,
    `${changeSign}${change}%`,
  ].join("  ");
}

// ---------------------------------------------------------------------------
// 主逻辑
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.symbols.length === 0) {
    console.error("❌ 请指定至少一个股票代码");
    printUsage();
    process.exit(1);
  }

  const envConfig = configFromEnv();
  const client = new LongbridgeClient({
    ...envConfig,
    proxy: args.proxy ?? envConfig.proxy,
  });

  for (const symbol of args.symbols) {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  ${symbol}`);
    console.log(`═══════════════════════════════════════════`);

    // 实时行情
    console.log(`\n  📊 实时行情\n`);

    try {
      const quoteRes = await client.getQuote(symbol);
      const quote = quoteRes.data as Record<string, unknown>;

      if (args.raw) {
        console.log(JSON.stringify(quote, null, 2));
      } else {
        console.log(`  最新价:   ${(quote.lastDone as string) ?? "-"}`);
        console.log(`  涨跌幅:   ${(quote.changeRate as string) ?? "-"}`);
        console.log(`  最高:     ${(quote.high as string) ?? "-"}`);
        console.log(`  最低:     ${(quote.low as string) ?? "-"}`);
        console.log(`  开盘:     ${(quote.open as string) ?? "-"}`);
        console.log(`  昨收:     ${(quote.prevClose as string) ?? "-"}`);
        console.log(`  成交量:   ${(quote.volume as string) ?? "-"}`);
        console.log(`  成交额:   ${(quote.turnover as string) ?? "-"}`);
      }
    } catch (error) {
      console.error(`  ❌ 获取行情失败:`, (error as Error).message);
    }

    // K 线数据
    console.log(`\n  📈 K 线数据 (${args.period})\n`);

    try {
      const klineRes = await client.getCandlesticks(symbol, args.period, args.count);
      const klines = klineRes.data as CandlestickData[];

      if (args.raw) {
        console.log(JSON.stringify(klines, null, 2));
      } else if (!klines || klines.length === 0) {
        console.log("  (暂无数据)");
      } else {
        for (const [i, k] of klines.entries()) {
          console.log(`  ${formatCandlestick(k, i)}`);

          // 表格太长时只显示前 10 和后 10 条
          if (klines.length > 20 && i === 9) {
            console.log(`  ... (共 ${klines.length} 条)`);
            // 跳到倒数 10 条
            const remaining = klines.slice(-10);
            for (const [ri, rk] of remaining.entries()) {
              console.log(`  ${formatCandlestick(rk, klines.length - 10 + ri)}`);
            }
            break;
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ 获取 K 线失败:`, (error as Error).message);
    }

    console.log();
  }
}

main().catch((err) => {
  console.error("❌ 程序异常退出:", err);
  process.exit(1);
});
