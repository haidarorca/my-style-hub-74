import { useEffect, useState } from "react";
import { useHomeBanners } from "@/hooks/use-site-settings";

export function HeroCarousel() {
  const { data: banners } = useHomeBanners();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners]);

  if (!banners || banners.length === 0) return null;

  const current = banners[idx];
  const Inner = (
    <img
      src={current.image_url}
      alt={current.title ?? "Bannière"}
      className="h-44 w-full object-cover md:h-64"
    />
  );

  return (
    <section className="mt-3 overflow-hidden rounded-2xl bg-card shadow-soft">
      {current.link_url ? (
        <a href={current.link_url} target="_blank" rel="noopener noreferrer">{Inner}</a>
      ) : Inner}
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Bannière ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
