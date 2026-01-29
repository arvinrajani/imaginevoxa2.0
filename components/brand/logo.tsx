import Link from "next/link";
import { AnimatedLogo } from "./animated-logo";

export function Logo({ withLink = true }: { withLink?: boolean }) {
  const content = <AnimatedLogo size="lg" />;

  if (!withLink) return content;

  return <Link href="/app">{content}</Link>;
}
