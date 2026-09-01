import { ArticleTable } from "@/components/ArticleTable";
import { PageHeader } from "@/components/PageHeader";

export default function ArticlesPage() {
  return (
    <>
      <PageHeader
        label="Story tracker"
        title="The budget"
        right={
          <span className="hidden font-mono text-[11px] text-ink-3 sm:block">
            Click a cell to edit · click a box to move a story along
          </span>
        }
      />
      <ArticleTable />
    </>
  );
}
