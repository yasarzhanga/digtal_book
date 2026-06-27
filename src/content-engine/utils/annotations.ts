export interface AnnotationRange {
  id: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  color: "yellow" | "green" | "blue" | "pink";
  note?: string;
}

export function applyAnnotationMarksToHtml(html: string, annotations: AnnotationRange[]): string {
  const ranges = annotations
    .filter((annotation) => annotation.endOffset > annotation.startOffset)
    .sort((left, right) => left.startOffset - right.startOffset);
  if (ranges.length === 0) return html;

  const output: string[] = [];
  const tagPattern = /<[^>]+>/g;
  let cursor = 0;
  let textOffset = 0;
  for (const match of html.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const text = html.slice(cursor, index);
      output.push(markTextSegment(text, textOffset, ranges));
      textOffset += decodedLength(text);
    }
    output.push(match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < html.length) {
    const text = html.slice(cursor);
    output.push(markTextSegment(text, textOffset, ranges));
  }
  return output.join("");
}

function markTextSegment(text: string, segmentOffset: number, annotations: AnnotationRange[]): string {
  if (!text) return text;
  const length = decodedLength(text);
  const segmentEnd = segmentOffset + length;
  const overlapping = annotations.filter((annotation) => annotation.startOffset < segmentEnd && annotation.endOffset > segmentOffset);
  if (overlapping.length === 0) return text;

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const absolute = segmentOffset + cursor;
    const annotation = overlapping.find((item) => item.startOffset <= absolute && item.endOffset > absolute);
    const nextBoundary = nextTextBoundary(cursor, segmentOffset, text.length, annotation, overlapping);
    const value = text.slice(cursor, nextBoundary);
    chunks.push(annotation ? markHtml(value, annotation) : value);
    cursor = nextBoundary;
  }
  return chunks.join("");
}

function nextTextBoundary(cursor: number, segmentOffset: number, textLength: number, active: AnnotationRange | undefined, annotations: AnnotationRange[]): number {
  const absolute = segmentOffset + cursor;
  const candidates = [textLength];
  for (const annotation of annotations) {
    if (annotation.startOffset > absolute) candidates.push(annotation.startOffset - segmentOffset);
    if (annotation.endOffset > absolute) candidates.push(annotation.endOffset - segmentOffset);
  }
  if (active) candidates.push(active.endOffset - segmentOffset);
  return Math.max(cursor + 1, Math.min(...candidates.filter((value) => value > cursor && value <= textLength)));
}

function markHtml(value: string, annotation: AnnotationRange): string {
  return `<mark class="annotation-mark ${annotation.color}" data-annotation-id="${escapeHtmlAttribute(annotation.id)}" title="${escapeHtmlAttribute(annotation.note ?? "")}">${value}</mark>`;
}

function decodedLength(text: string): number {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'").length;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
