type ClyoraLogoProps = {
  size?: "sm" | "md" | "lg";
  compact?: boolean;
  className?: string;
  alt?: string;
};

/** Official Clyora brand logo image. The compact mark is for constrained navigation. */
export function ClyoraLogo({
  size = "md",
  compact = false,
  className = "",
  alt = "clyora",
}: ClyoraLogoProps) {
  if (compact) {
    return (
      <span
        className={`clyora-logo-compact-mark clyora-logo-${size} ${className}`.trim()}
        aria-label={alt}
      >
        <span aria-hidden="true">c</span>
      </span>
    );
  }

  return (
    <img
      src="/brand/clyora-logo.png"
      alt={alt}
      className={`clyora-logo clyora-logo-${size} ${className}`.trim()}
      loading="eager"
      decoding="async"
    />
  );
}
