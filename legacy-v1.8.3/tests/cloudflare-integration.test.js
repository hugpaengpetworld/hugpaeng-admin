const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

test('compiled Cloudflare pages use same-origin API without Apps Script templates', () => {
  const publicHtml = fs.readFileSync(path.join(root, 'cloudflare-web', 'public', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(root, 'cloudflare-web', 'public', 'admin', 'index.html'), 'utf8');
  for (const html of [publicHtml, adminHtml]) {
    assert.doesNotMatch(html, /google\.script\.run|<\?/);
    assert.match(html, /fetch\('\/api'/);
  }
  assert.match(publicHtml, /href="\/admin\/"/);
  assert.match(adminHtml, /href="\/"/);
});

test('Apps Script API uses a gateway key and an explicit action allow-list', () => {
  const config = fs.readFileSync(path.join(root, 'src', '00_Config.gs'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src', '10_ApiService.gs'), 'utf8');
  assert.match(config, /API_GATEWAY_KEY:\s*'BMP_API_GATEWAY_KEY'/);
  assert.match(api, /constantTimeEqual_/);
  assert.match(api, /Object\.prototype\.hasOwnProperty\.call\(handlers, action\)/);
  assert.match(api, /createPublicBooking:\s*createPublicBooking/);
  assert.match(api, /getAdminBootstrap:\s*getAdminBootstrap/);
  assert.doesNotMatch(api, /globalThis\s*\[|this\s*\[\s*action\s*\]/);
});

test('Worker rejects unknown API actions before forwarding', async () => {
  const workerUrl = pathToFileURL(path.join(root, 'cloudflare-web', 'src', 'worker.js')).href;
  const worker = (await import(workerUrl)).default;
  const response = await worker.fetch(new Request('https://bmpbooking.example/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'deleteEverything', args: [] })
  }), {
    GAS_API_URL: 'https://script.google.com/macros/s/example/exec',
    GAS_GATEWAY_KEY: 'secret',
    ASSETS: { fetch: () => new Response('asset') }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
});

test('Worker adds the secret only while proxying an allowed action', async () => {
  const workerUrl = pathToFileURL(path.join(root, 'cloudflare-web', 'src', 'worker.js')).href;
  const worker = (await import(workerUrl)).default;
  const originalFetch = global.fetch;
  let forwarded;
  global.fetch = async (url, init) => {
    forwarded = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ ok: true, data: { clinicName: 'BMP' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const response = await worker.fetch(new Request('https://bmpbooking.example/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'getPublicConfig', args: [] })
    }), {
      GAS_API_URL: 'https://script.google.com/macros/s/example/exec',
      GAS_GATEWAY_KEY: 'server-only-secret',
      ASSETS: { fetch: () => new Response('asset') }
    });
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, 'https://script.google.com/macros/s/example/exec');
    assert.equal(forwarded.body.gatewayKey, 'server-only-secret');
    assert.equal(forwarded.body.action, 'getPublicConfig');
    assert.deepEqual(forwarded.body.args, []);
  } finally {
    global.fetch = originalFetch;
  }
});
