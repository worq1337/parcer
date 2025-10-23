// r2-proxy.js
var r2_proxy_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    try {
      const object = await env.RECEIPT_PARSER_UPDATES.get(key);
      if (object === null) {
        return new Response("Not Found", { status: 404 });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      if (key.endsWith(".yml")) {
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      }
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, {
        headers
      });
    } catch (error) {
      return new Response("Internal Server Error: " + error.message, { status: 500 });
    }
  }
};
export {
  r2_proxy_default as default
};
//# sourceMappingURL=r2-proxy.js.map
