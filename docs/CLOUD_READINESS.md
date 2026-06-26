# 云平台与安全底座

本 Demo 默认使用 SQLite 和本地文件系统，便于离线验收。阶段 8 新增了可测试的云化底座：

- `DATABASE_PROVIDER=sqlite|postgres`：本地仍运行 SQLite；生产启用 PostgreSQL 前需先执行 `buildPostgresMigrationPlan()` 输出的迁移骨架并接入真实连接池。
- `OBJECT_STORAGE_PROVIDER=local|s3-compatible`：本地对象存储写入 `storage/object-store`；S3-compatible 模式要求 `OBJECT_STORAGE_BUCKET`，远端 SDK 在部署项目中安装。
- `ENFORCE_HTTPS=true`：中间件强制 HTTPS、设置 HSTS，并让 session cookie 自动启用 `secure`。
- `SMS_PROVIDER`/`SMS_API_KEY`、`WECHAT_APP_ID`/`WECHAT_APP_SECRET`：未配置时不会显示可用外部登录状态。

已落地的本地能力：

- 租户与成员角色表：`Tenant`、`TenantMembership`。
- 数据库队列：`PlatformJob`，支持 enqueue/claim/complete/fail。
- 备份记录：`BackupRecord`，`createDatabaseBackup()` 会复制 SQLite 文件并写入 SHA-256。
- readiness API：`GET /api/platform/readiness` 查看配置状态，`POST /api/platform/readiness` 创建一次备份。
