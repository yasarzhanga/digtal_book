import { id } from "@/server/db/ids";
import { getDb } from "@/server/db/client";
import { ActivityBatchSchema, type ActivityEventInput } from "@/content-engine/tracking/events";
import { ensureActivityEventWritable } from "@/server/auth/guards";
import type { PublicUser } from "@/server/services/auth";

export function recordEvent(userId: string, event: ActivityEventInput): void {
  recordEvents(userId, [event]);
}

export function recordEvents(userId: string, events: ActivityEventInput[]): void {
  const parsed = ActivityBatchSchema.parse({ events });
  insertEvents(userId, parsed.events);
}

export function recordEventsForUser(user: PublicUser, events: ActivityEventInput[]): void {
  const parsed = ActivityBatchSchema.parse({ events });
  for (const event of parsed.events) {
    ensureActivityEventWritable(user, event);
  }
  insertEvents(user.id, parsed.events);
}

function insertEvents(userId: string, events: ActivityEventInput[]): void {
  const now = new Date().toISOString();
  const statement = getDb().prepare("INSERT INTO ActivityEvent (id, userId, bookVersionId, classroomId, chapterId, nodeId, eventType, durationSeconds, progress, payloadJson, occurredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const event of events) {
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
