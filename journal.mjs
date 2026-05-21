/**
 * 交易日志 —— 记录每笔买卖配对、盈亏计算
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";

const JOURNAL = "/home/zys/longbridge-bot/journal.json";
const LB = "/usr/local/bin/longbridge";
const ENV = { HOME: "/home/zys", PATH: process.env.PATH };

function load() {
  if (!existsSync(JOURNAL)) return [];
  try { return JSON.parse(readFileSync(JOURNAL, "utf8")); } catch { return []; }
}
function save(data) { writeFileSync(JOURNAL, JSON.stringify(data, null, 2)); }

function cli(cmd) {
  try { return JSON.parse(execSync(`${LB} ${cmd} --format json`, { encoding:"utf8", timeout:15000, env:ENV, cwd:"/tmp" })); }
  catch { return null; }
}

// 从订单历史匹配买卖对，计算盈亏
function matchTrades(orders) {
  if (!Array.isArray(orders)) return [];
  const filled = orders.filter(o => o.status === "Filled").sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const trades = [];
  const buyQueue = {};  // symbol -> [{qty, price, time}]

  for (const o of filled) {
    const sym = o.symbol, qty = parseInt(o.quantity), px = parseFloat(o.executed_price || o.price);
    if (!buyQueue[sym]) buyQueue[sym] = [];

    if (o.side === "Buy") {
      buyQueue[sym].push({ qty, price: px, time: o.created_at, orderId: o.order_id });
    } else {
      let remaining = qty;
      while (remaining > 0 && buyQueue[sym].length > 0) {
        const buy = buyQueue[sym][0];
        const matchedQty = Math.min(remaining, buy.qty);
        const pnl = (px - buy.price) * matchedQty;
        const pnlPct = ((px - buy.price) / buy.price * 100);
        trades.push({
          symbol: sym,
          buyTime: buy.time.slice(0, 19),
          sellTime: o.created_at.slice(0, 19),
          qty: matchedQty,
          buyPrice: +buy.price.toFixed(2),
          sellPrice: +px.toFixed(2),
          pnl: +pnl.toFixed(2),
          pnlPct: +pnlPct.toFixed(2),
        });
        remaining -= matchedQty;
        buy.qty -= matchedQty;
        if (buy.qty <= 0) buyQueue[sym].shift();
      }
    }
  }
  return trades;
}

// 生成 Feishu 格式报告
function report() {
  const orders = cli("order --history --start 2026-05-19");
  const trades = matchTrades(orders);

  const totalTrades = trades.length;
  const totalPnl = trades.reduce((s,t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades * 100) : 0;

  let msg = `📊 交易汇总 (${new Date().toISOString().slice(0,10)})\n`;
  msg += `═══════════════════\n`;
  msg += `总交易: ${totalTrades}笔  |  胜率: ${winRate.toFixed(0)}%\n`;
  msg += `总盈亏: ${totalPnl>=0?"+":""}$${totalPnl.toFixed(2)}\n`;
  msg += `盈利: ${wins.length}笔 (+$${wins.reduce((s,t)=>s+t.pnl,0).toFixed(0)})  |  亏损: ${losses.length}笔 (-$${Math.abs(losses.reduce((s,t)=>s+t.pnl,0)).toFixed(0)})\n`;
  msg += `\n`;

  if (trades.length > 0) {
    msg += `最近 5 笔:\n`;
    for (const t of trades.slice(-5)) {
      const e = t.pnl >= 0 ? "🟢" : "🔴";
      msg += `${e} ${t.symbol.padEnd(8)} ${t.buyTime.slice(5)}→${t.sellTime.slice(5)}  ${t.pnl>=0?"+":""}$${t.pnl.toFixed(2)} (${t.pnlPct>=0?"+":""}${t.pnlPct.toFixed(2)}%)\n`;
    }
  }

  return msg;
}

// 命令行
const cmd = process.argv[2];
if (cmd === "report") {
  console.log(report());
} else if (cmd === "trades") {
  const orders = cli("order --history --start 2026-05-19");
  const trades = matchTrades(orders);
  console.log(JSON.stringify(trades, null, 2));
} else {
  console.log("用法: node journal.mjs report   # 飞书格式报告");
  console.log("      node journal.mjs trades   # JSON 交易列表");
}
