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
