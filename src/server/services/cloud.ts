import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { asRow, asRows, getDatabasePath, getDb } from "@/server/db/client";
import { id } from "@/server/db/ids";
import type { BackupRecordRow, PlatformJobRow, TenantMembershipRow, TenantRow } from "@/server/db/types";

export const DatabaseProviderSchema = z.enum(["sqlite", "postgres"]);
export const ObjectStorageProviderSchema = z.enum(["local", "s3-compatible"]);
export const TenantRoleSchema = z.enum(["OWNER", "ADMIN", "TEACHER", "STUDENT"]);

export const ObjectPutInputSchema = z.object({
  key: z.string().min(1).max(240),
  data: z.instanceof(Buffer),
  contentType: z.string().min(1).default("application/octet-stream")
});

export const QueueJobInputSchema = z.object({
  type: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).default({}),
  scheduledAt: z.string().datetime().optional()
});

export interface ObjectPutResult {
  provider: z.infer<typeof ObjectStorageProviderSchema>;
  key: string;
  absolutePath: string;
  size: number;
  contentType: string;
}

export interface QueueJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: PlatformJobRow["status"];
  attempts: number;
  scheduledAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface BackupRecord {
  id: string;
  path: string;
  sha256: string;
  size: number;
  createdAt: string;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  slug: string;
  role: z.infer<typeof TenantRoleSchema>;
}

export function getCloudReadiness() {
  const databaseProvider = DatabaseProviderSchema.parse(process.env.DATABASE_PROVIDER ?? "sqlite");
  const objectProvider = ObjectStorageProviderSchema.parse(process.env.OBJECT_STORAGE_PROVIDER ?? "local");
  const enforceHttps = process.env.ENFORCE_HTTPS === "true";
  const sessionSecretConfigured = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  return {
    database: {
      provider: databaseProvider,
      postgresUrlConfigured: Boolean(process.env.POSTGRES_URL),
      ready: databaseProvider === "sqlite" || Boolean(process.env.POSTGRES_URL)
    },
    objectStorage: {
      provider: objectProvider,
      bucketConfigured: objectProvider === "local" || Boolean(process.env.OBJECT_STORAGE_BUCKET),
      ready: objectProvider === "local" || Boolean(process.env.OBJECT_STORAGE_BUCKET)
    },
    queue: { provider: "sqlite-db", ready: true },
    backup: { provider: "filesystem", ready: true },
    rbac: { provider: "tenant-membership", ready: true },
    externalAuth: getExternalAuthProviders(),
    security: {
      enforceHttps,
      secureCookies: enforceHttps || process.env.NODE_ENV === "production",
      sessionSecretConfigured
    }
  };
}

export function getExternalAuthProviders(): { provider: "sms" | "wechat"; configured: boolean; reason: string }[] {
  return [
    {
      provider: "sms",
      configured: Boolean(process.env.SMS_PROVIDER && process.env.SMS_API_KEY),
      reason: process.env.SMS_PROVIDER && process.env.SMS_API_KEY ? "短信登录环境变量已配置" : "缺少 SMS_PROVIDER 或 SMS_API_KEY"
    },
    {
      provider: "wechat",
      configured: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
      reason: process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET ? "微信登录环境变量已配置" : "缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET"
    }
  ];
}

export function putObject(input: z.input<typeof ObjectPutInputSchema>): ObjectPutResult {
  const parsed = ObjectPutInputSchema.parse(input);
  const provider = ObjectStorageProviderSchema.parse(process.env.OBJECT_STORAGE_PROVIDER ?? "local");
  if (provider !== "local") {
    if (!process.env.OBJECT_STORAGE_BUCKET) {
      throw new Error("OBJECT_STORAGE_BUCKET_REQUIRED");
    }
    throw new Error("REMOTE_OBJECT_STORAGE_ADAPTER_NOT_INSTALLED");
  }
  const key = safeObjectKey(parsed.key);
  const root = path.resolve(process.cwd(), "storage/object-store");
  const target = path.resolve(root, key);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OBJECT_KEY_TRAVERSAL");
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, parsed.data);
  return { provider, key, absolutePath: target, size: parsed.data.byteLength, contentType: parsed.contentType };
}

