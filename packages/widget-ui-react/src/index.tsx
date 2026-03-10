import type { HTMLAttributes, PropsWithChildren } from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type WidgetShellProps = PropsWithChildren<{
  className?: string;
}>;

export function WidgetShell({ className, children }: WidgetShellProps) {
  return <main className={cx("widget-shell", className)}>{children}</main>;
}

type WidgetHeaderProps = PropsWithChildren<{
  className?: string;
}>;

export function WidgetHeader({ className, children }: WidgetHeaderProps) {
  return <header className={cx("widget-header", className)}>{children}</header>;
}

type WidgetTitleBlockProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
};

export function WidgetTitleBlock({ eyebrow, title, subtitle, className }: WidgetTitleBlockProps) {
  return (
    <div className={cx("widget-title-block", className)}>
      {eyebrow ? <div className="widget-eyebrow">{eyebrow}</div> : null}
      <h1 className="widget-title">{title}</h1>
      {subtitle ? <p className="widget-subtitle">{subtitle}</p> : null}
    </div>
  );
}

type WidgetHeaderActionsProps = PropsWithChildren<{
  className?: string;
}>;

export function WidgetHeaderActions({ className, children }: WidgetHeaderActionsProps) {
  return <div className={cx("widget-header-actions", className)}>{children}</div>;
}

type WidgetPanelProps = PropsWithChildren<{
  className?: string;
  tone?: "default" | "muted";
}>;

export function WidgetPanel({ className, tone = "default", children }: WidgetPanelProps) {
  return <section className={cx("widget-panel", tone === "muted" && "widget-panel--muted", className)}>{children}</section>;
}

type WidgetPanelHeaderProps = PropsWithChildren<{
  className?: string;
}>;

export function WidgetPanelHeader({ className, children }: WidgetPanelHeaderProps) {
  return <div className={cx("widget-panel-header", className)}>{children}</div>;
}

type WidgetStatusBarProps = {
  message: string;
  className?: string;
};

export function WidgetStatusBar({ message, className }: WidgetStatusBarProps) {
  return <div className={cx("widget-status-bar", className)}>{message}</div>;
}

type WidgetEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
};

export function WidgetEmptyState({
  title,
  description,
  className,
  ...props
}: WidgetEmptyStateProps) {
  return (
    <div className={cx("widget-empty-state", className)} {...props}>
      <div className="widget-empty-state__title">{title}</div>
      {description ? <div className="widget-empty-state__description">{description}</div> : null}
    </div>
  );
}
