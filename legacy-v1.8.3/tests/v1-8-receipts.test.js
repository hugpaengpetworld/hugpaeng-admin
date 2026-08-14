const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const config = read('src/00_Config.gs');
const data = read('src/02_Data.gs');
const service = read('src/13_ReceiptService.gs');
const adminService = read('src/05_AdminService.gs');
const api = read('src/10_ApiService.gs');
const upgrade = read('src/12_UpgradeV1_8.gs');
const client = read('src/AdminClient.html');
const common = read('src/CommonClient.html');
const icons = read('src/Icons.html');
const worker = read('cloudflare-web/src/worker.js');
const template = read('tools/build-template.mjs');

test('v1.8.3 defines receipt sheets, ordered headers, folder property, and permissions', () => {
  assert.match(config, /VERSION:\s*'1\.8\.3'/);
  assert.match(config, /RECEIPTS:\s*'ใบเสร็จ'/);
  assert.match(config, /RECEIPT_ITEMS:\s*'รายการใบเสร็จ'/);
  assert.match(config, /RECEIPT_FOLDER_ID:\s*'BMP_RECEIPT_FOLDER_ID'/);
  assert.match(config, /var RECEIPT_HEADERS/);
  assert.match(config, /var RECEIPT_ITEM_HEADERS/);

  for (const role of ['OWNER', 'DOCTOR', 'STAFF']) {
    const section = config.match(new RegExp(`${role}: \\[([\\s\\S]*?)\\n\\s*\\]`));
    assert.ok(section, `missing ${role} permissions`);
    assert.match(section[1], /receipt:view/);
    assert.match(section[1], /receipt:print/);
  }
});

test('setup and the idempotent v1.8 upgrade create receipt storage', () => {
  assert.match(data, /ensureSheet_\(spreadsheet, APP\.SHEETS\.RECEIPTS, RECEIPT_HEADERS\)/);
  assert.match(data, /ensureSheet_\(spreadsheet, APP\.SHEETS\.RECEIPT_ITEMS, RECEIPT_ITEM_HEADERS\)/);
  assert.match(data, /function ensureReceiptFolder_\(\)/);
  assert.match(upgrade, /function upgradeSystemV1_8\(\)/);
  assert.match(upgrade, /APP\.SHEETS\.RECEIPTS/);
  assert.match(upgrade, /APP\.SHEETS\.RECEIPT_ITEMS/);
  assert.match(upgrade, /ensureReceiptFolder_\(\)/);
  assert.match(upgrade, /อัปเกรดเป็น v1\.8\.1 สำเร็จ/);
});

test('receipt service issues one locked immutable receipt snapshot per checkout', () => {
  assert.match(service, /function getOrCreateReceiptForBooking_/);
  assert.match(service, /LockService\.getScriptLock\(\)/);
  assert.match(service, /findActiveReceiptByBookingId_/);
  assert.match(service, /receipt_status:\s*'ISSUED'/);
  assert.match(service, /BMP-RCP-/);
  assert.match(service, /padStart\(4, '0'\)/);
  assert.match(service, /appendObject_\(APP\.SHEETS\.RECEIPTS, RECEIPT_HEADERS/);
  assert.match(service, /appendObject_\(APP\.SHEETS\.RECEIPT_ITEMS, RECEIPT_ITEM_HEADERS/);
});

test('checkout creates a receipt without reverting a successful room release on print failure', () => {
  assert.match(adminService, /function checkOutBooking\(sessionToken, bookingId, chargeInputs, receiptInput\)/);
  assert.match(adminService, /plannedCheckOutDate > todayIso_\(\)/);
  assert.match(adminService, /normalizedReceiptInput\.confirmEarlyCheckout !== true/);
  assert.match(adminService, /กรุณายืนยันการเช็กเอาต์ก่อนกำหนด/);
  assert.match(adminService, /status:\s*APP\.STATUSES\.CHECKED_OUT/);
  assert.match(adminService, /status:\s*APP\.ROOM_STATUSES\.CLEANING/);
  assert.match(adminService, /issueReceiptForBooking_\(session, checkedOutBooking, normalizedReceiptInput\)/);
  assert.match(adminService, /receiptError:\s*receiptError/);
  assert.match(adminService, /Do not put the animal back into an occupied room/);
});

test('the admin checkout flow collects payment data and prints an 80 mm receipt', () => {
  assert.match(client, /id="checkout-payment-method"/);
  assert.match(client, /id="checkout-receipt-notes"/);
  assert.match(client, /gasCall\('checkOutBooking', adminState\.token, bookingId, charges, receiptInput\)/);
  assert.match(client, /function printReceipt\(bookingId\)/);
  assert.match(client, /gasCall\('getPrintableReceipt', adminState\.token, bookingId\)/);
  assert.match(client, /function boardingDurationLabel\(item\)/);
  assert.match(client, /<th>ระยะเวลา<\/th><th>ใบเสร็จ<\/th>/);
  assert.match(client, /iconMarkup\('printer'\)/);
  assert.match(client, /confirmEarlyCheckout:\s*isEarlyCheckout/);
  assert.match(client, /ยืนยันเช็กเอาต์ก่อนกำหนดหรือไม่/);
  assert.match(client, /ระบบใบเสร็จฝั่งเซิร์ฟเวอร์ยังเป็นรุ่นเดิม/);
  assert.match(client, /Cloudflare รุ่น 1\.8\.3 ใหม่/);
  assert.match(adminService, /nights:\s*Number\(booking\.nights \|\| 0\)/);
  assert.match(common, /'printer'/);
  assert.match(icons, /id="icon-printer"/);
  assert.match(service, /@page\{size:80mm auto/);
  assert.match(service, /onclick="window\.print\(\)"/);
});

test('receipt and admin views format Thai phone numbers with +66', () => {
  assert.match(service, /customer_phone:\s*formatPhoneInternational\(booking\.phone\)/);
  assert.match(service, /customerPhone:\s*formatPhoneInternational\(receipt\.customer_phone\)/);
  assert.match(adminService, /phone:\s*formatPhoneInternational\(booking\.phone\)/);
});

test('receipt API methods are allow-listed in Apps Script and Cloudflare', () => {
  for (const method of ['getReceiptForBooking', 'getPrintableReceipt']) {
    assert.ok(api.includes(`${method}: ${method}`), `Apps Script API must expose ${method}`);
    assert.ok(worker.includes(`'${method}'`), `Cloudflare Worker must allow ${method}`);
  }
});

test('the spreadsheet template includes both receipt sheets with matching headers', () => {
  assert.match(template, /const receiptHeaders = \[/);
  assert.match(template, /const receiptItemHeaders = \[/);
  assert.match(template, /wb\.worksheets\.add\("ใบเสร็จ"\)/);
  assert.match(template, /wb\.worksheets\.add\("รายการใบเสร็จ"\)/);
});
