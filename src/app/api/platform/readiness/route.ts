import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { createDatabaseBackup, getCloudReadiness, listBackups, listTenantsForUser } from "@/server/services/cloud";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role === "STUDENT") {
      throw new Error("FORBIDDEN");
    }
    return ok({
      readiness: getCloudReadiness(),
      tenants: listTenantsForUser(user.id),
      backups: listBackups()
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "EDITOR") {
      throw new Error("FORBIDDEN");
    }
    return ok({ backup: createDatabaseBackup("api") });
  } catch (error) {
    return errorResponse(error);
  }
}
