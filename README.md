# 长桥 Longbridge OpenAPI 投资助手

基于 TypeScript 的长桥 OpenAPI 客户端，支持账户查询、行情监控、交易下单等操作。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥
cp .env.example .env
# 编辑 .env，填入从 https://open.longbridge.cn 申请的密钥

# 3. 运行
npm run dev          # 显示帮助菜单
npm run account      # 查询账户资产和持仓
npm run quote -- 700.HK     # 查腾讯行情
```

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 显示帮助菜单 |
| `npm run account` | 查询账户资产、持仓、自选股 |
| `npm run quote -- <股票代码>` | 查询实时行情和 K 线 |
| `npm run order` | 订单管理（交互式） |
| `npm run order -- list` | 查看订单列表 |
| `npm run order -- buy <代码> <量> <价>` | 限价买入 |
| `npm run order -- sell <代码> <量> <价>` | 限价卖出 |
| `npm run order -- cancel <order-id>` | 撤单 |
| `npm run watchlist` | 查看自选股 |
| `npm run trade` | 简易交易控制台（交互式） |

## 示例

```bash
# 查询腾讯控股行情
npm run quote -- 700.HK

# 批量查询
npm run quote -- 700.HK 9988.HK AAPL.US

# 查周 K 线
npm run quote -- 700.HK --period 1W --count 52

# 买 100 股腾讯，限价 380
npm run order -- buy 700.HK 100 380
```

## 代理支持

如果需要在代理环境下运行，设置环境变量或在命令后加 `--proxy`：

```bash
# 环境变量
export LONGBRIDGE_PROXY=http://127.0.0.1:7890

# 或命令行参数
npm run account -- --proxy http://127.0.0.1:7890
```

## 项目结构

```
src/
├── client.ts          # 核心 HTTP 客户端（签名、请求、代理）
├── env.ts             # 环境变量配置加载
├── index.ts           # 主入口 / 帮助菜单
├── account/
│   └── index.ts       # 账户资产与持仓查询
├── order/
│   └── index.ts       # 订单管理（查单 / 下单 / 撤单）
├── quote/
│   └── index.ts       # 行情与 K 线查询
├── watchlist/
│   └── index.ts       # 自选股查询
└── trade/
    └── console.ts     # 交互式交易控制台
```

## 技术栈

- **TypeScript** — 类型安全
- **tsx** — 直接运行 TypeScript，无需编译
- **Longbridge OpenAPI** — 官方 REST API
- **Node.js 原生 fetch** — 零额外依赖
