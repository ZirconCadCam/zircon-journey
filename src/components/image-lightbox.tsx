import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from "lucide-react";

export type LightboxImage = { url: string; name?: string };

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);

  const total = images.length;
  const current = images[index];

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(current.url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      let filename = current.name || "صورة";
      const hasExt = /\.[a-zA-Z0-9]{1,6}$/i.test(filename);
      if (!hasExt) {
        const mimeExt = blob.type?.split("/")[1];
        if (mimeExt && mimeExt !== "octet-stream") filename += `.${mimeExt}`;
        else filename += ".jpg";
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch {
      window.open(current.url, "_blank");
    }
  }, [current]);

  const go = useCallback(
    (dir: number) => {
      setZoom(1);
      onIndexChange((index + dir + total) % total);
    },
    [index, total, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(1); // RTL: left advances
      else if (e.key === "ArrowRight") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 4));
      else if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose]);

  if (!current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      dir="rtl"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-2 p-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold truncate">
          {current.name || "صورة"}{" "}
          {total > 1 && <span className="text-white/60">({index + 1}/{total})</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}
            className="rounded-lg p-2 hover:bg-white/15 transition"
            title="تصغير"
          >
            <ZoomOut className="size-5" />
          </button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
            className="rounded-lg p-2 hover:bg-white/15 transition"
            title="تكبير"
          >
            <ZoomIn className="size-5" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg p-2 hover:bg-white/15 transition"
            title="تحميل"
          >
            <Download className="size-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/15 transition"
            title="إغلاق"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative flex-1 flex items-center justify-center overflow-auto">
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/25 transition"
            title="السابق"
          >
            <ChevronRight className="size-7" />
          </button>
        )}

        <img
          src={current.url}
          alt={current.name || ""}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-[78vh] max-w-[92vw] object-contain transition-transform duration-150 cursor-zoom-in select-none"
          onDoubleClick={() => setZoom((z) => (z >= 2 ? 1 : z + 1))}
        />

        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/25 transition"
            title="التالي"
          >
            <ChevronLeft className="size-7" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {total > 1 && (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto p-3"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => {
                setZoom(1);
                onIndexChange(i);
              }}
              className={`shrink-0 rounded-md overflow-hidden border-2 transition ${
                i === index ? "border-gold" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={img.url} alt={img.name || ""} className="h-14 w-14 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
