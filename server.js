// Dev server: the static files plus live reload, same idea as tja-web. Not deployed.
// The deck API in functions/ runs under `wrangler pages dev` on API_PORT; requests to /api go there.
import { watch } from "node:fs";

const api = Number(process.env.API_PORT) || 8788;
const sockets = new Set();
const live = `<script>new WebSocket("ws://"+location.host+"/live").onmessage=()=>location.reload()</script>`;

watch(".", { recursive: true }, (_, file) => {
  if (!file || /^(\.git|\.wrangler|dist)/.test(file)) return; // .wrangler changes whenever a deck is saved
  for (const s of sockets) s.send("reload");
});

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  websocket: { open: (s) => sockets.add(s), close: (s) => sockets.delete(s), message() {} },
  async fetch(req, server) {
    const url = new URL(req.url), path = url.pathname;
    if (path.startsWith("/api/")) {
      const res = await fetch(`http://localhost:${api}${path}${url.search}`, { method: req.method, body: req.method === "GET" ? undefined : await req.text() });
      // fetch has already decompressed the body; passing the old encoding headers on makes browsers reject it.
      const headers = new Headers(res.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(res.body, { status: res.status, headers });
    }
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
