/* [ltm-clone] 临时上传入口：把文件通过 HTTP 灌进 R2，用完即删。
 * POST /upload?key=<路径>   body=文件内容   header: x-upload-key
 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/ping') {
      return new Response('pong', { headers: { 'content-type': 'text/plain' } });
    }

    if (url.pathname === '/upload' && req.method === 'POST') {
      if (req.headers.get('x-upload-key') !== env.UPLOAD_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      const key = url.searchParams.get('key');
      if (!key) return new Response('missing key', { status: 400 });

      const contentType = req.headers.get('content-type') || 'application/octet-stream';
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return new Response('empty body', { status: 400 });

      await env.BUCKET.put(key, buf, {
        httpMetadata: { contentType, cacheControl: key.endsWith('.html') ? 'no-cache' : 'public, max-age=86400' },
      });
      return new Response(JSON.stringify({ ok: true, key, bytes: buf.byteLength }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/keys') {
      if (req.headers.get('x-upload-key') !== env.UPLOAD_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      const keys = [];
      let cursor = undefined;
      do {
        const page = await env.BUCKET.list({ limit: 1000, cursor });
        for (const o of page.objects) keys.push(o.key);
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return new Response(JSON.stringify({ count: keys.length, keys }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/stats') {
      let count = 0, cursor = undefined;
      do {
        const page = await env.BUCKET.list({ limit: 1000, cursor });
        count += page.objects.length;
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return new Response(JSON.stringify({ objects: count }), { headers: { 'content-type': 'application/json' } });
    }

    return new Response('uploader ready', { status: 200 });
  },
};
