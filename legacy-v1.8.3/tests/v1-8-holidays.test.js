const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const config = read('src/00_Config.gs');
const data = read('src/02_Data.gs');
const service = read('src/09_SterilizationService.gs');
const api = read('src/10_ApiService.gs');
const upgrade = read('src/12_UpgradeV1_8.gs');
const adminHtml = read('src/Admin.html');
const client = read('src/AdminClient.html');
const styles = read('src/Styles.html');
const worker = read('cloudflare-web/src/worker.js');

test('v1.8 defines a sterilization holiday sheet and authorized roles', () => {
  assert.match(config, /VERSION:\s*'1\.8\.3'/);
  assert.match(config, /STERILIZATION_HOLIDAYS:\s*'วันหยุดทำหมัน'/);
  assert.match(config, /var STERILIZATION_HOLIDAY_HEADERS/);
  const owner = config.match(/OWNER:\s*\[([\s\S]*?)\n\s*\],/)[1];
  const doctor = config.match(/DOCTOR:\s*\[([\s\S]*?)\n\s*\],/)[1];
  const staff = config.match(/STAFF:\s*\[([\s\S]*?)\n\s*\]\s*\n\}\);/)[1];
  assert.match(owner, /sterilization:holiday/);
  assert.match(doctor, /sterilization:holiday/);
  assert.doesNotMatch(staff, /sterilization:holiday/);
});

test('setup and upgrade create the holiday sheet without changing existing data', () => {
  assert.match(data, /ensureSheet_\(spreadsheet, APP\.SHEETS\.STERILIZATION_HOLIDAYS, STERILIZATION_HOLIDAY_HEADERS\)/);
  assert.match(upgrade, /function upgradeSystemV1_8\(\)/);
  assert.match(upgrade, /APP\.SHEETS\.STERILIZATION_HOLIDAYS/);
  assert.match(upgrade, /UPGRADE_V1_8_COMPLETED/);
});

test('server enforces holiday override and records holiday metadata', () => {
  assert.match(service, /function listSterilizationHolidays/);
  assert.match(service, /function saveSterilizationHoliday/);
  assert.match(service, /function removeSterilizationHoliday/);
  assert.match(service, /\[STERILIZATION_HOLIDAY\]/);
  assert.match(service, /payload\.holidayOverride/);
  assert.match(service, /sterilization:holiday/);
  assert.match(service, /holidayReason/);
});

test('calendar uses the agreed pink, red, and purple status colors', () => {
  assert.match(styles, /\.calendar-day\.holiday \{ background: #FF8FAB/);
  assert.match(styles, /\.calendar-day\.full \{ background: #FD464A/);
  assert.match(styles, /\.calendar-day\.over-capacity \{ background: #D7AFF8/);
  assert.match(client, /used > data\.capacity \? ' over-capacity'/);
  assert.match(client, /used === data\.capacity \? ' full'/);
  assert.match(client, /dayData\.holiday \? ' holiday'/);
});

test('owner and doctor can manage holidays and confirm an exceptional booking', () => {
  assert.match(adminHtml, /manage-sterilization-holidays-btn/);
  assert.match(client, /showSterilizationHolidayModal/);
  assert.match(client, /saveSterilizationHoliday/);
  assert.match(client, /removeSterilizationHoliday/);
  assert.match(client, /holidayOverride = true/);
  assert.match(client, /confirm\(/);
});

test('holiday form starts with one row and can append multiple rows before saving', () => {
  assert.match(client, /id="show-ster-holiday-form-btn"/);
  assert.match(client, />\+ เพิ่มวันหยุด<\/button>/);
  assert.match(client, /id="ster-holiday-form" class="holiday-add-form" onsubmit/);
  assert.match(client, /id="ster-holiday-entry-list"/);
  assert.match(client, /function sterilizationHolidayEntryMarkup_/);
  assert.match(client, /function showSterilizationHolidayForm\(\)/);
  assert.match(client, /function removeSterilizationHolidayEntry\(button\)/);
  assert.match(client, /querySelectorAll\(\s*'#ster-holiday-entry-list \.ster-holiday-entry'/);
  assert.match(client, /for \(var j = 0; j < payloads\.length; j \+= 1\)/);
  assert.ok(
    client.indexOf('+ เพิ่มวันหยุด') < client.indexOf('บันทึกวันหยุด'),
    'ปุ่มเพิ่มวันหยุดต้องแสดงก่อนปุ่มบันทึกวันหยุด'
  );
});

test('holiday methods are exposed only through the API allow lists', () => {
  for (const method of ['listSterilizationHolidays', 'saveSterilizationHoliday', 'removeSterilizationHoliday']) {
    assert.ok(api.includes(method), `Apps Script API must expose ${method}`);
    assert.ok(worker.includes(method), `Cloudflare worker must allow ${method}`);
  }
});
