import { SpreadViewer } from "@/components/SpreadViewer";

export default async function SpreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpreadViewer spreadId={Number(id)} />;
}
