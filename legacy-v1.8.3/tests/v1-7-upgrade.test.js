const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const config = read('src/00_Config.gs');
const data = read('src/02_Data.gs');
const adminService = read('src/05_AdminService.gs');
const adminHtml = read('src/Admin.html');
const adminClient = read('src/AdminClient.html');
const upgrade = read('src/11_UpgradeV1_7.gs');
const templateBuilder = read('tools/build-template.mjs');

test('v1.7 uses canonical CAT and DOG room identifiers', () => {
  assert.match(config, /VERSION:\s*'1\.8\.3'/);
  assert.match(data, /var catId = 'CAT' \+ String\(cat\)\.padStart\(2, '0'\)/);
  assert.match(data, /var dogId = 'DOG' \+ String\(dog\)\.padStart\(2, '0'\)/);
  assert.match(data, /ห้องพักแมว/);
  assert.match(data, /ห้องพักสุนัข/);
});

test('setup does not recreate legacy room duplicates during an upgrade', () => {
  assert.match(data, /!existingIds\[catId\] && !existingIds\[legacyCatId\]/);
  assert.match(data, /!existingIds\[dogId\] && !existingIds\[legacyDogId\]/);
});

test('downloadable spreadsheet template starts with canonical room IDs and contact-hour wording', () => {
  assert.ok(templateBuilder.includes('const id = `CAT${String(i).padStart(2, "0")}`;'));
  assert.ok(templateBuilder.includes('const id = `DOG${String(i).padStart(2, "0")}`;'));
  assert.ok(templateBuilder.includes('`ห้องพักแมว ${id}`'));
  assert.ok(templateBuilder.includes('ไม่จำกัดเวลาเช็กอิน/เช็กเอาท์'));
  assert.doesNotMatch(templateBuilder, /const id = `C\$\{String\(i\)/);
  assert.doesNotMatch(templateBuilder, /const id = `D\$\{String\(i\)/);
});

test('upgrade maps legacy room IDs without changing immutable booking codes', () => {
  assert.match(upgrade, /function upgradeSystemV1_7\(\)/);
  assert.match(upgrade, /return 'CAT' \+ value\.substring\(1\)/);
  assert.match(upgrade, /return 'DOG' \+ value\.substring\(1\)/);
  assert.match(upgrade, /assigned_room_id:\s*nextRoomId/);
  assert.doesNotMatch(upgrade, /booking_code\s*:/);
});

test('upgrade repairs room occupancy from checked-in bookings', () => {
  assert.match(upgrade, /booking\.status !== APP\.STATUSES\.CHECKED_IN/);
  assert.match(upgrade, /current_booking_id:\s*expectedBookingId/);
  assert.match(upgrade, /พบสัตว์กำลังเข้าพักซ้ำในห้อง/);
});

test('checked-in occupancy overrides the planning date until checkout', () => {
  const checkedInBlock = adminService.indexOf('var checkedIn = assignedRoomBookings.filter');
  const roomStatusBlock = adminService.indexOf('room.status !== APP.ROOM_STATUSES.AVAILABLE', checkedInBlock);
  assert.ok(checkedInBlock >= 0, 'must find the checked-in booking before rendering a room');
  assert.ok(roomStatusBlock > checkedInBlock, 'checked-in occupancy must win over physical room flags');
  assert.match(adminService, /if \(checkedIn\) \{[\s\S]*displayState = 'OCCUPIED';[\s\S]*displayLabel = 'กำลังเข้าพัก';/);
});

test('operations use the requested tabs, species filters, and six columns', () => {
  assert.match(adminHtml, />รอเช็คอิน</);
  assert.match(adminHtml, />กำลังเข้าพัก\/รอเช็กเอาท์</);
  assert.match(adminHtml, /data-species="CAT"[^>]*>แมว</);
  assert.match(adminHtml, /data-species="DOG"[^>]*>สุนัข</);
  assert.match(adminClient, /mode === 'checkin'[^\n]*item\.status === 'CONFIRMED'/);
  assert.match(adminClient, /mode === 'active'[^\n]*item\.status === 'CHECKED_IN'/);
  assert.match(adminClient, /<th>รหัสการจอง<\/th><th>เจ้าของ<\/th><th>ชื่อสัตว์เลี้ยง<\/th><th>ห้องพัก<\/th>/);
  assert.match(adminClient, /<th>วันเข้า<\/th><th>วันออก<\/th>/);
});

test('booking detail assigns from a species-specific room dropdown', () => {
  assert.match(adminClient, /function bookingRoomSelector_\(booking, assignableRooms\)/);
  assert.match(adminClient, /onchange="assignBookingRoomFromSelect/);
  assert.doesNotMatch(adminClient, /กำหนดห้อง<\/button>/);
  assert.match(adminService, /room\.species !== booking\.species/);
  assert.match(adminService, /listAssignableRoomsForBooking_/);
});
