import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ShiftFlow — Stop Overpaying for Restaurant Scheduling",
  description:
    "Free restaurant scheduling with a cross-restaurant shift marketplace. Fill call-offs in minutes, not hours. Save $100+/month vs HotSchedules.",
  openGraph: {
    title: "ShiftFlow",
    description: "Stop overpaying for restaurant scheduling.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShiftFlow",
    description: "Stop overpaying for restaurant scheduling.",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
