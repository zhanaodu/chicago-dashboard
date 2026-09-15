# 芝加哥售后仓看板

## 2026-09 新版数据口径

当前只读取飞书 `库容流转表New`（`DrEN0J`），不修改源表。每日完整日期和表头用于识别记录块，排除周汇总；合并单元格产线名称仅在当天向下填充。

- 库存分期初、已录入入库、已录入出库、期末；快照不跨日相加，库存变化不反推补入库。
- 空白、公式错误、非数字保留为 `null`；数字 0 正常保留。`NOTE` 不作为产量，早期 `今日产出` 独立保留为 `production`。
- 人效按产出 / 折算实际工作人日重算；达标率只纳入产出已录入且目标为正的成对记录。多日按对应分子、分母汇总，不平均百分比。
- 总人数行单独保留，不重复累计。各工序输出不是去重后的成品机器数。
- 库存平衡差异、公式错误、人效差异和缺少人数显示对应源表行；不自动修改原始数字。
- 重复日期或没有日记录时拒绝发布，成功清洗后原子替换数据文件。

页面支持单日、近七日、近三十日、自定义区间、产线筛选和每日记录下钻。快捷日期以最新记录日截止，缺失日留空；库存与数据核对始终展示全仓。

回归测试：`python3 -m unittest discover -s tests -v` 和 `node --test tests/test_dashboard.cjs`。
离线验证：`python3 scripts/sync_feishu_sheet.py --input <飞书读取响应.json> --output /tmp/cleaned.json`。

## 本地预览

```bash
cd "/Users/mac/Documents/New project/chicago-dashboard-publish"
python3 -m http.server 8791 --bind 127.0.0.1
```

打开：

```text
http://127.0.0.1:8791/
```

## 手动同步飞书数据

```bash
cd "/Users/mac/Documents/New project/chicago-dashboard-publish"
./scripts/sync_daily.sh
```

同步结果写入：

```text
assets/data.json
```

## 每天 10 点同步

定时任务文件：

```text
launchd/com.yarbo.chicago-after-sales-dashboard-sync.plist
```

加载后会每天 10:00 执行 `scripts/sync_daily.sh`。

## GitHub Pages

仓库发布到 GitHub Pages 后，入口就是仓库根目录的 `index.html`。

公开链接：

```text
https://zhanaodu.github.io/chicago-dashboard/
```

## 自动发布到 GitHub Pages

```bash
./scripts/sync_and_publish.sh
```

这个脚本会同步飞书数据，提交更新后的 `assets/data.json`，并推送到 GitHub。定时任务文件：

```text
launchd/com.yarbo.chicago-dashboard-pages-publish.plist
```

## 页面实时刷新按钮

页面“更新看板”只读取已发布数据，所有访问者均可使用。“同步飞书（本机）”仅配置过同步服务的 Mac 可用，请求：

```text
http://127.0.0.1:8794/refresh
```

刷新服务执行 `scripts/sync_and_publish.sh`，重新抓取飞书并推送 GitHub Pages。进程锁防止定时任务与手动刷新同时发布。公开发布使用 `com.yarbo.chicago-dashboard-pages-publish`，每天本机时间 10:00（当前北京时间）。运行目录为 `~/Library/Application Support/YarboChicagoDashboard/chicago-dashboard-publish`，定时发布日志在 `~/Library/Application Support/YarboChicagoDashboard/logs/` 下。需电脑开机、网络和飞书授权有效；GitHub Pages 自身不执行抓取。凭证只保存在本机。

公开的 HTTPS 页面会短暂跳转到本机刷新服务；飞书同步和 GitHub Pages 发布完成后，会自动返回看板。

```text
launchd/com.yarbo.chicago-dashboard-refresh-server.plist
```
