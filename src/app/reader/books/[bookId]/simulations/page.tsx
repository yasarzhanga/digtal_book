import { requireUser } from "@/server/auth/session";
import { getSimulationTemplates, listSimulationTemplateRuns } from "@/server/services/p1";
import { SimulationTemplatesClient } from "./SimulationTemplatesClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function SimulationTemplatesPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  return <SimulationTemplatesClient bookId={bookId} templates={getSimulationTemplates()} initialRuns={listSimulationTemplateRuns(user.id)} />;
}
