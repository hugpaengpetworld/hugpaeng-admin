/**
 * Staff-only sterilization appointment module.
 * Each row represents one animal. Capacity is protected by ScriptLock so two
 * staff members cannot consume the last slot at the same time.
 */

function listSterilizationAppointments(sessionToken, filters) {
  requirePermission_(sessionToken, 'sterilization:view');
  var query = filters || {};
  if (query.date) query.date = normalizeDateInput(query.date);
  return getAllObjects_(APP.SHEETS.STERILIZATIONS, STERILIZATION_HEADERS)
    .filter(function (appointment) {
      if (query.date && appointment.appointment_date !== query.date) return false;
      if (query.status && appointment.status !== query.status) return false;
      if (query.search) {
        var haystack = [
          appointment.appointment_code,
          appointment.customer_name,
          appointment.phone,
          appointment.pet_name
        ].join(' ').toLowerCase();
        if (haystack.indexOf(String(query.search).toLowerCase()) === -1) return false;
      }
      return true;
    })
    .sort(function (a, b) {
      return (
        String(a.appointment_date) + ' ' + String(a.appointment_time)
      ).localeCompare(
        String(b.appointment_date) + ' ' + String(b.appointment_time)
      );
    })
    .slice(0, 500)
    .map(publicSterilizationAppointment_);
}

function getSterilizationCalendar(sessionToken, monthValue) {
  requirePermission_(sessionToken, 'sterilization:view');
  var month = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');
  var settings = getSettingsMap_();
  var capacity = Number(settings.sterilization_daily_capacity || 4);
  var appointmentsByDate = {};
  var holidaysByDate = {};
  getAllObjects_(APP.SHEETS.STERILIZATIONS, STERILIZATION_HEADERS)
    .filter(function (appointment) {
      return String(appointment.appointment_date).indexOf(month + '-') === 0 &&
        sterilizationStatusConsumesCapacity(appointment.status);
    })
    .forEach(function (appointment) {
      var date = appointment.appointment_date;
      if (!appointmentsByDate[date]) appointmentsByDate[date] = [];
      appointmentsByDate[date].push(publicSterilizationAppointment_(appointment));
    });
  getSterilizationHolidaysForMonth_(month).forEach(function (holiday) {
    holidaysByDate[holiday.holiday_date] = holiday;
  });
  var calendarDates = {};
  Object.keys(appointmentsByDate).forEach(function (date) { calendarDates[date] = true; });
  Object.keys(holidaysByDate).forEach(function (date) { calendarDates[date] = true; });
  return {
    month: month,
    capacity: capacity,
    days: Object.keys(calendarDates).sort().map(function (date) {
      var appointments = appointmentsByDate[date] || [];
      var holiday = holidaysByDate[date] || null;
      return {
        date: date,
        count: appointments.length,
        remaining: Math.max(0, capacity - appointments.length),
        full: appointments.length === capacity,
        overCapacity: appointments.length > capacity,
        holiday: Boolean(holiday),
        holidayReason: holiday ? String(holiday.reason || '') : '',
        appointments: appointments
      };
    })
  };
}

function listSterilizationHolidays(sessionToken, monthValue) {
  requirePermission_(sessionToken, 'sterilization:holiday');
  var month = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');
  return getSterilizationHolidaysForMonth_(month).map(publicSterilizationHoliday_);
}

function saveSterilizationHoliday(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'sterilization:holiday');
  var payload = input || {};
  var holidayDate = normalizeDateInput(payload.holidayDate);
  var reason = cleanText_(payload.reason, 300);
  if (!reason) reason = 'วันหยุดรับทำหมัน';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = getActiveSterilizationHoliday_(holidayDate);
    var timestamp = nowIso_();
    if (existing) {
      updateObjectRow_(
        APP.SHEETS.STERILIZATION_HOLIDAYS,
        STERILIZATION_HOLIDAY_HEADERS,
        existing._row,
        { reason: reason, active: true, updated_at: timestamp }
      );
    } else {
      appendObject_(APP.SHEETS.STERILIZATION_HOLIDAYS, STERILIZATION_HOLIDAY_HEADERS, {
        holiday_id: newId_('STER-HOL'),
        holiday_date: holidayDate,
        reason: reason,
        active: true,
        created_by: session.user_id,
        created_at: timestamp,
        updated_at: timestamp
      });
    }
    auditFromSession_(
      session,
      'STERILIZATION_HOLIDAY_SAVED',
      'STERILIZATION_HOLIDAY',
      holidayDate,
      reason
    );
    return { ok: true, holidayDate: holidayDate, reason: reason };
  } finally {
    lock.releaseLock();
  }
}

