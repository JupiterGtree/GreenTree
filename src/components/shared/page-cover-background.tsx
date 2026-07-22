import Image from "next/image";
import type { ReactNode } from "react";

type PageCoverProps = {
  children: ReactNode;
  src: string;
  objectPosition?: string;
};

export function PageCover({ children, src, objectPosition = "center" }: PageCoverProps) {
  return (
    <section className="relative min-h-[360px] overflow-hidden border-b border-gt-border bg-gt-charcoal-2/60 sm:min-h-[380px] md:min-h-[400px] lg:min-h-[440px] 2xl:min-h-[480px]">
      <Image
        src={src}
        alt=""
        fill
        priority
        quality={92}
        sizes="100vw"
        className="object-cover object-center"
        style={{ objectPosition }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gt-charcoal-2/60" />
      <div className="container-gt relative z-10 py-12 sm:py-14">{children}</div>
    </section>
  );
}
