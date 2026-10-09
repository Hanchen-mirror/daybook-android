# 日常账本 / Daybook

一个完全离线、可安装的 Android 个人记账应用。版本 1.0.0，包名 `cn.local.daybook`。

## 功能

- 支出、收入两个独立入口；人民币金额，精确到分；分类、备注、默认当天日期及历史补记。
- 按日分组的月度账单；编辑和二次确认删除。
- 月度每日收支、年度每月收支、分类占比、图表下钻及零收支日期汇总。
- 导出全部、所选月或所选年的 JSON / CSV / HTML；通过系统文件选择器保存。
- JSON 校验后事务合并，按编号去重，不覆盖现有账单。
- SQLite 持久化；不声明网络权限，不要求账户，不依赖服务器、CDN 或外部前端包。

## 构建

需要 Windows PowerShell 7 或 Windows PowerShell 5.1、JDK 17+、Android SDK platform 35+ 和 build-tools 35+。本次使用 JDK 22、platform 35、build-tools 35.0.0。无需 Gradle 或 npm 安装。

```powershell
.\build.ps1 -Sdk '你的 Android SDK 目录' -JavaHome '你的 JDK 目录'
```

正式版输出 `build/daybook-1.0.0.apk`。测试版添加 `-DebugBuild`，输出 `build/daybook-qa.apk`，仅测试版开放 WebView 调试。

流程：aapt2 编译资源 → javac 编译 Java → d8 生成 DEX → zipalign 对齐 → apksigner 签名并验证。构建脚本始终检查子进程退出码。

本源码包的 `signing/` 含本应用专用私钥和密码，用于未来覆盖升级。请私下妥善保留，不要公开上传。删除密钥后重新生成的 APK 无法直接覆盖当前安装；须先导出全部 JSON，再卸载重装及恢复。

使用自己的密钥可传 `-KeyStore`、`-KeyAlias` 并设置 `DAYBOOK_KEY_PASSWORD` 环境变量。首次构建没有密钥时，脚本自动生成一个。

## 源码结构

- `src/cn/local/daybook/MainActivity.java`：本地 WebView、严格资源路由、JS 接口及系统文件导入导出。
- `src/cn/local/daybook/LedgerDb.java`：SQLite、原生输入校验及事务导入。
- `assets/app.js` / `app.css`：手机界面和交互，参考 Element 的主色、按钮、表单与卡片风格，自行实现，无 Element 运行依赖。
- `assets/ledger.js`：整数分金额处理、日期边界、统计及三类导出。
- `AndroidManifest.xml`：Android 8.0 起安装，目标 API 35，禁用系统自动备份和网络请求。

## 测试

```powershell
node .\tests\ledger.test.cjs
```

12 项纯逻辑测试覆盖金额精度、金额校验、闰年、月年边界、日月统计、CSV 转义和公式防护、HTML 转义、JSON 无损备份。

`tests/device.cjs` 是开发时使用的 MuMu / ADB 集成测试脚本。只在专用测试实例和 QA APK 上运行：它会创建测试账单、修改页面状态。通过环境变量 `DAYBOOK_ADB` 和 `DAYBOOK_DEVICE` 指定 adb 路径及序列号；脚本使用本地 9223 端口。运行目录应包含 `work/` 文件夹，测试创建的编号清单存储于 `work/test-records.json`。正式版不开放此调试接口。

```powershell
$env:DAYBOOK_ADB = '你的 adb.exe 路径'
$env:DAYBOOK_DEVICE = '127.0.0.1:16384'
New-Item -ItemType Directory -Force work
node .\tests\device.cjs
node .\tests\device.cjs restart
```

## 数据约定

JSON 顶层：`app: "daybook"`、`schemaVersion: 1`、`currency: "CNY"`、`exportedAt`、`scope`、`entries`。

每条账单：`id` 唯一编号、`type`（`income` / `expense`）、`cents`（正整数分）、`date`（设备本地日期 `yyyy-MM-dd`）、`category`、`note`、`createdAt`（创建时 UTC 时间）。统计以 `date` 为准，不以创建时间为准。

金额范围为 0.01～999,999,999.99 元；备注最多 200 字符；分类 1～30 字符；日期 1900～9999 年。JSON 单次导入最多 20 MB、50,000 条；整个文件全部校验后才进入数据库事务。相同编号跳过，不覆盖，不按金额或日期去重。

CSV 使用 UTF-8 BOM、标准引号转义、正数金额和独立类型列。对可能被表格软件识别为公式的文本添加单引号前缀，完整原始文本以 JSON 为准。

HTML 为不含脚本的静态报告，可通过浏览器打印为 PDF。CSV 和 HTML 不作为恢复输入。

## 验证范围

已在本机 MuMu Android 12 / WebView 110 验证。Android 8.0+ 是声明的兼容范围，未逐一实测各版本和所有实体手机。建议更新设备的 Android System WebView。本版本为单账本、人民币、固定分类，不含自动读取支付账单、银行连接、登录或云同步。

## 技术参考

- Android WebView：https://developer.android.com/develop/ui/views/layout/webapps/webview
- Element Plus 按钮设计参考：https://element-plus.org/en-US/component/button.html

界面、图标与业务代码均包含在本项目中，不依赖这些在线页面运行。
