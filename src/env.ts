/**
 * 长桥 Longbridge OpenAPI 投资助手
 *
 * 环境变量配置加载模块
 *
 * @module env
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientOptions } from "./client.js";

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 获取当前模块目录（兼容 ESM）
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 尝试加载 .env 文件
 *
 * .env 文件格式:
 * ```
 * KEY=VALUE
 * # 注释
 * ```
 */
function tryLoadDotenv(): void {
  const envPath = resolve(__dirname, "..", "..", ".env");

  if (!existsSync(envPath)) {
    return; // .env 不存在时静默跳过
  }

  const content = readFileSync(envPath, "utf-8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // 只设置尚未被环境变量覆盖的值
    if (!process.env[key]) {
      process.env[key] = value;
      console.debug(`[env]  已加载 ${key}`);
    }
  }
}

// 模块加载时自动读取 .env
tryLoadDotenv();

// ---------------------------------------------------------------------------
// 环境变量读取
// ---------------------------------------------------------------------------

/** 必需的环境变量列表 */
const REQUIRED_VARS = [
  "LONGBRIDGE_APP_KEY",
  "LONGBRIDGE_APP_SECRET",
  "LONGBRIDGE_ACCESS_TOKEN",
] as const;

/** 可选环境变量 */
const OPTIONAL_VARS = ["LONGBRIDGE_PROXY", "LONGBRIDGE_HTTP_URL"] as const;

/**
 * 从环境变量构建客户端配置
 *
 * 必填:
 *   - LONGBRIDGE_APP_KEY       应用 Key
 *   - LONGBRIDGE_APP_SECRET    应用 Secret
 *   - LONGBRIDGE_ACCESS_TOKEN  访问令牌
 *
 * 可选:
 *   - LONGBRIDGE_HTTP_URL      API 基础地址（默认 https://openapi.longbridge.com）
 *   - LONGBRIDGE_PROXY         代理地址 (http/socks5)
 *
 * @returns 客户端配置对象
 * @throws 当缺少必填环境变量时抛出
 */
export function configFromEnv(): ClientOptions {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const msg = [
      `缺少必需的环境变量: ${missing.join(", ")}`,
      "",
      "请创建 .env 文件并填入:",
      "",
      "  LONGBRIDGE_APP_KEY=你的AppKey",
      "  LONGBRIDGE_APP_SECRET=你的AppSecret",
      "  LONGBRIDGE_ACCESS_TOKEN=你的AccessToken",
      "",
      "可以在 https://open.longbridge.cn 申请",
    ].join("\n");

    throw new Error(msg);
  }

  return {
    appKey: process.env.LONGBRIDGE_APP_KEY!,
    appSecret: process.env.LONGBRIDGE_APP_SECRET!,
    accessToken: process.env.LONGBRIDGE_ACCESS_TOKEN!,
    baseUrl: process.env.LONGBRIDGE_HTTP_URL,
    proxy: process.env.LONGBRIDGE_PROXY,
  };
}

/**
 * 打印当前配置摘要（用于调试，不打印敏感信息）
 */
export function printConfigSummary(): void {
  const hasConfig = REQUIRED_VARS.every((key) => process.env[key]);

  if (!hasConfig) {
    console.log("  ❌ 未配置（缺少 API 密钥）");
    return;
  }

  console.log("  ✅ API 密钥已配置");

  if (process.env.LONGBRIDGE_PROXY) {
    console.log(`  🔗 代理: ${process.env.LONGBRIDGE_PROXY}`);
  }

  if (process.env.LONGBRIDGE_HTTP_URL) {
    console.log(`  🌐 自定义 API 地址: ${process.env.LONGBRIDGE_HTTP_URL}`);
  }
}
