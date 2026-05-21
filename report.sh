#!/bin/bash
# 长桥交易报告 - 飞书推送
echo '📊 长桥自动交易报告'
echo ''
node ~/longbridge-bot/journal.mjs report 2>&1
echo ''
echo '── 最新信号 ──'
node ~/longbridge-bot/scalper.mjs 2>&1 | head -25
