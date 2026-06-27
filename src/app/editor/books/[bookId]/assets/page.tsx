import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { listReadableAssets, getVisibleAssetReferences } from "@/server/services/assets";
import { AssetLibraryClient } from "./AssetLibraryClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function AssetLibraryPage({ params }: PageProps) {
  const user = await requireEditor();
  const { bookId } = await params;
  ensureBookOwner(bookId, user.id);
  const assets = listReadableAssets(user).map((asset) => ({ ...asset, references: getVisibleAssetReferences(asset.id, user) }));
  return <AssetLibraryClient assets={assets} />;
}
