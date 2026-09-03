# V2 Marathon

一个为手机现场操作设计的纯前端抱石训练记录器。无依赖、无账号、无服务器端数据；训练记录自动保存在当前浏览器的 `localStorage` 中。

它同时是一个 PWA：首次在线访问后会缓存完整应用，可在 iPhone Safari 中通过“分享 → 添加到主屏幕”安装，并在离线时继续记录。

## 本地运行

在本目录执行：

```bash
python3 -m http.server 8000
```

然后打开 <http://localhost:8000>。

也可以直接双击 `index.html` 使用，但通过本地服务器打开在 Safari 和 Chrome 中表现更一致。

## 数据结构

本次训练存储为一个 session：

- `routes`：全局线路编号、分区、分区内编号、可选线路标记、结果、尝试次数、风格、动作质量、RPE、备注、时间和 Block
- `zones`、`currentZoneId`：现场创建的分区与当前连续记录分区
- `blockChecks`：每个 Block 的疲劳、Pump、不适与记录时间
- `restSessions`：休息开始、暂停、结束和实际时长
- `status`、`createdAt`、`finishedAt`：训练状态与时间

存储键为 `v2-marathon-session-v1`。JSON 导出会保留完整 session；CSV 同时包含线路行和 Block fatigue 行。

## PWA 更新说明

修改任何核心静态文件后，请同步修改 `sw.js` 中的 `CACHE_NAME`（例如从 `v1` 改为 `v2`），让已安装的手机获取新版本。用于托管服务的零依赖构建命令是：

```bash
python3 build.py
```
