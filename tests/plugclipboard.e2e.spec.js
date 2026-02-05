const path = require('path');
const http = require('http');
const { test, expect, chromium } = require('@playwright/test');

function start_test_server() {
  const png_base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axn7xkAAAAASUVORK5CYII=';
  const png = Buffer.from(png_base64, 'base64');

  const server = http.createServer((req, res) => {
    if (req.url === '/img.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(png);
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>PlugClipboard Test</title></head>
  <body>
    <p id="text">hello plugclipboard</p>
    <img id="img" src="/img.png" alt="img" />
  </body>
</html>`);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, base_url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function get_extension_id(context) {
  const worker =
    context.serviceWorkers()[0] ||
    (await new Promise((resolve) => context.once('serviceworker', resolve)));
  const url = worker.url();
  const match = url.match(/chrome-extension:\/\/([a-p]{32})\//);
  if (!match) throw new Error(`cannot parse extension id from ${url}`);
  return match[1];
}

async function shadow_eval(page, fn, arg) {
  return page.evaluate(
    ({ fn_src, arg_value }) => {
      const host = document.getElementById('plug-clipboard-host');
      if (!host) throw new Error('host missing');
      const root = host.shadowRoot;
      if (!root) throw new Error('shadowRoot missing');
      const fn = eval(`(${fn_src})`);
      return fn(root, arg_value);
    },
    { fn_src: fn.toString(), arg_value: arg }
  );
}

async function shadow_click(page, selector) {
  await shadow_eval(
    page,
    (root, sel) => {
      const el = root.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      el.click();
    },
    selector
  );
}

async function shadow_text(page, selector) {
  return shadow_eval(
    page,
    (root, sel) => {
      const el = root.querySelector(sel);
      return el ? (el.textContent || '') : '';
    },
    selector
  );
}

test('记录文本并支持多选删除按钮启用', async () => {
  const ext_path = path.resolve(__dirname, '..');
  const { server, base_url } = await start_test_server();

  const context = await chromium.launchPersistentContext('', {
    channel: 'msedge',
    headless: true,
    args: [`--disable-extensions-except=${ext_path}`, `--load-extension=${ext_path}`]
  });

  const page = await context.newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base_url });
  await page.goto(base_url, { waitUntil: 'domcontentloaded' });

  await shadow_eval(page, (root) => !!root.querySelector('.pc-floating-btn'));

  await page.click('#text');
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.press('KeyC');
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');

  const worker =
    context.serviceWorkers()[0] ||
    (await new Promise((resolve) => context.once('serviceworker', resolve)));

  await expect
    .poll(async () => {
      const result = await worker.evaluate(() => chrome.storage.local.get(['clipboardHistory']));
      const history = result && result.clipboardHistory ? result.clipboardHistory : [];
      return history.length;
    })
    .toBeGreaterThan(0);

  await shadow_click(page, '.pc-floating-btn');
  await expect
    .poll(async () => (await shadow_text(page, '.pc-count')).trim())
    .toMatch(/^\d+\/20$/);

  await shadow_click(page, '.pc-btn-select');
  await shadow_click(page, '.pc-check');
  const disabled = await shadow_eval(page, (root) => {
    const btn = root.querySelector('.pc-btn-delete');
    return !!(btn && btn.disabled);
  });
  expect(disabled).toBe(false);

  await context.close();
  await new Promise((resolve) => server.close(resolve));
});

test('图片记录显示缩略图且再次复制走原图链路', async () => {
  const ext_path = path.resolve(__dirname, '..');
  const { server, base_url } = await start_test_server();

  const context = await chromium.launchPersistentContext('', {
    channel: 'msedge',
    headless: true,
    args: [`--disable-extensions-except=${ext_path}`, `--load-extension=${ext_path}`]
  });

  const page = await context.newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base_url });
  await page.goto(base_url, { waitUntil: 'domcontentloaded' });

  await page.click('#img');
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.keyboard.press('KeyC');
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');

  const worker =
    context.serviceWorkers()[0] ||
    (await new Promise((resolve) => context.once('serviceworker', resolve)));

  await expect
    .poll(async () => {
      const result = await worker.evaluate(() => chrome.storage.local.get(['clipboardHistory']));
      const history = result && result.clipboardHistory ? result.clipboardHistory : [];
      const item = history.find((x) => x && (x.type === 'image' || x.type === 'mixed'));
      return item ? (typeof item.image === 'string' ? item.image : '') : '';
    })
    .toMatch(/^data:image\/jpeg;base64,/);

  await shadow_click(page, '.pc-floating-btn');
  await expect
    .poll(async () => (await shadow_eval(page, (root) => root.querySelectorAll('.pc-img-thumb').length)))
    .toBeGreaterThan(0);

  await shadow_eval(page, (root) => {
    const first = root.querySelector('.pc-item');
    if (!first) throw new Error('missing item');
    first.click();
  });

  await expect.poll(async () => (await shadow_text(page, '.pc-toast')).trim()).toMatch(/已复制|复制失败/);

  await context.close();
  await new Promise((resolve) => server.close(resolve));
});