function removeSterilizationHoliday(sessionToken, holidayId) {
  var session = requirePermission_(sessionToken, 'sterilization:holiday');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var holiday = findObject_(
      APP.SHEETS.STERILIZATION_HOLIDAYS,
      STERILIZATION_HOLIDAY_HEADERS,
      'holiday_id',
      String(holidayId || '')
    );
    if (!holiday || !isActiveSterilizationHolidayFlag_(holiday.active)) {
      throw new Error('ไม่พบวันหยุดทำหมันที่ต้องการยกเลิก');
    }
    updateObjectRow_(
      APP.SHEETS.STERILIZATION_HOLIDAYS,
      STERILIZATION_HOLIDAY_HEADERS,
      holiday._row,
      { active: false, updated_at: nowIso_() }
    );
    auditFromSession_(
      session,
      'STERILIZATION_HOLIDAY_REMOVED',
      'STERILIZATION_HOLIDAY',
      holiday.holiday_id,
      holiday.holiday_date + ' ' + String(holiday.reason || '')
    );
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function createSterilizationAppointment(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'sterilization:create');
  var payload = validateSterilizationAppointment_(input || {});
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var settings = getSettingsMap_();
    var capacity = Number(settings.sterilization_daily_capacity || 4);
    var currentCount = countSterilizationCapacity_(payload.appointmentDate, '');
    var holiday = getActiveSterilizationHoliday_(payload.appointmentDate);
    if (holiday && !payload.holidayOverride) {
      throw new Error(
        '[STERILIZATION_HOLIDAY] วันที่ ' + payload.appointmentDate +
        ' ตั้งเป็นวันหยุดทำหมัน: ' + String(holiday.reason || 'วันหยุด') +
        ' เจ้าของหรือหมอสามารถยืนยันรับจองแบบยกเว้นได้'
      );
    }
    if (holiday && payload.holidayOverride &&
        (PERMISSIONS[session.role] || []).indexOf('sterilization:holiday') === -1) {
      throw new Error('เฉพาะเจ้าของหรือหมอเท่านั้นที่รับจองทำหมันในวันหยุดได้');
    }

    var appointmentId = newId_('STER');
    var appointmentCode = createUniqueSterilizationCode_(payload.appointmentDate);
    appendObject_(APP.SHEETS.STERILIZATIONS, STERILIZATION_HEADERS, {
      appointment_id: appointmentId,
      appointment_code: appointmentCode,
      appointment_date: payload.appointmentDate,
      appointment_time: payload.appointmentTime,
      customer_name: payload.customerName,
      phone: payload.phone,
      pet_name: payload.petName,
      species: payload.species,
      sex: payload.sex,
      breed: payload.breed,
      weight_kg: payload.weightKg,
      source_channel: payload.sourceChannel,
      status: APP.STERILIZATION_STATUSES.PENDING_CONFIRMATION,
      notes: payload.notes,
      created_by: session.user_id,
      created_at: nowIso_(),
      updated_at: nowIso_(),
      age_text: payload.ageText,
      vaccination_status: payload.vaccinationStatus
    });
    auditFromSession_(
      session,
      'STERILIZATION_CREATED',
      'STERILIZATION',
      appointmentId,
      appointmentCode + ' วันที่ ' + payload.appointmentDate
    );
    if (holiday && payload.holidayOverride) {
      auditFromSession_(
        session,
        'STERILIZATION_HOLIDAY_OVERRIDE',
        'STERILIZATION',
        appointmentId,
        appointmentCode + ' ยกเว้นวันหยุด ' + payload.appointmentDate +
          ' (' + String(holiday.reason || 'วันหยุด') + ')'
      );
    }
    return {
      ok: true,
      appointmentId: appointmentId,
      appointmentCode: appointmentCode,
      status: APP.STERILIZATION_STATUSES.PENDING_CONFIRMATION,
      remaining: Math.max(0, capacity - currentCount - 1)
    };
  } finally {
    lock.releaseLock();
  }
}

