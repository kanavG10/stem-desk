"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Editor } from "@/lib/types";

type Session = {
  editors: Editor[];
  me: Editor | null;
  setMe: (id: number) => void;
  mailIsLive: boolean;
  unread: number;
  refreshUnread: () => void;
  refreshEditors: () => void;
};

const Ctx = createContext<Session>({
  editors: [],
  me: null,
  setMe: () => {},
  mailIsLive: false,
  unread: 0,
  refreshUnread: () => {},
  refreshEditors: () => {},
});

export const useSession = () => useContext(Ctx);

const KEY = "stemhub.editorId";

/**
 * Prototype-grade identity: pick who you are from a dropdown. Swapping this for real
 * auth later means replacing this provider and nothing else — every write already
 * sends an explicit `actorId`.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [editors, setEditors] = useState<Editor[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [mailIsLive, setMailIsLive] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshEditors = useCallback(() => {
    fetch("/api/editors")
      .then((r) => r.json())
      .then((d: { editors: Editor[]; mailIsLive: boolean }) => {
        setEditors(d.editors);
        setMailIsLive(d.mailIsLive);
        setMeId((current) => {
          if (current !== null) return current;
          const stored = Number(localStorage.getItem(KEY));
          return d.editors.some((e) => e.id === stored) ? stored : (d.editors[0]?.id ?? null);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(refreshEditors, [refreshEditors]);

  const refreshUnread = useCallback(() => {
    if (!meId) return;
    fetch(`/api/mentions?editorId=${meId}`)
      .then((r) => r.json())
      .then((d: { mentions: { seen: number }[] }) =>
        setUnread(d.mentions.filter((m) => !m.seen).length)
      )
      .catch(() => {});
  }, [meId]);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 20_000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  const setMe = useCallback((id: number) => {
    localStorage.setItem(KEY, String(id));
    setMeId(id);
  }, []);

  const value = useMemo<Session>(
    () => ({
      editors,
      me: editors.find((e) => e.id === meId) ?? null,
      setMe,
      mailIsLive,
      unread,
      refreshUnread,
      refreshEditors,
    }),
    [editors, meId, setMe, mailIsLive, unread, refreshUnread, refreshEditors]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
