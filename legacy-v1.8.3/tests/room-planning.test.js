const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
}

test('room planning filters occupancy by selected night and returns pet names', () => {
  const service = readSource('05_AdminService.gs');
  assert.match(service, /function listRooms\(sessionToken, selectedDate\)/);
  assert.match(service, /booking\.check_in_date <= roomDate/);
  assert.match(service, /booking\.check_out_date > roomDate/);
  assert.match(service, /petNames: petNames/);
  assert.match(service, /bookingId: bookingId/);
});

test('a checked-in booking keeps its assigned room occupied until checkout regardless of booking type', () => {
  const service = readSource('05_AdminService.gs');
  assert.match(service, /var assignedBookings = getAllObjects_\(APP\.SHEETS\.BOOKINGS, BOOKING_HEADERS\)/);
  assert.match(service, /var checkedIn = assignedRoomBookings\.filter/);
  assert.match(service, /booking\.status === APP\.STATUSES\.CHECKED_IN/);
  assert.match(service, /if \(checkedIn\)[\s\S]*displayState = 'OCCUPIED'/);
});

test('available room direct booking is rechecked under the server lock', () => {
  const service = readSource('05_AdminService.gs');
  assert.match(service, /var lock = LockService\.getScriptLock\(\)/);
  assert.match(service, /isRoomAvailableForRange_/);
  assert.match(service, /preferredRoomId/);
});

test('room page has date navigation and clickable room actions', () => {
  const admin = readSource('Admin.html');
  const client = readSource('AdminClient.html');
  assert.match(admin, /id="cat-room-date"/);
  assert.match(admin, /id="dog-room-date"/);
  assert.match(admin, /class="btn btn-light btn-small room-prev-date"/);
  assert.match(admin, /class="btn btn-light btn-small room-next-date"/);
  assert.match(client, /function loadRoomsForDate\(date\)/);
  assert.match(client, /function openRoomCard\(roomId\)/);
});

test('cat and dog rooms are separate sidebar pages', () => {
  const admin = readSource('Admin.html');
  assert.match(admin, /data-view="cat-rooms"/);
  assert.match(admin, />ห้องพักแมว</);
  assert.match(admin, /data-view="dog-rooms"/);
  assert.match(admin, />ห้องพักสุนัข</);
  assert.match(admin, /id="cat-rooms-grid"/);
  assert.match(admin, /id="dog-rooms-grid"/);
});

test('booked room cards show species icon and every pet name', () => {
  const client = readSource('AdminClient.html');
  const styles = readSource('Styles.html');
  assert.match(client, /iconMarkup\(room\.species === 'CAT' \? 'cat' : 'dog'\)/);
  assert.match(client, /room\.petNames \|\| \[\]/);
  assert.match(client, /room-pet-name/);
  assert.match(styles, /\.room-species-icon/);
  assert.match(styles, /color: #fff/);
});
