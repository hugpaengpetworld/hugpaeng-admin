const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
}

test('public and admin pages declare a responsive viewport', () => {
  const viewport = /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/;
  assert.match(readSource('Index.html'), viewport);
  assert.match(readSource('Admin.html'), viewport);
});

test('public and admin pages declare UTF-8 before rendering Thai text', () => {
  const charset = /<meta charset="UTF-8">/;
  assert.match(readSource('Index.html'), charset);
  assert.match(readSource('Admin.html'), charset);
});

test('admin navigation has accessible drawer controls', () => {
  const admin = readSource('Admin.html');
  const client = readSource('AdminClient.html');
  assert.match(admin, /id="sidebar-toggle"/);
  assert.match(admin, /aria-controls="admin-sidebar"/);
  assert.match(admin, /id="sidebar-close"/);
  assert.match(admin, /id="sidebar-backdrop"/);
  assert.match(client, /function openAdminSidebar\(\)/);
  assert.match(client, /function closeAdminSidebar\(\)/);
});

test('responsive stylesheet covers tablet and phone layouts', () => {
  const styles = readSource('Styles.html');
  assert.match(styles, /@media \(max-width: 1024px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.admin-shell\.sidebar-open \.sidebar/);
});
