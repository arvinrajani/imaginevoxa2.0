"use client";

import { RouteTransition } from "@/components/motion/route-transition";

export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
