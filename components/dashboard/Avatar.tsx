// Circular avatar — client's image_url when set, otherwise the name's first
// letter on a flat accent-tinted background. No image upload flow exists
// yet, so the initial fallback is the common case, not an edge case.
// `className` carries both size AND text-size utilities together (e.g.
// "h-10 w-10 text-sm") — text size used to be hardcoded (text-[10px]),
// which broke for any caller wanting a bigger avatar (the initial stayed
// tiny inside a bigger circle, and fighting it via a class on top of an
// already-hardcoded one is a CSS-source-order gamble, not a fix).
export function Avatar({
  name,
  imageUrl,
  className = "h-6 w-6 text-[10px]",
  gradient = false,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
  /** Soft Studio redesign (ProjectCard) — pastel gradient + white initial
   * instead of the flat accent-tinted default. Opt-in only: every other
   * caller (client detail header, project detail header, "Por cliente"
   * grouping) keeps the original look unless it passes this explicitly. */
  gradient?: boolean;
}) {
  if (imageUrl) {
    return (
      // Avatar source is an arbitrary client-supplied URL, not a local/
      // optimizable asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-medium ${
        gradient ? "text-white" : "bg-accent/15 text-accent"
      } ${className}`}
      style={gradient ? { background: "linear-gradient(135deg, #f9a8d4, #c4b5fd)" } : undefined}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
