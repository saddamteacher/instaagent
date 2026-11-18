"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { OfficeEvent, OfficeEventType } from "@jarvisgram/shared";

/** SSE hodisasi kelganda server komponentlarini qayta yuklaydi (debounce bilan). */
export function LiveRefresh({ types }: { types?: OfficeEventType[] }) {
  const router = useRouter();
  const key = types?.join(",") ?? "";
  useEffect(() => {
    const allowed = key ? key.split(",") : null;
    const es = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as OfficeEvent;
      if (allowed && !allowed.includes(ev.type)) return;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [router, key]);
  return null;
}