export function enqueueJob(input: z.input<typeof QueueJobInputSchema>): QueueJob {
  const parsed = QueueJobInputSchema.parse(input);
  const now = new Date().toISOString();
  const jobId = id("job");
  getDb().prepare("INSERT INTO PlatformJob (id, type, payloadJson, status, attempts, scheduledAt, lockedAt, completedAt, error, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    jobId,
    parsed.type,
    JSON.stringify(parsed.payload),
    "READY",
    0,
    parsed.scheduledAt ?? now,
    null,
    null,
    null,
    now
  );
  return mustGetJob(jobId);
}

export function claimNextJob(): QueueJob | null {
  const now = new Date().toISOString();
  const row = asRow<PlatformJobRow>(
    getDb().prepare("SELECT * FROM PlatformJob WHERE status = 'READY' AND scheduledAt <= ? ORDER BY scheduledAt ASC, createdAt ASC LIMIT 1").get(now)
  );
  if (!row) return null;
  getDb().prepare("UPDATE PlatformJob SET status = 'PROCESSING', attempts = attempts + 1, lockedAt = ? WHERE id = ?").run(now, row.id);
  return mustGetJob(row.id);
}

export function completeJob(jobId: string): QueueJob {
  getDb().prepare("UPDATE PlatformJob SET status = 'DONE', completedAt = ?, error = NULL WHERE id = ?").run(new Date().toISOString(), jobId);
  return mustGetJob(jobId);
}

export function failJob(jobId: string, error: string): QueueJob {
  getDb().prepare("UPDATE PlatformJob SET status = 'FAILED', completedAt = ?, error = ? WHERE id = ?").run(new Date().toISOString(), error.slice(0, 1000), jobId);
  return mustGetJob(jobId);
}

