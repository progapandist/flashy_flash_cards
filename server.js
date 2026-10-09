// Dev server: the static files plus live reload, same idea as tja-web. Not deployed.
import { watch } from "node:fs";

const sockets = new Set();
const live = `<script>new WebSocket("ws://"+location.host+"/live").onmessage=()=>location.reload()</script>`;

watch(".", { recursive: true }, (_, file) => {
  if (!file || file.startsWith(".git") || file.startsWith("dist")) return;
  for (const s of sockets) s.send("reload");
});

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  websocket: { open: (s) => sockets.add(s), close: (s) => sockets.delete(s), message() {} },
  async fetch(req, server) {
    const path = new URL(req.url).pathname;
    if (path === "/live") return server.upgrade(req) ? undefined : new Response("expected websocket", { status: 400 });
    if (path === "/" || path === "/index.html") {
      return new Response((await Bun.file("index.html").text()) + live, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    // no-store: a reload must pick up the edited file, not a cached copy.
    const file = Bun.file("." + path);
    return (await file.exists()) ? new Response(file, { headers: { "cache-control": "no-store" } }) : new Response("not found", { status: 404 });
  },
});

console.log(`flashy → http://localhost:${server.port}`);
