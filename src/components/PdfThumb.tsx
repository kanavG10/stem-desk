"use client";

import { useEffect, useRef, useState } from "react";
import { openPdf } from "@/lib/pdf";

/** Renders page 1 of a spread at card size so the grid isn't a wall of file names. */
export function PdfThumb({ spreadId, className = "" }: { spreadId: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await openPdf(`/api/pdf/${spreadId}`);
        if (cancelled) return;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const scale = (440 * (window.devicePixelRatio || 1)) / base.width;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.aspectRatio = `${base.width} / ${base.height}`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spreadId]);

  return (
    <div className={`relative ${className}`}>
      {/* 11x17 portrait — the card takes the page's own proportions. */}
      <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: "11 / 17" }} />
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center font-mono text-[10px] text-ink-3">
          {state === "loading" ? "rendering" : "no preview"}
        </div>
      )}
    </div>
  );
}
