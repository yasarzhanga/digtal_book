import { AssetUploadInputSchema, createUploadedAsset } from "@/server/services/assets";
import { ensureClassroomTeacher, ensureStudentEnrolled, requireRole, requireTeacher } from "@/server/auth/guards";
import { errorResponse, ok, parseJson } from "@/server/http";
import {
  CourseResourceCreateInputSchema,
  createCourseResource,
  listCourseResourcesForClassroom
} from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(["TEACHER", "STUDENT"]);
    const { classroomId } = await context.params;
    if (user.role === "TEACHER") {
      ensureClassroomTeacher(classroomId, user.id);
    } else {
      ensureStudentEnrolled(classroomId, user.id);
    }
    return ok({ resources: listCourseResourcesForClassroom(classroomId, user.role) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new Error("FILE_REQUIRED");
      }
      const asset = await createUploadedAsset(file, AssetUploadInputSchema.parse({
        title: String(form.get("title") ?? file.name),
        kind: String(form.get("kind") ?? "DOCUMENT")
      }), user.id);
      const resourceInput = CourseResourceCreateInputSchema.parse({
        assetId: asset.id,
        title: String(form.get("title") ?? asset.title),
        description: String(form.get("description") ?? ""),
        category: String(form.get("category") ?? "REFERENCE"),
        visibility: String(form.get("visibility") ?? "CLASS")
      });
      return ok({ resource: createCourseResource(user.id, classroomId, resourceInput) });
    }
    const input = await parseJson(request, CourseResourceCreateInputSchema);
    return ok({ resource: createCourseResource(user.id, classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
