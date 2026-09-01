"use client";

import { clsx } from "@/lib/clsx";

export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={clsx("rounded border border-rule bg-card", className)}>{children}</div>;
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("label", className)}>{children}</div>;
}

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] transition-colors disabled:opacity-35 disabled:pointer-events-none whitespace-nowrap";
  const variants = {
    primary: "bg-blue text-white font-medium hover:bg-[#24407f]",
    ghost: "border border-rule bg-card text-ink hover:bg-sunk",
    quiet: "text-ink-2 hover:text-ink hover:bg-sunk",
  };
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}

const fieldBase =
  "rounded border border-rule bg-card px-2 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-blue";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(fieldBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(fieldBase, "cursor-pointer", props.className)} />;
}

/** Segmented control — used for every filter row in the app. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div className="inline-flex rounded border border-rule bg-card p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            "rounded-[3px] px-2.5 py-1 text-[12.5px] transition-colors",
            value === key ? "bg-ink text-white" : "text-ink-2 hover:text-ink"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Initials({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-rule bg-sunk font-mono font-medium text-ink-2"
    >
      {initials}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-9 text-center text-[13px] text-ink-3">{children}</div>;
}

/** A short severity note. Colour is reserved for these, so they stay readable. */
export function Note({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "blue" | "ochre" | "rust";
}) {
  const tones = {
    muted: "text-ink-3",
    blue: "text-blue",
    ochre: "text-ochre",
    rust: "text-rust",
  };
  return <span className={clsx("font-mono text-[11px]", tones[tone])}>{children}</span>;
}