function updateSterilizationAppointmentStatus(sessionToken, appointmentId, statusValue) {
  var session = requirePermission_(sessionToken, 'sterilization:update');
  var status = String(statusValue || '').toUpperCase();
  var allowed = Object.keys(APP.STERILIZATION_STATUSES).map(function (key) {
    return APP.STERILIZATION_STATUSES[key];
  });
  if (allowed.indexOf(status) === -1) throw new Error('สถานะนัดทำหมันไม่ถูกต้อง');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var appointment = findObject_(
      APP.SHEETS.STERILIZATIONS,
      STERILIZATION_HEADERS,
      'appointment_id',
      appointmentId
    );
    if (!appointment) throw new Error('ไม่พบรายการนัดทำหมัน');
    // Staff and doctors may intentionally create or restore an over-capacity
    // appointment. The calendar highlights this operational exception.
    updateObjectRow_(
      APP.SHEETS.STERILIZATIONS,
      STERILIZATION_HEADERS,
      appointment._row,
      { status: status, updated_at: nowIso_() }
    );
    auditFromSession_(
      session,
      'STERILIZATION_STATUS_UPDATED',
      'STERILIZATION',
      appointmentId,
      appointment.appointment_code + ' → ' + status
    );
    return { ok: true, status: status, statusLabel: sterilizationStatusLabel_(status) };
  } finally {
    lock.releaseLock();
  }
}

function validateSterilizationAppointment_(input) {
  var appointmentDate = normalizeDateInput(input.appointmentDate);
  if (appointmentDate < todayIso_()) throw new Error('วันนัดต้องไม่เป็นวันที่ผ่านมาแล้ว');
  var appointmentTime = String(input.appointmentTime || '');
  parseTimeMinutes(appointmentTime);
  var customerName = cleanText_(input.customerName, 120);
  var phone = normalizePhone(input.phone);
  var petName = cleanText_(input.petName, 100);
  if (!customerName) throw new Error('กรุณาระบุชื่อผู้จอง');
  if (!/^0\d{8,9}$/.test(phone)) throw new Error('กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง');
  if (!petName) throw new Error('กรุณาระบุชื่อสัตว์');
  var sourceChannel = String(input.sourceChannel || APP.CHANNELS.PHONE).toUpperCase();
  if (!isStaffOnlyChannel(sourceChannel)) {
    throw new Error('คิวทำหมันรับจองเฉพาะช่องทางหลังบ้าน');
  }
  var rawWeight = String(input.weightKg || '').trim();
  var weightKg = rawWeight === '' ? '' : Number(rawWeight);
  if (weightKg !== '' && (!Number.isFinite(weightKg) || weightKg <= 0)) {
    throw new Error('น้ำหนักสัตว์ไม่ถูกต้อง');
  }
  var species = normalizeSterilizationSpecies(
    input.speciesCategory,
    input.speciesOther
  );
  var sex = normalizeSterilizationSex(input.sex);
  return {
    appointmentDate: appointmentDate,
    appointmentTime: appointmentTime,
    customerName: customerName,
    phone: phone,
    petName: petName,
    species: species,
    sex: sex,
    breed: cleanText_(input.breed, 100),
    weightKg: weightKg,
    ageText: cleanText_(input.ageText, 60),
    vaccinationStatus: cleanText_(input.vaccinationStatus, 200),
    sourceChannel: sourceChannel,
    notes: cleanText_(input.notes, 1000),
    holidayOverride: input.holidayOverride === true
  };
}

function getSterilizationHolidaysForMonth_(monthValue) {
  return getAllObjects_(APP.SHEETS.STERILIZATION_HOLIDAYS, STERILIZATION_HOLIDAY_HEADERS)
    .filter(function (holiday) {
      return String(holiday.holiday_date || '').indexOf(monthValue + '-') === 0 &&
        isActiveSterilizationHolidayFlag_(holiday.active);
    })
    .sort(function (a, b) {
      return String(a.holiday_date).localeCompare(String(b.holiday_date));
    });
}

