import { PageHeader } from "@/components/PageHeader";
import { SpreadsGrid } from "@/components/SpreadsGrid";

export default function SpreadsPage() {
  return (
    <>
      <PageHeader
        label="Page spreads"
        title="Spreads"
        right={
          <span className="hidden font-mono text-[11px] text-ink-3 sm:block">
            11x17 PDFs - drop to upload
          </span>
        }
      />
      <SpreadsGrid />
    </>
  );
}
