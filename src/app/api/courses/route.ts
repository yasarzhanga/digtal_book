import { requireTeacher } from "@/server/auth/guards";
import { CourseCreateInputSchema, createCourseWithClassroom, listTeacherCourses } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function GET(): Promise<Response> {
  try {
    const user = await requireTeacher();
    return ok({ courses: listTeacherCourses(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireTeacher();
    const input = await parseJson(request, CourseCreateInputSchema);
    return ok({ course: createCourseWithClassroom(user.id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
