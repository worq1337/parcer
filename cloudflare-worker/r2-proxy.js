/**
 * Cloudflare Worker для публичного доступа к R2 bucket
 * Разверните этот worker и привяжите к R2 bucket
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // Убираем первый слэш

    // Только GET запросы
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // Получаем объект из R2
      const object = await env.RECEIPT_PARSER_UPDATES.get(key);

      if (object === null) {
        return new Response('Not Found', { status: 404 });
      }

      // Определяем Content-Type
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      // Для .yml файлов - no-cache
      if (key.endsWith('.yml')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        // Для бинарников - долгий кеш
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }

      // CORS заголовки (если нужно)
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, {
        headers,
      });
    } catch (error) {
      return new Response('Internal Server Error: ' + error.message, { status: 500 });
    }
  },
};