function getActiveSterilizationHoliday_(dateValue) {
  var date = String(dateValue || '');
  var matches = getAllObjects_(
    APP.SHEETS.STERILIZATION_HOLIDAYS,
    STERILIZATION_HOLIDAY_HEADERS
  ).filter(function (holiday) {
    return holiday.holiday_date === date && isActiveSterilizationHolidayFlag_(holiday.active);
  });
  return matches.length ? matches[matches.length - 1] : null;
}

function isActiveSterilizationHolidayFlag_(value) {
  if (value === true || value === 1) return true;
  var normalized = String(value || '').trim().toUpperCase();
  return normalized === 'TRUE' || normalized === '1' || normalized === 'YES' ||
    normalized === 'ACTIVE';
}

function publicSterilizationHoliday_(holiday) {
  return {
    holidayId: holiday.holiday_id,
    holidayDate: holiday.holiday_date,
    reason: holiday.reason,
    active: isActiveSterilizationHolidayFlag_(holiday.active)
  };
}

function countSterilizationCapacity_(dateValue, ignoreAppointmentId) {
  return getAllObjects_(APP.SHEETS.STERILIZATIONS, STERILIZATION_HEADERS)
    .filter(function (appointment) {
      return appointment.appointment_id !== ignoreAppointmentId &&
        appointment.appointment_date === dateValue &&
        sterilizationStatusConsumesCapacity(appointment.status);
    }).length;
}

function createUniqueSterilizationCode_(dateValue) {
  var dateCode = String(dateValue || '').replace(/-/g, '');
  for (var attempt = 0; attempt < 20; attempt += 1) {
    var suffix = String(Math.floor(1000 + Math.random() * 9000));
    var code = 'SPAY-' + dateCode + '-' + suffix;
    if (!findObject_(
      APP.SHEETS.STERILIZATIONS,
      STERILIZATION_HEADERS,
      'appointment_code',
      code
    )) return code;
  }
  throw new Error('ไม่สามารถสร้างรหัสนัดได้ กรุณาลองอีกครั้ง');
}

function sterilizationStatusLabel_(status) {
  var labels = {};
  labels[APP.STERILIZATION_STATUSES.PENDING_CONFIRMATION] = 'รอยืนยันนัด';
  labels[APP.STERILIZATION_STATUSES.CONFIRMED] = 'ยืนยันนัดแล้ว';
  labels[APP.STERILIZATION_STATUSES.ARRIVED] = 'มาถึงคลินิกแล้ว';
  labels[APP.STERILIZATION_STATUSES.COMPLETED] = 'ดำเนินการเสร็จแล้ว';
  labels[APP.STERILIZATION_STATUSES.CANCELLED] = 'ยกเลิก';
  labels[APP.STERILIZATION_STATUSES.NO_SHOW] = 'ไม่มาตามนัด';
  return labels[status] || status;
}

function publicSterilizationAppointment_(appointment) {
  return {
    appointmentId: appointment.appointment_id,
    appointmentCode: appointment.appointment_code,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    customerName: appointment.customer_name,
    phone: appointment.phone,
    petName: appointment.pet_name,
    species: appointment.species,
    sex: appointment.sex,
    breed: appointment.breed,
    weightKg: appointment.weight_kg,
    ageText: appointment.age_text,
    vaccinationStatus: appointment.vaccination_status,
    sourceChannel: appointment.source_channel,
    status: appointment.status,
    statusLabel: sterilizationStatusLabel_(appointment.status),
    notes: appointment.notes
  };
}

