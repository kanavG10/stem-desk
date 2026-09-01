"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./SessionProvider";
import { clsx } from "@/lib/clsx";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/articles", label: "Tracker" },
  { href: "/todos", label: "To-dos" },
  { href: "/spreads", label: "Spreads" },
  { href: "/inbox", label: "Inbox" },
] as const;

export function Sidebar() {
  const path = usePathname();
  const { editors, me, setMe, unread, mailIsLive } = useSession();

  return (
    <aside className="sticky top-0 flex h-screen w-[188px] shrink-0 flex-col border-r border-rule bg-card">
      <div className="border-b border-rule px-5 py-5">
        <div className="label">The Section</div>
        <div className="mt-1 font-display text-[23px] leading-none">STEM Desk</div>
      </div>

      <nav className="flex flex-col py-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "relative flex items-center px-5 py-2 text-[13.5px] transition-colors",
                active ? "text-ink" : "text-ink-2 hover:text-ink"
              )}
            >
              {active && <span className="absolute left-0 h-4 w-0.5 bg-blue" />}
              <span className={active ? "font-medium" : ""}>{item.label}</span>
              {item.href === "/inbox" && unread > 0 && (
                <span className="ml-auto font-mono text-[11px] text-blue">{unread}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-rule p-4">
        <label className="label block">Signed in as</label>
        <select
          value={me?.id ?? ""}
          onChange={(e) => setMe(Number(e.target.value))}
          className="-ml-0.5 mt-1.5 w-full cursor-pointer bg-transparent text-[13.5px] font-medium text-ink outline-none"
        >
          {editors.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="mt-3 font-mono text-[10.5px] text-ink-3">
          {mailIsLive ? "Email sending live" : "Email held in Inbox"}
        </div>
      </div>
    </aside>
  );
}
