import "server-only";
import { listen } from "@jarvisgram/db";
import type { OfficeEvent } from "@jarvisgram/shared";

type Sub = (ev: OfficeEvent) => void;

/**
 * Jarayon bo'yicha bitta Postgres LISTEN ulanishi; SSE mijozlari workspace bo'yicha obuna bo'ladi.
 */
const g = globalThis as unknown as { __jgHub?: { subs: Map<string, Set<Sub>>; started: boolean } };
const hub = (g.__jgHub ??= { subs: new Map<string, Set<Sub>>(), started: false });

function ensureStarted() {
  if (hub.started) return;
  hub.started = true;
  listen((ev) => hub.subs.get(ev.workspaceId)?.forEach((fn) => fn(ev)));
}

export function subscribe(workspaceId: string, fn: Sub) {
  ensureStarted();
  let set = hub.subs.get(workspaceId);
  if (!set) hub.subs.set(workspaceId, (set = new Set<Sub>()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) hub.subs.delete(workspaceId);
  };
}
