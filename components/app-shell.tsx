"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  PlugZap,
  Settings,
  Wand2,
  FileStack,
  LayoutTemplate,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: <LayoutDashboard size={18} /> },
  { label: "Generate", href: "/app/generate", icon: <Wand2 size={18} /> },
  { label: "Studio", href: "/app/studio", icon: <LayoutTemplate size={18} /> },
  { label: "Posts", href: "/app/posts", icon: <FileStack size={18} /> },
  { label: "LinkedIn", href: "/app/linkedin", icon: <PlugZap size={18} /> },
  { label: "Settings", href: "/app/settings", icon: <Settings size={18} /> },
];

type AppShellProps = {
  children: React.ReactNode;
  userEmail?: string | null;
};

type NavLinksProps = {
  pathname: string;
};

function NavLinks({ pathname }: NavLinksProps) {
  return (
    <nav className="flex flex-col gap-2">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
              active
                ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-[1400px] gap-8 px-6 py-6 lg:px-10">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 flex-col gap-6 rounded-3xl border bg-background/70 p-5 shadow-lg shadow-primary/5 backdrop-blur lg:flex">
          <Logo />
          <div className="flex-1">
            <NavLinks pathname={pathname} />
          </div>
          <div className="space-y-3 rounded-2xl bg-muted/60 p-4 text-xs text-muted-foreground">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
              Signed in
            </p>
            <p className="truncate text-sm font-medium text-foreground">{userEmail}</p>
            <Button variant="ghost" size="sm" className="w-full gap-2" onClick={handleLogout}>
              <LogOut size={16} />
              Logout
            </Button>
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          <header className="flex items-center justify-between rounded-3xl border bg-background/70 px-6 py-4 shadow-sm backdrop-blur lg:hidden">
            <Logo />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Menu
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-background/95">
                <div className="mb-6">
                  <Logo />
                </div>
                <NavLinks pathname={pathname} />
                <div className="mt-8 border-t pt-4">
                  <p className="text-sm text-muted-foreground">{userEmail}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full gap-2"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    Logout
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </header>
          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
