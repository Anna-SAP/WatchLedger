# 视听档案 WatchLedger 0.1.1

可加载的本地原型：Neo / Chromium 扩展 + Firefox 测试扩展 + Python/SQLite 服务 + 中文回顾页面。

## 首次使用

1. 将整个 WatchLedger 文件夹保留在固定位置，双击 **Install-Launcher.cmd**，安装一次当前用户的浏览器启动桥接，无需管理员权限。当前电脑可使用 Codex 已有 Python；其他电脑需要 Python 3.10+。也可双击 **Start.cmd**，它会注册桥接并按原方式打开回顾页面。
2. Neo 打开扩展管理页，开启 Developer mode，选择 **Load unpacked**，选择本文件夹中的 **neo** 子文件夹（里面有 manifest.json）。
3. 点击扩展首页右上角的 **启动服务 / 连接** 电源按钮，服务在后台启动并自动配对。弹窗显示“已连接本机”，工具栏图标变绿。仍可从回顾页面“连接与配对设置”复制配对码，粘贴后点击“保存并连接”。
4. 刷新已打开的节目页面。正常播放后约 30 秒，扩展同步数据，页面再自动刷新；也可以点击刷新。
5. Firefox 打开 `about:debugging#/runtime/this-firefox` → 临时载入附加组件 → 选择 **firefox/manifest.json**。在扩展权限中允许访问观看网站，点击电源按钮连接同一服务。

**Firefox 临时扩展重启后需要重新加载。** 正式版持久安装需要 Mozilla 签名；本项目未签名、未提交任何平台。不要将本测试包理解成 Firefox 已实现长期无人值守安装。官方说明：https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## 日常自动运行

Neo 加载和配对完成后无需逐条记录。服务未运行时，点击扩展右上角电源按钮即可启动并连接；已连接时点击只检查连接，不重复启动。通过按钮启动的服务没有命令行窗口，关闭弹窗或浏览器后仍可运行，Windows 注销或重启后需要再次点击按钮，或启用下述登录自启动。

工具栏“视”图标在连接验证成功后为绿色；未配对、断线或认证失败时为灰色并带 `!` 提示。打开弹窗会立即检查，后台每 30 秒检查并同步。服务停止时扩展保留待同步队列，下次连接继续同步。手动启动 Start.cmd 时，仍可在服务窗口按 Ctrl+C 停止；后台服务可通过任务管理器定位命令行包含本项目 `server.py` 的 Python 进程后结束。

### 从 0.1.0 升级

在原目录更新文件后，运行一次 **Install-Launcher.cmd**，再到浏览器扩展管理页点击原扩展的 **重新加载**（如提示新增本地应用通信权限，请允许）。保留原 `neo` 目录位置，**不要先卸载扩展**，以保留原配对码和待同步队列。本次升级没有添加或更换 Chromium manifest key，也没有更改 Firefox 扩展 ID。

