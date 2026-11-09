const http = require('node:http');
const { createHmac, timingSafeEqual } = require('node:crypto');
const secret = process.env.TREND_WEBHOOK_SECRET;
if (!secret) throw new Error('TREND_WEBHOOK_SECRET is required');

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/github-webhook/') {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  const signature = Buffer.from(req.headers['x-hub-signature-256'] || '');
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    res.writeHead(401).end();
    return;
  }

  const upstream = http.request('http://127.0.0.1:8080/github-webhook/', {
    method: 'POST',
    headers: { ...req.headers, host: 'localhost:8080' }
  }, reply => {
    res.writeHead(reply.statusCode);
    reply.pipe(res);
  });
  upstream.on('error', () => res.writeHead(502).end());
  upstream.end(body);
}).listen(18081, '127.0.0.1', () => console.log('Webhook relay listening on port 18081'));
