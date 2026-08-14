const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
}

test('central SVG sprite defines every admin navigation icon', () => {
  const icons = readSource('Icons.html');
  [
    'dashboard', 'boarding', 'bookings', 'rooms', 'sterilization', 'calendar',
    'list', 'finance', 'users', 'settings', 'menu', 'close', 'logout',
    'chevron-down', 'cat', 'dog'
  ].forEach((name) => assert.match(icons, new RegExp(`id="icon-${name}"`)));
});

test('admin navigation uses SVG icons instead of legacy text symbols', () => {
  const admin = readSource('Admin.html');
  assert.match(admin, /include\('Icons'\)/);
  assert.match(admin, /href="#icon-dashboard"/);
  assert.match(admin, /href="#icon-sterilization"/);
  assert.match(admin, /href="#icon-settings"/);
  assert.doesNotMatch(admin, /[▦▣✚฿♙⚙•☰✕]/);
});

test('sidebar SVG icons inherit white currentColor', () => {
  const styles = readSource('Styles.html');
  assert.match(styles, /\.app-icon[\s\S]*stroke: currentColor/);
  assert.match(styles, /\.nav-icon \.app-icon[^{]*\{[^}]*color: #fff/);
});
