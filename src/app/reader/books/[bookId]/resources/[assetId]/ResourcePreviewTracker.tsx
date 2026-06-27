"use client";

import { useEffect } from "react";
import { enqueueEvent, flushEvents } from "@/content-engine/tracking/client";

export function ResourcePreviewTracker({
  bookVersionId,
  classroomId,
  assetId,
  title,
  assetKind
}: {
  bookVersionId: string;
  classroomId?: string;
  assetId: string;
  title: string;
  assetKind: string;
}) {
  useEffect(() => {
    enqueueEvent({
      bookVersionId,
      classroomId,
      eventType: "RESOURCE_OPEN",
      payload: { kind: "preview", assetId, title, assetKind }
    });
    void flushEvents();
  }, [assetId, assetKind, bookVersionId, classroomId, title]);
  return null;
}
