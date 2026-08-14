import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src');
const publicDir = path.join(root, 'cloudflare-web', 'public');

const read = (name) => fs.readFileSync(path.join(sourceDir, name), 'utf8');

function cloudflareCommonClient() {
  const source = read('CommonClient.html');
  const replacement = `<script>
  function gasCall(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return fetch('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ action: name, args: args }),
      credentials: 'same-origin'
    }).then(function(response) {
      return response.json().catch(function() {
        throw new Error('ระบบส่งผลลัพธ์ไม่ถูกต้อง กรุณาลองใหม่');
      }).then(function(payload) {
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่');
        }
        return payload.data;
      });
    });
  }`;
  const output = source.replace(
    /<script>\s*function gasCall\(name\)[\s\S]*?\n\s*}\n\n\s*function showToast/,
    replacement + '\n\n  function showToast'
  );
  if (output === source || output.includes('google.script.run')) {
    throw new Error('Unable to replace Apps Script client transport');
  }
  return output;
}

function compile(templateName, isAdmin) {
  let html = read(templateName);
  const includes = {
    Styles: read('Styles.html'),
    Icons: read('Icons.html'),
    CommonClient: cloudflareCommonClient(),
    PublicClient: read('PublicClient.html'),
    AdminClient: read('AdminClient.html')
  };

  html = html.replace(/<\?!=\s*include\('([^']+)'\);\s*\?>/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(includes, name)) {
      throw new Error(`Unknown include: ${name}`);
    }
    return includes[name];
  });
  html = html.replace(/\s*<base target="_top">\s*/g, '\n');
  html = html.replace(/href="<\?= appUrl \?>\?page=admin"/g, 'href="/admin/"');
  html = html.replace(/href="<\?= appUrl \?>"/g, 'href="/"');
  html = html.replace('</head>', `  <title>${isAdmin ? 'หลังบ้าน | BMP Booking' : 'BMP Booking'}</title>\n</head>`);

  if (html.includes('<?') || html.includes('google.script.run')) {
    throw new Error(`${templateName} still contains Apps Script-only code`);
  }
  return html;
}

fs.mkdirSync(path.join(publicDir, 'admin'), { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), compile('Index.html', false));
fs.writeFileSync(path.join(publicDir, 'admin', 'index.html'), compile('Admin.html', true));

console.log('Cloudflare pages built: public/index.html and public/admin/index.html');
