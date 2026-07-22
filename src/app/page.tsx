import { HeroSection } from "@/features/home/hero-section";
import { BuyAndChartSection } from "@/features/home/buy-and-chart-section";
import { TokenStateSection } from "@/features/home/token-state-section";
import { TransparencyPreviewSection } from "@/features/home/transparency-preview-section";
import { MissionsPreviewSection } from "@/features/home/missions-preview-section";
import { EcosystemPreviewSection } from "@/features/home/ecosystem-preview-section";
import { RoadmapPreviewSection } from "@/features/home/roadmap-preview-section";
import { LatestUpdatesSection } from "@/features/home/latest-updates-section";
import { PartnershipSection } from "@/features/home/partnership-section";
import { ContactSection } from "@/features/home/contact-section";
import { getSiteContent } from "@/lib/admin/site-content";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const { home } = getSiteContent();
  return (
    <>
      <HeroSection />
      <BuyAndChartSection />
      <TokenStateSection />
      {home.transparencyVisible && <TransparencyPreviewSection />}
      <MissionsPreviewSection />
      <EcosystemPreviewSection />
      <RoadmapPreviewSection />
      {home.latestNewsVisible && <LatestUpdatesSection />}
      {home.partnershipsVisible && <PartnershipSection />}
      <ContactSection />
    </>
  );
}
