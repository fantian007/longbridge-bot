#!/usr/bin/env npx tsx
/**
 * 长桥 24H 自动盯盘系统 — 主入口
 *
 * 用法: npx tsx src/trading.ts
 */
import { runMonitor, formatReport } from "./monitor";

async function main() {
  console.log("⏳ 拉取数据 + 计算指标…");
  const report = await runMonitor();
  console.log(formatReport(report));
}

main().catch(err => {
  console.error("❌", (err as Error).message);
  process.exit(1);
});
