import { currentSession } from "@/lib/session";
import { subscribe } from "@/lib/events-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events: ofis hodisalari (MCP chaqiruvlari, tasdiqlar) jonli. */
export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return new Response("Unauthorized", { status: 401 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\n: ulandi\n\n`);
      const unsub = subscribe(s.workspace.id, (ev) => send(`data: ${JSON.stringify(ev)}\n\n`));
      const ping = setInterval(() => send(`: ping\n\n`), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* allaqachon yopilgan */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
