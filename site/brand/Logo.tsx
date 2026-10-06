// 站点的字标和圆环标记：Wordmark 画站名（size 是高度，单位像素），RingMark 是小标记，转起来就是加载动画。
// 字标是 site/brand/logo.png 与 logo-dark.png（浅色/深色主题各一张，深色版把深蓝字改成浅色），
// 两张都通过 site.ts 的 rootIcons 发布在网站根目录。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  const style = { height: size, width: "auto" } as const;
  return (
    <span className={`inline-flex items-center ${className}`} aria-label={title} role="img">
      <img src="/logo.png" alt="" aria-hidden="true" className="block dark:hidden" style={style} />
      <img src="/logo-dark.png" alt="" aria-hidden="true" className="hidden dark:block" style={style} />
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
