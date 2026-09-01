"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Spread } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { PdfThumb } from "./PdfThumb";
import { useSession } from "./SessionProvider";
import { Button, Empty, Input, Label, Note } from "./ui";

type Row = Spread & { open_notes: number; total_notes: number };

function fileSize(bytes: number) {
  return bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function SpreadsGrid() {
  const { data, reload } = useApi<{ spreads: Row[] }>("/api/spreads");
  const { me } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ issue: "", page_label: "" });

  /**
   * Three steps, because print PDFs are far bigger than a serverless request body
   * is allowed to be: ask for a URL, send the file straight to storage, then record
   * the metadata. The file never passes through the app's own API.
   */
  async function upload(files: FileList | File[]) {
    setError(null);
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError(`${file.name} is not a PDF`);
        continue;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError(`${file.name} is over 100 MB`);
        continue;
      }

      setBusy(file.name);
      try {
        const { storedName, uploadUrl } = await api<{ storedName: string; uploadUrl: string }>(
          "/api/spreads",
          { method: "POST" }
        );

        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        if (!put.ok) throw new Error(`upload failed (${put.status})`);

        await api("/api/spreads", {
          method: "PUT",
          body: JSON.stringify({
            storedName,
            filename: file.name,
            title: file.name.replace(/\.pdf$/i, ""),
            issue: meta.issue,
            page_label: meta.page_label,
            size_bytes: file.size,
            actorId: me?.id,
          }),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(null);
      }
    }
    reload();
  }

  const spreads = data?.spreads ?? [];

  return (
    <div className="px-8 py-7 pb-20">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={clsx(
          "flex flex-wrap items-end gap-4 rounded border border-dashed px-4 py-4 transition-colors",
          dragging ? "border-blue bg-blue-2" : "border-rule bg-card"
        )}
      >
        <div>
          <Label>Upload a spread</Label>
          <div className="mt-1 text-[13.5px] text-ink-2">
            Drop an 11×17 PDF here, or{" "}
            <button
              onClick={() => fileRef.current?.click()}
              className="font-medium text-blue underline underline-offset-2"
            >
              choose a file
            </button>
            .
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <label className="block">
            <span className="label mb-1 block">Issue</span>
            <Input
              value={meta.issue}
              onChange={(e) => setMeta({ ...meta, issue: e.target.value })}
              placeholder="Week 1"
              className="w-28"
            />
          </label>
          <label className="block">
            <span className="label mb-1 block">Pages</span>
            <Input
              value={meta.page_label}
              onChange={(e) => setMeta({ ...meta, page_label: e.target.value })}
              placeholder="B6-B7"
              className="w-28"
            />
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        {busy && (
          <div className="w-full">
            <Note tone="blue">Uploading {busy}…</Note>
          </div>
        )}
        {error && (
          <div className="w-full">
            <Note tone="rust">{error}</Note>
          </div>
        )}
      </div>

      {spreads.length === 0 ? (
        <Empty>No spreads yet. Drop an 11×17 PDF above to start marking it up.</Empty>
      ) : (
        <div className="mt-7 grid gap-6 sm:grid-cols-3 xl:grid-cols-5">
          {spreads.map((s) => (
            <Link key={s.id} href={`/spreads/${s.id}`} className="group">
              <PdfThumb
                spreadId={s.id}
                className="border border-rule bg-white transition-colors group-hover:border-ink-3"
              />
              <div className="mt-2.5">
                <div className="truncate text-[13px] font-medium">{s.title}</div>
                <div className="mt-0.5">
                  <Note tone={s.open_notes > 0 ? "ochre" : "muted"}>
                    {[
                      [s.issue, s.page_label].filter(Boolean).join(" "),
                      s.open_notes > 0
                        ? `${s.open_notes} open`
                        : s.total_notes > 0
                          ? "all resolved"
                          : "no notes",
                      fileSize(s.size_bytes),
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </Note>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button variant="quiet" onClick={reload}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
