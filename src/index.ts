/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 主入口 —— 显示使用帮助和可用命令
 *
 * @module index
 *
 * @example
 *   npm run dev          # 显示帮助菜单
 *   npm run account      # 查询账户
 *   npm run quote        # 查询行情（需额外参数）
 */

import { printConfigSummary } from "./env.js";

// ---------------------------------------------------------------------------
// 版本信息
// ---------------------------------------------------------------------------

/** 项目版本 */
const VERSION = "1.0.0";

/** 项目仓库地址 */
const REPO_URL = "https://github.com/fantian007/longbridge-bot";

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 显示使用帮助
 */
function printHelp(): void {
  const title = "长桥 Longbridge OpenAPI 投资助手";

  const commands = [
    { cmd: "npm run account", desc: "查询账户资产与持仓" },
    { cmd: "npm run quote <code>", desc: "查询实时行情与 K 线" },
    { cmd: "npm run order", desc: "订单管理（交互式）" },
    { cmd: "npm run watchlist", desc: "查看自选股列表" },
    { cmd: "npm run trade", desc: "简易交易控制台" },
  ];

  const examples = [
    { desc: "查询腾讯控股行情", cmd: "npm run quote -- 700.HK" },
    { desc: "查询阿里巴巴行情", cmd: "npm run quote -- 9988.HK" },
    {
      desc: "批量查询",
      cmd: "npm run quote -- 700.HK 9988.HK AAPL.US",
    },
  ];

  console.log(`
╔══════════════════════════════════════════════════════╗
║                ${title.padEnd(40)}║
║                                                      ║
║  版本: v${VERSION.padEnd(42)}║
║  仓库: ${(REPO_URL.padEnd(43))}║
║                                                      ║
║  配置状态:                                            ║`);

  printConfigSummary();

  console.log(`║                                                      ║
║  可用命令:                                            ║`);

  for (const { cmd, desc } of commands) {
    console.log(`║    ${cmd.padEnd(24)}  ${desc.padEnd(25)}║`);
  }

  console.log(`║                                                      ║
║  使用示例:                                            ║`);

  for (const { desc, cmd } of examples) {
    console.log(`║    ● ${desc.padEnd(28)}  ║`);
    console.log(`║      ${cmd.padEnd(48)}║`);
  }

  console.log(`║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
}

main().catch((err) => {
  console.error("❌ 程序异常退出:", err);
  process.exit(1);
});

async function main() {
  printHelp();
}
