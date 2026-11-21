import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';

const BUCKET = 'vn-lotte';
const ACCOUNT = 'a0cda7fea203d85fa222e4bbe2f9f7f4';
const ACCESS = 'acb42dae408fbf9cc07e8f92ede3326c';
const SECRET = '28f81700054968ffcafc620dc73348c50b3abf1c5b322d1646411b15f53c8dfe';
const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const IPS = ['172.64.66.1', '172.64.190.1'];
let ipc = 0;

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

function sign(method, key, payloadHash) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const ds = amzDate.slice(0, 8);
  const region = 'auto', service = 's3';
  const uri = '/' + [BUCKET, ...key.split('/').map(encodeURIComponent)].join('/');
  const ch = `host:${HOST}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const sh = 'host;x-amz-content-sha256;x-amz-date';
  const cr = [method, uri, '', ch, sh, payloadHash].join('\n');
  const scope = `${ds}/${region}/${service}/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(cr)].join('\n');
  const kD = hmac(`AWS4${SECRET}`, ds), kR = hmac(kD, region), kS = hmac(kR, service), kG = hmac(kS, 'aws4_request');
  const sig = crypto.createHmac('sha256', kG).update(sts).digest('hex');
  return {
    path: uri,
    headers: {
      host: HOST,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${sh}, Signature=${sig}`,
    },
  };
}

function put(reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const ip = IPS[ipc++ % IPS.length];
    const req = https.request({
      method: 'PUT', host: HOST, servername: HOST, path: reqPath, headers,
      createConnection: () => tls.connect({ host: ip, port: 443, servername: HOST }, () => {}),
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.setTimeout(40000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

const KEYS = [
  'vi-nsg/product/bao-dung-viet-9827-weibo-6976693309086-6976693309086-p220773.html',
  'vi-nsg/product/lo-2-bap-nep-8936138400035-8936138400035-p228891.html',
];

for (const key of KEYS) {
  const file = path.join('build/r2-site', key);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body = await readFile(file);
      const { path: p, headers } = sign('PUT', key, sha256(body));
      headers['content-type'] = 'text/html; charset=utf-8';
      headers['content-length'] = String(body.length);
      const r = await put(p, headers, body);
      if (r.status >= 200 && r.status < 300) { console.log(`OK   ${key} (${(body.length / 1024).toFixed(0)}KB)`); break; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (attempt === 3) console.log(`FAIL ${key}: ${String(e.message).slice(0, 80)}`);
      else await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
}
