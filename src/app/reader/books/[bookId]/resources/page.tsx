import { ensureBookReadable } from "@/server/auth/guards";
import { requireUser } from "@/server/auth/session";
import { aggregateResources, getReaderSnapshot } from "@/server/services/reader";
import { listCourseResourcesForClassroom } from "@/server/services/p1";
import { assetSearchText } from "@/server/services/asset-search";
import { getStudentClassroomForBook } from "@/server/services/teaching";
import { ResourcesClient } from "./ResourcesClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}

export default async function ResourcesPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  const { classroomId: requestedClassroomId } = await searchParams;
  const classroomId = requestedClassroomId ?? (user.role === "STUDENT" ? getStudentClassroomForBook(user.id, bookId) ?? undefined : undefined);
  ensureBookReadable(user, bookId, classroomId);
  const snapshot = getReaderSnapshot(bookId);
  const assetById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const resources = aggregateResources(bookId).map((resource) => ({
    ...resource,
    searchText: [
      resource.title,
      resource.type,
      resource.nodeId,
      resource.chapterId,
      ...resource.assetIds.map((assetId) => {
        const asset = assetById.get(assetId);
        return asset ? assetSearchText(asset) : assetId;
      })
    ].join(" ")
  }));
  const courseResources = classroomId ? listCourseResourcesForClassroom(classroomId, user.role).map((resource) => ({
    ...resource,
    searchText: assetSearchText(resource.asset)
  })) : [];
  return <ResourcesClient bookId={bookId} classroomId={classroomId} bookVersionId={snapshot.versionId} bookTitle={snapshot.book.title} resources={resources} courseResources={courseResources} />;
}
