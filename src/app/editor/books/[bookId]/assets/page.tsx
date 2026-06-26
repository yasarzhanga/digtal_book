import { requireUser } from "@/server/auth/session";
import { listAssets, getAssetReferences } from "@/server/services/assets";
import { AssetLibraryClient } from "./AssetLibraryClient";

export default async function AssetLibraryPage() {
  await requireUser();
  const assets = listAssets().map((asset) => ({ ...asset, references: getAssetReferences(asset.id) }));
  return <AssetLibraryClient assets={assets} />;
}
