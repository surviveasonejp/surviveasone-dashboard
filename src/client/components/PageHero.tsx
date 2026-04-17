import { type FC, type ReactNode } from "react";

interface PageHeroProps {
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
}

export const PageHero: FC<PageHeroProps> = ({ title, subtitle, right }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h1 className="text-2xl md:text-3xl font-bold font-mono leading-tight">{title}</h1>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
    {subtitle && <p className="text-text-muted text-sm leading-relaxed">{subtitle}</p>}
  </div>
);
