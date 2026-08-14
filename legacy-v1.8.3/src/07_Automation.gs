/**
 * Time-driven jobs. setupSystem() installs these triggers automatically.
 */

function ensureAutomationTriggers_() {
  var handlers = ScriptApp.getProjectTriggers().map(function (trigger) {
    return trigger.getHandlerFunction();
  });
  if (handlers.indexOf('expireUnpaidLineBookings') === -1) {
    ScriptApp.newTrigger('expireUnpaidLineBookings')
      .timeBased()
      .everyMinutes(5)
      .create();
  }
  if (handlers.indexOf('dailyMaintenance') === -1) {
    ScriptApp.newTrigger('dailyMaintenance')
      .timeBased()
      .everyDays(1)
      .atHour(3)
      .create();
  }
}

function expireUnpaidLineBookings() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var expired = [];
  try {
    var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
    bookings.forEach(function (booking) {
      if (booking.status !== APP.STATUSES.APPROVED_AWAITING_DEPOSIT ||
          booking.source_channel !== APP.CHANNELS.LINE ||
          !booking.payment_deadline ||
          new Date(booking.payment_deadline).getTime() > Date.now()) {
        return;
      }
      if (booking.payment_status === APP.PAYMENT_STATUSES.VERIFIED) return;
      updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
        status: APP.STATUSES.EXPIRED_PAYMENT,
        payment_status: APP.PAYMENT_STATUSES.EXPIRED,
        cancel_reason: 'ไม่ชำระมัดจำภายใน 1 ชั่วโมง',
        updated_at: nowIso_(),
        version: Number(booking.version || 0) + 1
      });
      audit_({
        userId: '',
        username: '',
        role: 'SYSTEM',
        action: 'PAYMENT_EXPIRED',
        entityType: 'BOOKING',
        entityId: booking.booking_id,
        summary: booking.booking_code + ' คืนห้องอัตโนมัติ'
      });
      expired.push(booking);
    });
    if (expired.length) refreshDashboardSheet_();
  } finally {
    lock.releaseLock();
  }
  expired.forEach(function (booking) {
    try {
      sendPaymentExpiredLine_(booking);
    } catch (error) {
      console.error('Unable to notify expired LINE booking ' + booking.booking_code);
    }
  });
  return { expiredCount: expired.length };
}

function dailyMaintenance() {
  cleanupExpiredSessions_();
  refreshDashboardSheet_();
}

function refreshDashboardSheet_() {
  var sheet = getSheet_(APP.SHEETS.DASHBOARD);
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
  var today = todayIso_();
  var rows = [
    ['อัปเดตล่าสุด', nowIso_()],
    ['รออนุมัติห้อง', bookings.filter(function (row) {
      return row.status === APP.STATUSES.PENDING_APPROVAL;
    }).length],
    ['อนุมัติแล้ว รอมัดจำ', bookings.filter(function (row) {
      return row.status === APP.STATUSES.APPROVED_AWAITING_DEPOSIT;
    }).length],
    ['เช็กอินวันนี้', bookings.filter(function (row) {
      return row.check_in_date === today &&
        [APP.STATUSES.CONFIRMED, APP.STATUSES.APPROVED_AWAITING_DEPOSIT]
          .indexOf(row.status) !== -1;
    }).length],
    ['เช็กเอาต์วันนี้', bookings.filter(function (row) {
      return row.check_out_date === today && row.status === APP.STATUSES.CHECKED_IN;
    }).length],
    ['แมวคงเหลือวันนี้', getAvailableCount_(APP.SPECIES.CAT, today, nextDayIso_(today), '')],
    ['สุนัขคงเหลือวันนี้', getAvailableCount_(APP.SPECIES.DOG, today, nextDayIso_(today), '')]
  ];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  }
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.autoResizeColumns(1, 2);
}

function nextDayIso_(isoDate) {
  var date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return toIsoDate(date);
}
