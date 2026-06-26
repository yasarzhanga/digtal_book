import type { ContentNode } from "@/content-engine/schema/nodes";
import type { ChapterDocument } from "@/content-engine/schema/document";

export function collectAssetIdsFromNode(node: ContentNode): string[] {
  switch (node.type) {
    case "imageInteractive":
      return [node.assetId];
    case "gallery":
      return node.assetIds;
    case "audio":
      return [node.assetId, node.coverAssetId].filter(isString);
    case "video":
      return [node.assetId, node.coverAssetId, node.captionAssetId].filter(isString);
    case "model3d":
    case "panorama":
    case "attachment":
      return [node.assetId];
    case "extendedReading":
      return [node.assetId].filter(isString);
    default:
      return [];
  }
}

export function collectAssetIdsFromDocument(document: ChapterDocument): string[] {
  return Array.from(new Set(document.nodes.flatMap(collectAssetIdsFromNode)));
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
