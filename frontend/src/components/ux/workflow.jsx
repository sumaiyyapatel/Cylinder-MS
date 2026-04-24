import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const summaryToneClasses = {
  default: "border-border bg-card text-foreground",
  amber:   "border-border bg-card text-foreground border-t-2 border-t-amber-400",
  blue:    "border-border bg-card text-foreground border-t-2 border-t-blue-400",
  emerald: "border-border bg-card text-foreground border-t-2 border-t-emerald-400",
};

const messageToneClasses = {
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-blue-200/70 bg-blue-50/60 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/40",
  success: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40",
  warning: "border-amber-200/70 bg-amber-50/60 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40",
  danger: "border-red-200/70 bg-red-50/60 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40",
};

export function WorkflowSection({
  step,
  title,
  description,
  icon: Icon,
  headerRight,
  className,
  contentClassName,
  children,
}) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card shadow-sm", className)}>
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(30,58,95,0.1)] text-[var(--color-steel)]">
            {Icon ? <Icon className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Step {step}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      <div className={cn("px-5 py-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function SummaryPanel({
  title,
  description,
  icon: Icon,
  rows = [],
  footer,
  tone = "default",
  className,
}) {
  return (
    <aside
      className={cn(
        "rounded-3xl border px-5 py-5 shadow-sm",
        summaryToneClasses[tone] || summaryToneClasses.default,
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-sm opacity-80">{description}</p> : null}
        </div>
      </div>

      {rows.length ? (
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/60 px-3 py-2.5",
                row.className
              )}
            >
              <span className="text-sm opacity-80">{row.label}</span>
              <span className={cn("text-sm font-semibold", row.emphasis ? "title-font text-base" : "")}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {footer ? <div className="mt-5">{footer}</div> : null}
    </aside>
  );
}

export function InlineMessage({ tone = "muted", className, children }) {
  return (
    <div
      className={cn(
        "mt-2 rounded-2xl border px-3 py-2 text-xs font-medium",
        messageToneClasses[tone] || messageToneClasses.muted,
        className
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-sm",
        className
      )}
    >
      {Icon ? (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function MobileRecordList({ items, renderCard, empty, className }) {
  if (!items?.length) {
    return empty ?? null;
  }

  return <div className={cn("grid gap-3 md:hidden", className)}>{items.map(renderCard)}</div>;
}
