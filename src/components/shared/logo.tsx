import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// 32px × 1.24, rounded to the nearest practical rendered pixel.
export function Logo({ className, size = 55 }: { className?: string; size?: number }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-gt-emerald-bright",
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="Green Tree logo"
        width={size}
        height={size}
        className="size-[55px] shrink-0 rounded-full"
        priority
      />
      <span className="font-display text-lg font-semibold tracking-tight text-gt-offwhite">
        Green Tree
      </span>
    </Link>
  );
}
