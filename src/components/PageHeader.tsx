export function PageHeader({
  label,
  title,
  right,
}: {
  label: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-paper px-8 pt-7 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">{label}</div>
          <h1 className="mt-1.5 font-display text-[28px] leading-none">{title}</h1>
        </div>
        {right && <div className="flex items-center gap-2 pb-0.5">{right}</div>}
      </div>
    </header>
  );
}