/** One-time schema upgrade from v1.4 to v1.5. Safe to run repeatedly. */
function upgradeSystemV1_5() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = getSpreadsheet_();
    appendMissingHeadersV1_5_(
      spreadsheet.getSheetByName(APP.SHEETS.BOOKINGS),
      ['booking_group_id', 'check_in_notes']
    );
    appendMissingHeadersV1_5_(
      spreadsheet.getSheetByName(APP.SHEETS.STERILIZATIONS),
      ['age_text', 'vaccination_status']
    );
    var roomSheet = spreadsheet.getSheetByName(APP.SHEETS.ROOMS);
    if (roomSheet && roomSheet.getLastRow() > 1) {
      var names = roomSheet.getRange(2, 1, roomSheet.getLastRow() - 1, 2).getValues();
      names.forEach(function (row, index) {
        if (/^D\d{2}$/.test(String(row[0])) && String(row[1]).indexOf('กรงสุนัข') === 0) {
          roomSheet.getRange(index + 2, 2).setValue('ห้องพักสุนัข ' + row[0]);
        }
      });
    }
    spreadsheet.toast('อัปเกรดระบบเป็น v1.5 เรียบร้อยแล้ว', 'BMP Pet Hotel Booking', 8);
    console.log('อัปเกรดเป็น v1.5 สำเร็จ: เพิ่มกลุ่มการจอง หมายเหตุเช็กอิน อายุ และวัคซีน');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function appendMissingHeadersV1_5_(sheet, newHeaders) {
  if (!sheet) throw new Error('ไม่พบชีตสำหรับอัปเกรด v1.5');
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (value) { return String(value || '').trim(); });
  var missing = newHeaders.filter(function (header) { return existing.indexOf(header) === -1; });
  if (missing.length) {
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, lastColumn + 1, 1, missing.length)
      .setBackground('#123D32').setFontColor('#FFFFFF').setFontWeight('bold');
  }
}

/**
 * One-time upgrade for an existing v1.0 spreadsheet.
 * Run this function once after copying all v1.1 source files.
 */
function upgradeSystemV1_1() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = getSpreadsheet_();
    var sheet = ensureSheet_(
      spreadsheet,
      APP.SHEETS.STERILIZATIONS,
      STERILIZATION_HEADERS
    );
    sheet.setFrozenRows(1);
    sheet.setHiddenGridlines(true);
    sheet.getRange(1, 1, 1, STERILIZATION_HEADERS.length)
      .setBackground('#123D32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setWrap(true);
    sheet.setRowHeight(1, 40);
    sheet.autoResizeColumns(1, STERILIZATION_HEADERS.length);

    seedSettings_();
    appendMissingSterilizationReferenceRows_();
    var assignedCount = assignUnassignedActiveBookings_();
    console.log(
      'อัปเกรดเป็น v1.1 สำเร็จ: เพิ่มระบบทำหมัน และกำหนดห้องเดิมอัตโนมัติ ' +
      assignedCount + ' รายการ'
    );
    spreadsheet.toast(
      'อัปเกรดระบบเป็น v1.1 เรียบร้อยแล้ว',
      'BMP Pet Hotel Booking',
      8
    );
    return { ok: true, assignedBookings: assignedCount };
  } finally {
    lock.releaseLock();
  }
}

function appendMissingSterilizationReferenceRows_() {
  var sheet = getSheet_(APP.SHEETS.LISTS);
  var existing = sheet.getLastRow() > 1 ?
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  var keys = {};
  existing.forEach(function (row) {
    keys[String(row[0]) + '|' + String(row[1])] = true;
  });
  var rows = [
    ['STERILIZATION_STATUS', 'PENDING_CONFIRMATION', 'รอยืนยันนัด'],
    ['STERILIZATION_STATUS', 'CONFIRMED', 'ยืนยันนัดแล้ว'],
    ['STERILIZATION_STATUS', 'ARRIVED', 'มาถึงคลินิกแล้ว'],
    ['STERILIZATION_STATUS', 'COMPLETED', 'ดำเนินการเสร็จแล้ว'],
    ['STERILIZATION_STATUS', 'CANCELLED', 'ยกเลิก'],
    ['STERILIZATION_STATUS', 'NO_SHOW', 'ไม่มาตามนัด']
  ].filter(function (row) {
    return !keys[row[0] + '|' + row[1]];
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  }
}

function assignUnassignedActiveBookings_() {
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
    .filter(function (booking) {
      return booking.booking_type === APP.BOOKING_TYPES.OVERNIGHT &&
        bookingConsumesCapacity(booking.status) &&
        !booking.assigned_room_id;
    })
    .sort(function (a, b) {
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  var assignedCount = 0;
  bookings.forEach(function (booking) {
    var roomId = findAvailableRoomId_(
      booking.species,
      booking.check_in_date,
      booking.check_out_date,
      booking.booking_id
    );
    if (!roomId) return;
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      assigned_room_id: roomId,
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    assignedCount += 1;
  });
  return assignedCount;
}
