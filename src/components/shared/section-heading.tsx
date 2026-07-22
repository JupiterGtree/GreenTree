import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  titleClassName?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  titleClassName,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gt-emerald-bright">
          {eyebrow}
        </span>
      )}
      <h2
        className={cn(
          "font-display text-balance text-3xl font-semibold text-gt-offwhite sm:text-4xl",
          titleClassName,
        )}
      >
        {title}
      </h2>
      {description && (
        <p className={cn("max-w-2xl text-base text-gt-muted", align === "center" && "mx-auto")}>
          {description}
        </p>
      )}
    </div>
  );
}
