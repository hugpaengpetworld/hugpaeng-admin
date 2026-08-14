/**
 * One-time, idempotent upgrade for an existing v1.6.x spreadsheet.
 *
 * - Renames C01-C11 to CAT01-CAT11 and D01-D07 to DOG01-DOG07.
 * - Updates assigned_room_id without changing any existing booking_code.
 * - Consolidates a temporary old/new duplicate room pair safely.
 * - Rebuilds current_booking_id from CHECKED_IN bookings so actual occupancy
 *   remains authoritative until checkout.
 *
 * Run upgradeSystemV1_7() once after copying every v1.7 source file.
 */
function upgradeSystemV1_7() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = getSpreadsheet_();
    ensureSheet_(spreadsheet, APP.SHEETS.ROOMS, ROOM_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.BOOKINGS, BOOKING_HEADERS);

    var changedBookings = migrateBookingRoomReferencesV1_7_();
    var roomResult = migrateRoomIdsV1_7_();
    seedRooms_();
    var repairedOccupancy = repairCurrentRoomBookingsV1_7_();

    PropertiesService.getScriptProperties().setProperty(
      APP.PROPERTY_KEYS.UPGRADE_V1_7_COMPLETED,
      nowIso_()
    );
    refreshDashboardSheet_();

    var result = {
      ok: true,
      changedBookings: changedBookings,
      renamedRooms: roomResult.renamed,
      mergedRooms: roomResult.merged,
      repairedOccupancy: repairedOccupancy
    };
    console.log(
      'อัปเกรดเป็น v1.7 สำเร็จ: เปลี่ยนรหัสห้อง ' + result.renamedRooms +
      ' ห้อง, รวมข้อมูลซ้ำ ' + result.mergedRooms +
      ' ห้อง, ปรับรายการจอง ' + result.changedBookings +
      ' รายการ และซ่อมสถานะห้องที่กำลังเข้าพัก ' + result.repairedOccupancy + ' ห้อง'
    );
    return result;
  } finally {
    lock.releaseLock();
  }
}

function canonicalRoomIdV1_7_(roomId) {
  var value = String(roomId || '').trim().toUpperCase();
  if (/^C\d{2}$/.test(value)) return 'CAT' + value.substring(1);
  if (/^D\d{2}$/.test(value)) return 'DOG' + value.substring(1);
  return value;
}

function roomNameV1_7_(roomId, species) {
  return (species === APP.SPECIES.DOG ? 'ห้องพักสุนัข ' : 'ห้องพักแมว ') + roomId;
}

function migrateBookingRoomReferencesV1_7_() {
  var changed = 0;
  getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS).forEach(function (booking) {
    var currentRoomId = String(booking.assigned_room_id || '').trim().toUpperCase();
    var nextRoomId = canonicalRoomIdV1_7_(currentRoomId);
    if (!currentRoomId || currentRoomId === nextRoomId) return;
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      assigned_room_id: nextRoomId,
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    changed += 1;
  });
  return changed;
}

function migrateRoomIdsV1_7_() {
  var sheet = getSheet_(APP.SHEETS.ROOMS);
  var rooms = getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS);
  var byId = {};
  rooms.forEach(function (room) {
    byId[String(room.room_id || '').trim().toUpperCase()] = room;
  });
  var duplicateRows = [];
  var renamed = 0;
  var merged = 0;

  rooms.forEach(function (legacyRoom) {
    var legacyId = String(legacyRoom.room_id || '').trim().toUpperCase();
    var canonicalId = canonicalRoomIdV1_7_(legacyId);
    if (!legacyId || legacyId === canonicalId) return;

    var species = canonicalId.indexOf('DOG') === 0 ? APP.SPECIES.DOG : APP.SPECIES.CAT;
    var canonicalRoom = byId[canonicalId];
    if (canonicalRoom) {
      var changes = {
        room_name: roomNameV1_7_(canonicalId, species),
        species: species,
        updated_at: nowIso_()
      };
      if (!canonicalRoom.current_booking_id && legacyRoom.current_booking_id) {
        changes.current_booking_id = legacyRoom.current_booking_id;
      }
      if (canonicalRoom.status === APP.ROOM_STATUSES.AVAILABLE &&
          legacyRoom.status && legacyRoom.status !== APP.ROOM_STATUSES.AVAILABLE) {
        changes.status = legacyRoom.status;
      }
      if (!canonicalRoom.notes && legacyRoom.notes) changes.notes = legacyRoom.notes;
      updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, canonicalRoom._row, changes);
      duplicateRows.push(legacyRoom._row);
      merged += 1;
      return;
    }

    updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, legacyRoom._row, {
      room_id: canonicalId,
      room_name: roomNameV1_7_(canonicalId, species),
      species: species,
      updated_at: nowIso_()
    });
    byId[canonicalId] = legacyRoom;
    renamed += 1;
  });

  duplicateRows.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });
  return { renamed: renamed, merged: merged };
}

function repairCurrentRoomBookingsV1_7_() {
  var checkedInByRoom = {};
  getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS).forEach(function (booking) {
    if (booking.status !== APP.STATUSES.CHECKED_IN || !booking.assigned_room_id) return;
    var roomId = canonicalRoomIdV1_7_(booking.assigned_room_id);
    if (checkedInByRoom[roomId] && checkedInByRoom[roomId] !== booking.booking_id) {
      throw new Error('พบสัตว์กำลังเข้าพักซ้ำในห้อง ' + roomId + ' กรุณาตรวจข้อมูลก่อนอัปเกรด');
    }
    checkedInByRoom[roomId] = booking.booking_id;
  });

  var repaired = 0;
  getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS).forEach(function (room) {
    var expectedBookingId = checkedInByRoom[room.room_id] || '';
    if (String(room.current_booking_id || '') === String(expectedBookingId)) return;
    updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, room._row, {
      current_booking_id: expectedBookingId,
      updated_at: nowIso_()
    });
    repaired += 1;
  });
  return repaired;
}
