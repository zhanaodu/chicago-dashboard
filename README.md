# 芝加哥售后仓看板

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

页面里的“实时刷新”按钮会请求本机刷新服务：

```text
http://127.0.0.1:8794/refresh
```

刷新服务会执行 `scripts/sync_and_publish.sh`，重新抓取飞书数据并推送到 GitHub Pages，同时把最新 `assets/data.json` 回传给页面。定时服务文件：

公开的 HTTPS 页面会短暂跳转到本机刷新服务；飞书同步和 GitHub Pages 发布完成后，会自动返回看板。

```text
launchd/com.yarbo.chicago-dashboard-refresh-server.plist
```
