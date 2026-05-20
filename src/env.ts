/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 环境变量配置加载模块
 * - 优先从环境变量读取
 * - 未设置时从 ~/longbridge-token.txt 读取 ACCESS_TOKEN
 * - 支持真实账户 / 模拟账户切换
 *
 * @module env
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { ClientOptions } from "./client.js";

// ---------------------------------------------------------------------------
// Token 文件加载
// ---------------------------------------------------------------------------

/** 默认 token 文件路径 */
const TOKEN_FILE = resolve(homedir(), "longbridge-token.txt");

/**
 * 从 ~/longbridge-token.txt 读取 Access Token
 * 文件内容为纯文本 token
 */
function loadTokenFromFile(): string | null {
  try {
    if (existsSync(TOKEN_FILE)) {
      return readFileSync(TOKEN_FILE, "utf-8").trim();
    }
  } catch {
    // 读取失败时静默跳过
  }
  return null;
}

// ---------------------------------------------------------------------------
// .env 文件加载
// ---------------------------------------------------------------------------

/**
 * 尝试加载项目根目录的 .env 文件
 */
function tryLoadDotenv(): void {
  const envPath = resolve(import.meta.dirname, "..", "..", ".env");

  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

tryLoadDotenv();

// ---------------------------------------------------------------------------
// 环境变量读取
// ---------------------------------------------------------------------------

/** 必填环境变量 */
const REQUIRED_VARS = ["LONGBRIDGE_APP_KEY", "LONGBRIDGE_APP_SECRET"] as const;

/** 可选环境变量 */
const OPTIONAL_VARS = [
  "LONGBRIDGE_PROXY",
  "LONGBRIDGE_HTTP_URL",
  "LONGBRIDGE_TRADE_ENV",
] as const;

/**
 * 从环境变量 + token 文件构建客户端配置
 *
 * 必填:
 *   - LONGBRIDGE_APP_KEY       应用 Key
 *   - LONGBRIDGE_APP_SECRET    应用 Secret
 *   - LONGBRIDGE_ACCESS_TOKEN  访问令牌 (优先 env，其次 ~/longbridge-token.txt)
 *
 * 可选:
 *   - LONGBRIDGE_HTTP_URL      API 基础地址 (默认 https://openapi.longbridge.com)
 *   - LONGBRIDGE_PROXY         代理地址 (http/https/socks5)
 *   - LONGBRIDGE_TRADE_ENV     交易环境 ("real" | "simulate")，默认 "simulate"
 *
 * @returns 客户端配置对象
 * @throws 缺少必填项时抛出
 */
export function configFromEnv(): ClientOptions {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  // ACCESS_TOKEN: 优先环境变量，其次 token 文件
  const accessToken =
    process.env.LONGBRIDGE_ACCESS_TOKEN || loadTokenFromFile();

  if (!accessToken) {
    const msg = [
      "缺少 Access Token，请通过以下方式之一提供:",
      "",
      "  1. 环境变量: export LONGBRIDGE_ACCESS_TOKEN=你的Token",
      `  2. Token 文件: echo "你的Token" > ${TOKEN_FILE}`,
      "",
      "可以在 https://open.longbridge.cn 申请",
    ].join("\n");
    throw new Error(msg);
  }

  if (missing.length > 0) {
    const msg = [
      `缺少必需的环境变量: ${missing.join(", ")}`,
      "",
      "请设置:",
      "  LONGBRIDGE_APP_KEY=你的AppKey",
      "  LONGBRIDGE_APP_SECRET=你的AppSecret",
      "",
      "可以在 https://open.longbridge.cn 申请",
    ].join("\n");
    throw new Error(msg);
  }

  const tradeEnv =
    (process.env.LONGBRIDGE_TRADE_ENV as "real" | "simulate") || "simulate";

  return {
    appKey: process.env.LONGBRIDGE_APP_KEY!,
    appSecret: process.env.LONGBRIDGE_APP_SECRET!,
    accessToken,
    baseUrl: process.env.LONGBRIDGE_HTTP_URL,
    proxy: process.env.LONGBRIDGE_PROXY,
    tradeEnv,
  };
}

/**
 * 打印当前配置摘要
 */
export function printConfigSummary(): void {
  const hasKey = !!process.env.LONGBRIDGE_APP_KEY;
  const hasSecret = !!process.env.LONGBRIDGE_APP_SECRET;
  const hasToken =
    !!process.env.LONGBRIDGE_ACCESS_TOKEN || !!loadTokenFromFile();

  if (!hasKey || !hasSecret || !hasToken) {
    console.log("  ❌ API 密钥未完整配置");
    if (!hasToken) console.log(`     Token 文件 (${TOKEN_FILE}) 也未找到`);
    return;
  }

  const tradeEnv = process.env.LONGBRIDGE_TRADE_ENV || "simulate";
  const tag = tradeEnv === "real" ? "🔴 真实账户" : "🟡 模拟账户";

  console.log(`  ✅ API 密钥已配置  |  ${tag}`);

  if (process.env.LONGBRIDGE_PROXY) {
    console.log(`  🔗 代理: ${process.env.LONGBRIDGE_PROXY}`);
  }
  if (process.env.LONGBRIDGE_HTTP_URL) {
    console.log(`  🌐 自定义 API: ${process.env.LONGBRIDGE_HTTP_URL}`);
  }
}
