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
        "relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b1234]/80 px-6 py-5 shadow-voxa",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_140px_at_12%_10%,rgba(34,211,238,0.18),transparent_65%),radial-gradient(360px_160px_at_88%_0%,rgba(99,102,241,0.16),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-12 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          {eyebrow && (
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.32em] text-cyan-200/80">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-slate-300">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

