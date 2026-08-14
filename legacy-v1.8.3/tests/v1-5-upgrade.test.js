const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
}

test('v1.5 schema appends group, check-in, age, and vaccination fields', () => {
  const config = readSource('00_Config.gs');
  assert.match(config, /'booking_group_id'/);
  assert.match(config, /'check_in_notes'/);
  assert.match(config, /'age_text'/);
  assert.match(config, /'vaccination_status'/);
  assert.match(readSource('09_SterilizationService.gs'), /function upgradeSystemV1_5\(\)/);
});

test('staff multi-room booking keeps shared owner and separate room pets', () => {
  const service = readSource('05_AdminService.gs');
  const client = readSource('AdminClient.html');
  assert.match(service, /function createStaffMultipleOvernightBookings/);
  assert.match(service, /booking_group_id/);
  assert.match(service, /findAvailableRoomForPlan_/);
  assert.match(client, /จำนวนห้องพักที่ต้องการจอง/);
  assert.match(client, /ชื่อสัตว์ตัวที่/);
  assert.match(client, /น้ำหนักตัวที่/);
});

test('check-in records deposit and notes and checkout supports approved charge categories', () => {
  const service = readSource('05_AdminService.gs');
  const client = readSource('AdminClient.html');
  assert.match(service, /function checkInBooking\(sessionToken, bookingId, input\)/);
  assert.match(service, /check_in_notes/);
  assert.match(service, /ค่าอาหาร.*ค่ายา.*ให้น้ำเกลือ.*ตรวจเลือด.*อื่น ๆ/s);
  assert.match(client, /หมายเหตุการเข้าพัก/);
  assert.match(client, /เพิ่มค่าใช้จ่าย/);
  assert.match(client, /มัดจำที่รับจริง/);
});

test('sterilization calendar marks full and over-capacity days and shows clickable animals', () => {
  const client = readSource('AdminClient.html');
  const styles = readSource('Styles.html');
  assert.match(client, /used > data\.capacity \? ' over-capacity'/);
  assert.match(client, /prefix \+ '-' \+ item\.petName \+ '\/' \+ sexLabel/);
  assert.match(client, /openSterilizationDetail/);
  assert.match(styles, /\.calendar-day\.full \{ background: #FD464A/);
  assert.match(styles, /\.calendar-day\.over-capacity \{ background: #D7AFF8/);
});

test('sterilization appointment captures age and vaccination', () => {
  const service = readSource('09_SterilizationService.gs');
  const client = readSource('AdminClient.html');
  assert.match(service, /ageText/);
  assert.match(service, /vaccinationStatus/);
  assert.match(client, /ster-age/);
  assert.match(client, /ster-vaccination/);
});
