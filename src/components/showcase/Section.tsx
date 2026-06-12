"use client";

import { useEffect, useState } from "react";

/** Collapsible showcase section; collapsed state persists per section key. */
export function Section({
  id,
  title,
  badge,
  actions,
  children,
}: {
  id: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const storageKey = `edh-playtest:section:${id}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      // ignore
    }
  }, [storageKey]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-950 p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={toggle} className="flex items-center gap-2 text-left">
          <span className="text-stone-500">{collapsed ? "▸" : "▾"}</span>
          <h2 className="text-sm font-bold tracking-wide text-stone-200 uppercase">{title}</h2>
          {badge}
        </button>
        {!collapsed && actions}
      </div>
      {!collapsed && <div className="mt-3">{children}</div>}
    </section>
  );
}