export function createDatabaseBackup(label = "manual"): BackupRecord {
  const db = getDb();
  db.exec("PRAGMA wal_checkpoint(FULL);");
  const databasePath = getDatabasePath();
  if (!fs.existsSync(databasePath)) {
    throw new Error("DATABASE_FILE_MISSING");
  }
  const backupRoot = path.resolve(process.cwd(), "storage/backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupRoot, `${safeObjectKey(label)}-${timestamp}.sqlite`);
  fs.copyFileSync(databasePath, target);
  const data = fs.readFileSync(target);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const backupId = id("backup");
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO BackupRecord (id, path, sha256, size, createdAt) VALUES (?, ?, ?, ?, ?)").run(backupId, path.relative(process.cwd(), target), sha256, data.byteLength, now);
  return mustGetBackup(backupId);
}

export function listBackups(): BackupRecord[] {
  return asRows<BackupRecordRow>(getDb().prepare("SELECT * FROM BackupRecord ORDER BY createdAt DESC").all()).map(toBackupRecord);
}

export function listTenantsForUser(userId: string): TenantMembership[] {
  const rows = asRows<TenantMembershipRow & { tenantName: string; slug: string }>(
    getDb().prepare(`
      SELECT TenantMembership.*, Tenant.name AS tenantName, Tenant.slug
      FROM TenantMembership JOIN Tenant ON Tenant.id = TenantMembership.tenantId
      WHERE TenantMembership.userId = ?
      ORDER BY Tenant.createdAt ASC
    `).all(userId)
  );
  return rows.map((row) => ({
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    slug: row.slug,
    role: TenantRoleSchema.parse(row.role)
  }));
}

export function ensureTenantRole(userId: string, tenantId: string, allowedRoles: z.infer<typeof TenantRoleSchema>[]): TenantMembership {
  const memberships = listTenantsForUser(userId);
  const membership = memberships.find((item) => item.tenantId === tenantId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("TENANT_FORBIDDEN");
  }
  return membership;
}

export function assignTenantRole(actorUserId: string, tenantId: string, targetUserId: string, role: z.infer<typeof TenantRoleSchema>): TenantMembership {
  ensureTenantRole(actorUserId, tenantId, ["OWNER", "ADMIN"]);
  TenantRoleSchema.parse(role);
  const tenant = asRow<TenantRow>(getDb().prepare("SELECT * FROM Tenant WHERE id = ?").get(tenantId));
  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO TenantMembership (id, tenantId, userId, role, createdAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tenantId, userId) DO UPDATE SET role = excluded.role
  `).run(id("tenant_member"), tenantId, targetUserId, role, now);
  return ensureTenantRole(targetUserId, tenantId, [role]);
}

export function buildPostgresMigrationPlan(): string {
  return [
    "-- PostgreSQL deployment target for the Digital Textbook Demo",
    "-- The local demo runs SQLite; production should run this schema through a migration tool before enabling DATABASE_PROVIDER=postgres.",
    "CREATE TABLE IF NOT EXISTS \"Tenant\" (\"id\" text PRIMARY KEY, \"name\" text NOT NULL, \"slug\" text NOT NULL UNIQUE, \"createdAt\" timestamptz NOT NULL);",
    "CREATE TABLE IF NOT EXISTS \"TenantMembership\" (\"id\" text PRIMARY KEY, \"tenantId\" text NOT NULL REFERENCES \"Tenant\"(\"id\") ON DELETE CASCADE, \"userId\" text NOT NULL, \"role\" text NOT NULL CHECK (\"role\" IN ('OWNER','ADMIN','TEACHER','STUDENT')), \"createdAt\" timestamptz NOT NULL, UNIQUE(\"tenantId\", \"userId\"));",
    "CREATE TABLE IF NOT EXISTS \"PlatformJob\" (\"id\" text PRIMARY KEY, \"type\" text NOT NULL, \"payloadJson\" jsonb NOT NULL, \"status\" text NOT NULL CHECK (\"status\" IN ('READY','PROCESSING','DONE','FAILED')), \"attempts\" integer NOT NULL, \"scheduledAt\" timestamptz NOT NULL, \"lockedAt\" timestamptz, \"completedAt\" timestamptz, \"error\" text, \"createdAt\" timestamptz NOT NULL);",
    "CREATE TABLE IF NOT EXISTS \"BackupRecord\" (\"id\" text PRIMARY KEY, \"path\" text NOT NULL, \"sha256\" text NOT NULL, \"size\" bigint NOT NULL, \"createdAt\" timestamptz NOT NULL);"
  ].join("\n");
}

function safeObjectKey(key: string): string {
  const normalized = key.replaceAll("\\", "/").split("/").map((part) => part.trim()).filter(Boolean).join("/");
  if (!normalized || normalized.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("OBJECT_KEY_INVALID");
  }
  return normalized.replace(/[^a-zA-Z0-9._/-]/g, "-");
}

function mustGetJob(jobId: string): QueueJob {
  const row = asRow<PlatformJobRow>(getDb().prepare("SELECT * FROM PlatformJob WHERE id = ?").get(jobId));
  if (!row) {
    throw new Error("JOB_NOT_FOUND");
  }
  return toQueueJob(row);
}

function mustGetBackup(backupId: string): BackupRecord {
  const row = asRow<BackupRecordRow>(getDb().prepare("SELECT * FROM BackupRecord WHERE id = ?").get(backupId));
  if (!row) {
    throw new Error("BACKUP_NOT_FOUND");
  }
  return toBackupRecord(row);
}

function toQueueJob(row: PlatformJobRow): QueueJob {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
    scheduledAt: row.scheduledAt,
    lockedAt: row.lockedAt,
    completedAt: row.completedAt,
    error: row.error,
    createdAt: row.createdAt
  };
}

function toBackupRecord(row: BackupRecordRow): BackupRecord {
  return {
    id: row.id,
    path: row.path,
    sha256: row.sha256,
    size: row.size,
    createdAt: row.createdAt
  };
}
