import { id } from "@/server/db/ids";
import { getDb } from "@/server/db/client";
import { ActivityBatchSchema, type ActivityEventInput } from "@/content-engine/tracking/events";

export function recordEvent(userId: string, event: ActivityEventInput): void {
  recordEvents(userId, [event]);
}

export function recordEvents(userId: string, events: ActivityEventInput[]): void {
  const parsed = ActivityBatchSchema.parse({ events });
  const now = new Date().toISOString();
  const statement = getDb().prepare("INSERT INTO ActivityEvent (id, userId, bookVersionId, classroomId, chapterId, nodeId, eventType, durationSeconds, progress, payloadJson, occurredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const event of parsed.events) {
    statement.run(
      id("event"),
      userId,
      event.bookVersionId ?? null,
      event.classroomId ?? null,
      event.chapterId ?? null,
      event.nodeId ?? null,
      event.eventType,
      event.durationSeconds ?? null,
      event.progress ?? null,
      JSON.stringify(event.payload ?? {}),
      event.occurredAt ?? now,
      now
    );
  }
}
