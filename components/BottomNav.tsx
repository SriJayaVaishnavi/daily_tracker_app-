'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Target, HeartPulse } from 'lucide-react';

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/mood', label: 'Mood', icon: HeartPulse },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="transition-calm flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <Icon
                  aria-hidden="true"
                  className={active ? 'text-primary' : 'text-muted-fg'}
                  size={22}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className={active ? 'text-primary' : 'text-muted-fg'}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
