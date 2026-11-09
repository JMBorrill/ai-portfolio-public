import type { Media } from "@/content/media";

type FigureProps = {
  media: Media;
  sizes: string;
  priority?: boolean;
  className?: string;
};

export function Figure({ media, sizes, priority = false, className }: FigureProps) {
  return (
    <figure className={["figure", className].filter(Boolean).join(" ")}>
      <div className="app-frame">
        <img
          src={media.src}
          srcSet={media.srcSet}
          sizes={media.srcSet ? sizes : undefined}
          width={media.width}
          height={media.height}
          alt={media.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
        />
      </div>
      <figcaption>{media.caption}</figcaption>
    </figure>
  );
}
