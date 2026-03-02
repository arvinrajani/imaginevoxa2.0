import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 px-6 py-5 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_140px_at_12%_10%,rgba(6,182,212,0.08),transparent_65%),radial-gradient(360px_160px_at_88%_0%,rgba(139,92,246,0.06),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-12 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          {eyebrow && (
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.32em] text-cyan-600/70">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-gray-900 tracking-tight">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

