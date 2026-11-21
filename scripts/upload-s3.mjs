/**
 * S3 API 直传 R2（SigV4 签名，无依赖，高并发）
 *   node scripts/upload-s3.mjs [--minutes N] [--conc N] [--all] [--only category|product|html]
 *
 * 环境变量（或写在下面常量里）：
 *   R2_ACCESS_KEY / R2_SECRET_KEY / R2_ACCOUNT_ID
 */
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'build', 'r2-site');
const BUCKET = 'vn-lotte';
const ACCOUNT = process.env.R2_ACCOUNT_ID || 'a0cda7fea203d85fa222e4bbe2f9f7f4';
const ACCESS = process.env.R2_ACCESS_KEY || 'acb42dae408fbf9cc07e8f92ede3326c';
const SECRET = process.env.R2_SECRET_KEY || '28f81700054968ffcafc620dc73348c50b3abf1c5b322d1646411b15f53c8dfe';
const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
/* 本机 DNS 被代理劫持成 198.18.x（fake-ip），必须钉真实 IP，否则连不上 */
const REAL_IPS = ['172.64.66.1', '172.64.190.1'];
let ipCursor = 0;
const nextIp = () => REAL_IPS[ipCursor++ % REAL_IPS.length];

const args = process.argv.slice(2);
const minutes = args.includes('--minutes') ? Number(args[args.indexOf('--minutes') + 1]) : 0;
const CONC = args.includes('--conc') ? Number(args[args.indexOf('--conc') + 1]) : 40;
const ALL = args.includes('--all');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject', '.txt': 'text/plain; charset=utf-8',
};

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function signRequest(method, key, payloadHash) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto', service = 's3';
  const canonicalUri = '/' + [BUCKET, ...key.split('/').map(encodeURIComponent)].join('/');

  const canonicalHeaders = `host:${HOST}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${SECRET}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    path: canonicalUri,
    headers: {
      host: HOST,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** 直接用真实 IP 建 TLS（SNI/Host 仍是域名），绕开本机 fake-ip DNS */
function putObject(reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const ip = nextIp();
    const req = https.request({
      method: 'PUT',
      host: HOST,
      servername: HOST,
      path: reqPath,
      headers,
      createConnection: () => tls.connect({ host: ip, port: 443, servername: HOST }, () => {}),
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function walk(dir, rel = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(full, r, out);
    else out.push({ full, key: r.replace(/\\/g, '/') });
  }
  return out;
}

/* 选目标 */
const all = await walk(SRC);
let todo = [];
if (ALL) todo = all;
else if (minutes > 0) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  for (const f of all) {
    const st = await stat(f.full);
    if (st.mtimeMs >= cutoff) todo.push(f);
  }
} else {
  todo = all;
}
if (only === 'category') todo = todo.filter((f) => /^vi-nsg\/category\//.test(f.key));
if (only === 'product') todo = todo.filter((f) => /^vi-nsg\/product\//.test(f.key));
if (only === 'html') todo = todo.filter((f) => f.key.endsWith('.html'));

console.log(`目标: ${todo.length} 个文件，并发 ${CONC}`);

let ok = 0, fail = 0;
const failSamples = [];
const started = Date.now();
let i = 0;

async function worker() {
  while (i < todo.length) {
    const item = todo[i++];
    const ext = path.extname(item.key).toLowerCase();
    const ct = MIME[ext] || 'application/octet-stream';

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body = await readFile(item.full);
        const hash = sha256(body);
        const { path: reqPath, headers } = signRequest('PUT', item.key, hash);
        headers['content-type'] = ct;
        headers['content-length'] = String(body.length);

        const res = await putObject(reqPath, headers, body);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`HTTP ${res.status} ${String(res.body).slice(0, 120)}`);
        }
        ok++;
        break;
      } catch (e) {
        if (attempt === 2) {
          fail++;
          if (failSamples.length < 8) failSamples.push(`${item.key}: ${String(e.message || e).slice(0, 110)}`);
        } else {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    const n = ok + fail;
    if (n % 200 === 0) {
      const el = (Date.now() - started) / 1000;
      const rate = n / Math.max(1, el);
      process.stdout.write(`\r  ${n}/${todo.length} ok=${ok} fail=${fail}  ${rate.toFixed(1)}/s  ETA ${((todo.length - n) / rate / 60).toFixed(1)}min   `);
    }
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\n\n完成 ok=${ok} fail=${fail}  ${((Date.now() - started) / 1000 / 60).toFixed(1)}min`);
failSamples.forEach((f) => console.log('  ' + f));
