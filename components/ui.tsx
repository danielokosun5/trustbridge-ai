import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import Link from "next/link";

export function Button({ children, href, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; href?: string; variant?: "primary" | "secondary" | "quiet"; className?: string }) {
  const cls = `button button-${variant} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${className}`;
  return href ? <Link href={href} className={cls}>{children}</Link> : <button className={cls} {...props}>{children}</button>;
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

export function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "violet" | "muted" }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}
