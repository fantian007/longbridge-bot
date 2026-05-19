/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 自选股查询模块
 *
 * @module watchlist
 *
 * @example
 *   npm run watchlist          # 查看自选股
 *   npm run watchlist -- --raw # 查看原始 JSON
 */

import { LongbridgeClient } from "../client.js";
import { configFromEnv } from "../env.js";

interface WatchlistArgs {
  raw: boolean;
  proxy?: string;
}

function parseArgs(argv: string[]): WatchlistArgs {
  const args: WatchlistArgs = { raw: false };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--raw":
      case "-r":
        args.raw = true;
        break;
      case "--proxy":
        args.proxy = argv[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
用法: npm run watchlist [选项]

选项:
  -r, --raw     显示原始 JSON
  --proxy <地址> 通过代理连接
  -h, --help    显示此帮助
`);
        process.exit(0);
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const envConfig = configFromEnv();
  const client = new LongbridgeClient({
    ...envConfig,
    proxy: args.proxy ?? envConfig.proxy,
  });

  console.log("\n═══ 自选股 ═══\n");

  const res = await client.getWatchlist();
  const data = res.data as Array<Record<string, unknown>>;

  if (args.raw) {
    console.log(JSON.stringify(data, null, 2));
  } else if (!data || data.length === 0) {
    console.log("  (自选股列表为空)");
  } else {
    for (const item of data) {
      const symbol = item.symbol as string;
      const name = (item.symbol_name ?? item.name ?? "-") as string;
      console.log(`  ${symbol.padEnd(14)} ${name}`);
    }
  }

  console.log();
}

main().catch((err) => {
  console.error("❌ 获取失败:", (err as Error).message);
  process.exit(1);
});
