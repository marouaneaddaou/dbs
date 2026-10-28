const BLACK = "#111111";
const RED = "#DD0000";
const YELLOW = "#FFCC00";

/**
 * DBS brand mark.
 *
 * - "D" in black, "B" in red, "S" in yellow (exact brand colours).
 * - "Deutsch-Bildungsstudio" underneath, in black.
 *
 * Colours are applied through inline styles so the exact brand hex values are
 * guaranteed regardless of Tailwind's generated class set.
 */
export function DbsLogo({
  size = "md",
  align = "left",
  className,
}: {
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
  className?: string;
}) {
  const scale = {
    sm: { mark: "text-xl", sub: "text-[9px] tracking-[0.18em]" },
    md: { mark: "text-3xl", sub: "text-[10px] tracking-[0.2em]" },
    lg: { mark: "text-5xl", sub: "text-xs tracking-[0.25em]" },
  }[size];

  return (
    <span
      className={`inline-flex flex-col ${align === "center" ? "items-center" : "items-start"} ${
        className ?? ""
      }`}
      aria-label="DBS — Deutsch-Bildungsstudio"
    >
      <span
        className={`font-extrabold leading-none tracking-tight ${scale.mark}`}
        style={{ color: BLACK }}
      >
        <span style={{ color: BLACK }}>D</span>
        <span style={{ color: RED }}>B</span>
        <span style={{ color: YELLOW }}>S</span>
      </span>
      <span
        className={`mt-1 font-semibold uppercase leading-none ${scale.sub}`}
        style={{ color: BLACK }}
      >
        Deutsch-Bildungsstudio
      </span>
    </span>
  );
}