浏览器扩展不能直接执行 `.cmd`，因此需要一次本机桥接安装。桥接使用 Native Messaging，只接收固定的启动请求，只允许本项目扩展访问；注册位置为当前用户的 Chrome、Edge 和 Firefox `NativeMessagingHosts`，文件位于 `%LOCALAPPDATA%\WatchLedger\launcher`，不会添加登录启动项。服务和配对码始终留在本机。参考：[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[Firefox Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)。

若 Neo 提示桥接不可用，先确认扩展已重新加载。安装器默认根据当前 `neo` 目录推导扩展 ID；若浏览器实际 ID 不同，展开弹窗“首次安装 / 启动帮助”，复制其中扩展 ID，在项目目录执行 `powershell -ExecutionPolicy Bypass -File .\Install-Launcher.ps1 -ExtensionId 实际扩展ID`。移动项目后也需重新运行安装器。启动失败详情见 `%LOCALAPPDATA%\WatchLedger\launcher.log`。Neo 需支持 Chromium 的 Native Messaging 及 Chrome 注册表回退；不支持时仍可手动运行 Start.cmd。

如需 Windows 登录后自动在后台运行，双击 **Enable-Autostart.cmd**。它只创建当前用户的启动文件夹快捷方式，不需要管理员权限；下次登录生效。本次交付没有执行这个脚本，也没有修改你的启动项。移除自动启动：Win+R → `shell:startup` → 删除 WatchLedger 快捷方式。启用后不必再重复启动 Start.cmd，直接点击扩展的“打开回顾页面”。

## 数据位置与隐私

- 数据库默认在 `%LOCALAPPDATA%\WatchLedger\ledger.sqlite3`；配对码在同目录 `pairing-token.txt`。
- 应用只监听 `127.0.0.1:17643`，每次数据请求需要配对码；拒绝普通外部网站来源与非本机 Host。
- 不调用云端 AI，无遥测，不保存视频文件、Cookie、字幕、密码或整个浏览历史。URL 仅保留列明的节目参数；某些网站路径或标题本身仍可能包含个人信息。
- 扩展需要 HTTP/HTTPS 网站访问权限，以覆盖网页视频。无痕窗口拒绝记录，浏览器内部页面不支持。
- SQLite 与扩展队列均未加密，依赖 Windows 用户账户保护。应用不主动同步；请确保浏览器配置与 LOCALAPPDATA 未被你的第三方备份软件上传。
- 删除全部记录前，先关闭两个扩展的自动记录、清空各自待同步队列，再在回顾页执行删除。导出的 JSON 需自行保管或删除。
- 配对码只在本机使用；回顾页加载后立即从地址栏移除 URL fragment，保留到当前标签页的 sessionStorage。

## 已实现

- 检测 HTML5 audio/video、动态插入的媒体元素、可访问的 iframe 和开放 Shadow DOM。
- 约四秒采样，并监听暂停、跳转、倍速变化、结束等事件。
- 持久待同步队列、30 秒同步重试、UUID 幂等入库。
- 标题、规范化链接、平台、部分频道字段、倍速、片段、媒体时长、页面可见状态、静音状态。
- 日期/文字筛选、节目条目、累计播放、并行去重、后台播放、片段覆盖、平台分布、全部 JSON 导出与删除。
- YouTube/哔哩哔哩标题和频道选择器；YouTube 常见广告标记排除。其他三平台先识别域名与页面标题。

## 明确限制

- 已在独立 Edge 配置中通过真实扩展和本地音频的端到端测试。未在你的 Neo、Firefox 或 YouTube/国内会员视频网站账户上验证。
- 爱奇艺/腾讯/优酷的季集解析、广告排除与 SPA 换集身份需要实站适配；本版不提供已验证的追剧列表、自动流派或学习路线分类。
- 网站不改变 URL/标题且复用同一媒体源时，可能合并不同节目。不同标题可能将同一节目拆成多条。跨平台同一内容不自动匹配。
- 通用播放器广告不能保证识别，记录会标“广告未验证”。不绕过 DRM，不保证闭合 Shadow DOM、非 HTML5 或特殊嵌入播放器。
- “后台”仅指 document.hidden，不能判断画中画、是否被其他窗口遮挡或人的注意力。
- 浏览器休眠/强限频造成超过 15 秒采样空档时，保守丢弃该段，可能少计。页面崩溃/强制关闭可能丢最后约四秒及尚未收到后台确认的片段；非强制关闭会尽力发送。
- 播放自动广告或自动预览仍可能计入。标题变化时保守放弃跨边界片段，避免错误归属。
- 数据量很大时，当前全量回顾加载及 storage.local 队列需升级为分页查询/IndexedDB；这是 0.1 原型。
- 单纯播放记录无法证明实际学习或专注。暂停事件不单独作为日志列出；数据库保存有效播放片段，能够据此计算时长和覆盖。

## 验证方法

点击回顾页底部“本地音频测试页”，播放十秒、暂停五秒、切两倍速、跳到中间继续播放，再查看记录。该音频在本地生成，无需下载。

开发测试：

```text
node build.mjs
node --test tests/core.test.cjs tests/background.test.cjs
python -m unittest discover -s tests -p "test_*.py"
```

修改 extension/ 后需运行 build.mjs，再到浏览器扩展管理页重新加载并刷新节目页。

## 文件结构

- extension/：共用扩展源代码。
- neo/、firefox/：可直接加载的构建产物。
- server.py：本地 API 与 SQLite。
- scripts/native_host.py、Install-Launcher.cmd：Windows 本地启动桥接及一次性安装入口。
- web/：纯本地回顾界面与音频测试页。
- tests/：时间统计、持久化、接口安全测试。
- OPERATIONS.md：本次操作、测试与未完成验证的记录。
- preview.png：本地测试音频产生的数据截图，非真实观看历史。


## 浏览器集成测试与打包

`tests/smoke.cjs` 包含构建时使用的真实浏览器测试：

```powershell
npm install --no-save --package-lock=false playwright
node build.mjs
node tests/smoke.cjs
python scripts/package.py
```

集成测试默认使用 Windows 上的 Microsoft Edge，可通过 `BROWSER_EXECUTABLE` 指定支持加载未打包扩展的 Chromium 浏览器，通过 `PYTHON` 指定 Python 路径。先停止运行中的 WatchLedger 服务，测试需独占 17643 端口。隔离数据库、浏览器配置和截图保存在被 Git 忽略的 `work/`。打包文件输出到 `dist/`。

安装桥接后，可运行 `node tests/launcher-smoke.cjs` 验证真实电源按钮、本地启动、自动配对、绿/灰图标与关闭浏览器后服务仍然运行。该测试使用隔离浏览器配置，连接本机默认服务，不创建或删除观看记录，并保留启动的服务供用户使用。Neo 与 Firefox 还需要各自在实际浏览器中验证。
