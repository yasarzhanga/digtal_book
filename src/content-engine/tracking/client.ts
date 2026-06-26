"use client";

import type { ActivityEventInput } from "@/content-engine/tracking/events";

type TrackInput = Omit<ActivityEventInput, "bookVersionId" | "classroomId" | "occurredAt"> & {
  bookVersionId?: string;
  classroomId?: string;
};

let queue: ActivityEventInput[] = [];
let timer: number | null = null;

export function enqueueEvent(event: ActivityEventInput): void {
  queue.push(event);
  if (queue.length >= 20) {
    void flushEvents();
    return;
  }
  if (timer === null && typeof window !== "undefined") {
    timer = window.setTimeout(() => {
      timer = null;
      void flushEvents();
    }, 5000);
  }
}

export function trackWithContext(bookVersionId: string, classroomId?: string) {
  return (event: TrackInput): void => {
    enqueueEvent({
      ...event,
      bookVersionId: event.bookVersionId ?? bookVersionId,
      classroomId: event.classroomId ?? classroomId,
      occurredAt: new Date().toISOString()
    });
  };
}

export async function flushEvents(): Promise<void> {
  if (queue.length === 0) {
    return;
  }
  const events = queue;
  queue = [];
  try {
    await fetch("/api/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true
    });
  } catch {
    queue = [...events, ...queue].slice(0, 50);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushEvents();
    }
  });
  window.addEventListener("pagehide", () => {
    void flushEvents();
  });
}
