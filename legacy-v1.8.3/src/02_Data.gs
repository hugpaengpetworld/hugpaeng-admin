function setupSystem() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error('กรุณาผูก Apps Script กับ Google Sheets แล้วเรียก setupSystem() อีกครั้ง');
    }

    var props = PropertiesService.getScriptProperties();
    props.setProperty(APP.PROPERTY_KEYS.SPREADSHEET_ID, spreadsheet.getId());
    if (!props.getProperty(APP.PROPERTY_KEYS.AUTH_PEPPER)) {
      props.setProperty(APP.PROPERTY_KEYS.AUTH_PEPPER, randomToken_(48));
    }

    ensureSheet_(spreadsheet, APP.SHEETS.DASHBOARD, ['ตัวชี้วัด', 'ค่า']);
    ensureSheet_(spreadsheet, APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.PETS, PET_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.ROOMS, ROOM_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.PAYMENTS, PAYMENT_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.CHARGES, CHARGE_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.USERS, USER_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.SESSIONS, SESSION_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.AUDIT, AUDIT_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.SETTINGS, SETTINGS_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.LISTS, ['กลุ่ม', 'รหัส', 'ชื่อภาษาไทย']);
    ensureSheet_(spreadsheet, APP.SHEETS.STERILIZATIONS, STERILIZATION_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.STERILIZATION_HOLIDAYS, STERILIZATION_HOLIDAY_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.RECEIPTS, RECEIPT_HEADERS);
    ensureSheet_(spreadsheet, APP.SHEETS.RECEIPT_ITEMS, RECEIPT_ITEM_HEADERS);

    seedRooms_();
    seedSettings_();
    seedLists_();
    formatWorkbook_();
    hideInternalSheets_();
    ensureUploadFolder_();
    ensureReceiptFolder_();
    ensureAutomationTriggers_();

    var ownerResult = ensureInitialOwner_();
    refreshDashboardSheet_();

    var message = 'ติดตั้งโครงสร้างระบบเรียบร้อยแล้ว';
    if (ownerResult.created) {
      message += '\n\nชื่อผู้ใช้เริ่มต้น: ' + ownerResult.username +
        '\nรหัสผ่านชั่วคราว: ' + ownerResult.temporaryPassword +
        '\n\nกรุณาบันทึกรหัสผ่านนี้และเปลี่ยนทันทีหลังเข้าสู่ระบบ';
    }
    console.log(message);
    spreadsheet.toast(
      'ติดตั้งโครงสร้างระบบเรียบร้อยแล้ว ดูชื่อผู้ใช้และรหัสผ่านชั่วคราวใน Execution log',
      'BMP Pet Hotel Booking',
      10
    );
    return {
      ok: true,
      message: message,
      ownerCreated: ownerResult.created,
      username: ownerResult.username || ''
    };
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.SPREADSHEET_ID);
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('ยังไม่ได้ตั้งค่า Spreadsheet ID กรุณารัน setupSystem()');
  return active;
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('ไม่พบชีต ' + name + ' กรุณารัน setupSystem()');
  return sheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsHeader = existing.every(function (value) { return value === ''; });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function seedRooms_() {
  var existing = getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS);
  var existingIds = {};
  existing.forEach(function (row) { existingIds[row.room_id] = true; });
  var rows = [];
  for (var cat = 1; cat <= 11; cat += 1) {
    var catId = 'CAT' + String(cat).padStart(2, '0');
    var legacyCatId = 'C' + String(cat).padStart(2, '0');
    if (!existingIds[catId] && !existingIds[legacyCatId]) {
      rows.push({
        room_id: catId,
        room_name: 'ห้องพักแมว ' + catId,
        species: APP.SPECIES.CAT,
        status: APP.ROOM_STATUSES.AVAILABLE,
        current_booking_id: '',
        notes: '',
        updated_at: nowIso_()
      });
    }
  }
  for (var dog = 1; dog <= 7; dog += 1) {
    var dogId = 'DOG' + String(dog).padStart(2, '0');
    var legacyDogId = 'D' + String(dog).padStart(2, '0');
    if (!existingIds[dogId] && !existingIds[legacyDogId]) {
      rows.push({
        room_id: dogId,
        room_name: 'ห้องพักสุนัข ' + dogId,
        species: APP.SPECIES.DOG,
        status: APP.ROOM_STATUSES.AVAILABLE,
        current_booking_id: '',
        notes: '',
        updated_at: nowIso_()
      });
    }
  }
  rows.forEach(function (row) {
    appendObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, row);
  });
}

function seedSettings_() {
  var defaults = [
    ['clinic_name_th', APP.NAME_TH, 'ชื่อกิจการภาษาไทย'],
    ['clinic_name_en', APP.NAME_EN, 'ชื่อกิจการภาษาอังกฤษ'],
    ['clinic_logo_file_id', '', 'ไฟล์โลโก้สถานบริการใน Google Drive'],
    ['timezone', APP.TIMEZONE, 'เขตเวลาของระบบ'],
    ['normal_open_time', '09:00', 'เวลาเปิดติดต่อสถานบริการ (ไม่จำกัดเวลาเช็กอิน/เช็กเอาท์)'],
    ['normal_close_time', '18:00', 'เวลาปิดติดต่อสถานบริการ (ไม่จำกัดเวลาเช็กอิน/เช็กเอาท์)'],
    ['thursday_morning_window', '10:00-11:00', 'ช่วงเวลาติดต่อเช้าวันพฤหัสบดี'],
    ['thursday_evening_window', '17:00-17:30', 'ช่วงเวลาติดต่อเย็นวันพฤหัสบดี'],
    ['cat_one_price', '150', 'ราคาแมว 1 ตัวต่อคืน'],
    ['cat_two_price', '200', 'ราคาแมว 2 ตัวต่อคืน'],
    ['dog_one_price', '150', 'ราคาสุนัข 1 ตัวต่อคืน'],
    ['dog_two_price', '200', 'ราคาสุนัข 2 ตัวต่อคืน'],
    ['line_deposit_amount', '500', 'เงินมัดจำเฉพาะการจองผ่าน LINE'],
    ['payment_window_minutes', '60', 'เวลาชำระมัดจำหลังอนุมัติ'],
    ['reschedule_notice_days', '3', 'จำนวนวันที่ต้องแจ้งล่วงหน้า'],
    ['max_reschedules', '1', 'จำนวนครั้งที่เลื่อนได้'],
    ['bank_name', '', 'ชื่อธนาคาร'],
    ['bank_account_name', '', 'ชื่อบัญชี'],
    ['bank_account_number', '', 'เลขที่บัญชี'],
    ['promptpay_qr_file_id', '', 'ไฟล์ QR PromptPay ใน Google Drive'],
    ['promptpay_qr_url', '', 'URL รูป QR PromptPay ที่เปิดดูได้จากหน้าจอง'],
    ['clinic_phone', '', 'หมายเลขโทรศัพท์'],
    ['line_oa_url', '', 'ลิงก์ LINE OA'],
    ['facebook_url', '', 'ลิงก์ Facebook'],
    ['sterilization_daily_capacity', '4', 'จำนวนสัตว์สูงสุดสำหรับคิวทำหมันต่อวัน']
  ];
  var current = getAllObjects_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS);
  var keys = {};
  current.forEach(function (row) { keys[row.key] = true; });
  defaults.forEach(function (item) {
    if (!keys[item[0]]) {
      appendObject_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS, {
        key: item[0],
        value: item[1],
        description: item[2],
        updated_at: nowIso_()
      });
    }
  });
}

function seedLists_() {
  var sheet = getSheet_(APP.SHEETS.LISTS);
  if (sheet.getLastRow() > 1) return;
  var rows = [
    ['ROLE', 'OWNER', 'เจ้าของ'],
    ['ROLE', 'DOCTOR', 'หมอ'],
    ['ROLE', 'STAFF', 'พนักงาน'],
    ['SPECIES', 'CAT', 'แมว'],
    ['SPECIES', 'DOG', 'สุนัข'],
    ['CHANNEL', 'WEBSITE', 'เว็บไซต์'],
    ['CHANNEL', 'LINE', 'LINE'],
    ['CHANNEL', 'FACEBOOK', 'Facebook'],
    ['CHANNEL', 'PHONE', 'โทรศัพท์'],
    ['CHANNEL', 'WALK_IN', 'Walk-in'],
    ['CHANNEL', 'OTHER', 'อื่น ๆ'],
    ['STATUS', 'PENDING_APPROVAL', 'รออนุมัติห้อง'],
    ['STATUS', 'APPROVED_AWAITING_DEPOSIT', 'อนุมัติแล้ว รอมัดจำ'],
    ['STATUS', 'CONFIRMED', 'ยืนยันการจอง'],
    ['STATUS', 'CHECKED_IN', 'เช็กอินแล้ว'],
    ['STATUS', 'CHECKED_OUT', 'เช็กเอาต์แล้ว'],
    ['STATUS', 'REJECTED', 'ไม่อนุมัติ'],
    ['STATUS', 'EXPIRED_PAYMENT', 'หมดเวลาชำระ'],
    ['STATUS', 'CANCELLED_NO_REFUND', 'ยกเลิก ไม่คืนมัดจำ'],
    ['STERILIZATION_STATUS', 'PENDING_CONFIRMATION', 'รอยืนยันนัด'],
    ['STERILIZATION_STATUS', 'CONFIRMED', 'ยืนยันนัดแล้ว'],
    ['STERILIZATION_STATUS', 'ARRIVED', 'มาถึงคลินิกแล้ว'],
    ['STERILIZATION_STATUS', 'COMPLETED', 'ดำเนินการเสร็จแล้ว'],
    ['STERILIZATION_STATUS', 'CANCELLED', 'ยกเลิก'],
    ['STERILIZATION_STATUS', 'NO_SHOW', 'ไม่มาตามนัด']
  ];
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function formatWorkbook_() {
  var spreadsheet = getSpreadsheet_();
  var darkGreen = '#123D32';
  var activeGreen = '#2F755B';
  var paleGreen = '#DCECE3';
  var light = '#F5F7F4';
  var sheets = spreadsheet.getSheets();
  sheets.forEach(function (sheet) {
    var lastColumn = Math.max(1, sheet.getLastColumn());
    sheet.setFrozenRows(1);
    sheet.setHiddenGridlines(true);
    sheet.getRange(1, 1, 1, lastColumn)
      .setBackground(darkGreen)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sheet.setRowHeight(1, 40);
    if (sheet.getMaxRows() > 1) {
      sheet.getRange(2, 1, Math.max(1, Math.min(sheet.getMaxRows() - 1, 500)), lastColumn)
        .setFontFamily('Noto Sans Thai')
        .setVerticalAlignment('middle');
    }
    sheet.getBandings().forEach(function (banding) { banding.remove(); });
    if (sheet.getLastRow() > 1) {
      sheet.getRange(1, 1, sheet.getLastRow(), lastColumn)
        .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
        .setHeaderRowColor(darkGreen)
        .setFirstRowColor('#FFFFFF')
        .setSecondRowColor(light);
    }
    sheet.autoResizeColumns(1, lastColumn);
    for (var col = 1; col <= lastColumn; col += 1) {
      var currentWidth = sheet.getColumnWidth(col);
      sheet.setColumnWidth(col, Math.min(Math.max(currentWidth, 110), 220));
    }
  });

  var settings = spreadsheet.getSheetByName(APP.SHEETS.SETTINGS);
  settings.getRange('B2:B200').setBackground(paleGreen);
  var rooms = spreadsheet.getSheetByName(APP.SHEETS.ROOMS);
  rooms.getRange('D2:D100').setBackground(paleGreen);
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName(APP.SHEETS.DASHBOARD));
}

function hideInternalSheets_() {
  [APP.SHEETS.SESSIONS, APP.SHEETS.LISTS].forEach(function (name) {
    var sheet = getSheet_(name);
    if (!sheet.isSheetHidden()) sheet.hideSheet();
  });
}

function ensureUploadFolder_() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(APP.PROPERTY_KEYS.UPLOAD_FOLDER_ID);
  if (existingId) {
    try {
      DriveApp.getFolderById(existingId).getName();
      return existingId;
    } catch (error) {
      props.deleteProperty(APP.PROPERTY_KEYS.UPLOAD_FOLDER_ID);
    }
  }
  var folder = DriveApp.createFolder('BMP Booking Private Uploads');
  props.setProperty(APP.PROPERTY_KEYS.UPLOAD_FOLDER_ID, folder.getId());
  return folder.getId();
}

function ensureReceiptFolder_() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(APP.PROPERTY_KEYS.RECEIPT_FOLDER_ID);
  if (existingId) {
    try {
      DriveApp.getFolderById(existingId).getName();
      return existingId;
    } catch (error) {
      props.deleteProperty(APP.PROPERTY_KEYS.RECEIPT_FOLDER_ID);
    }
  }
  var folder = DriveApp.createFolder('BMP Booking Receipts');
  props.setProperty(APP.PROPERTY_KEYS.RECEIPT_FOLDER_ID, folder.getId());
  return folder.getId();
}

function getAllObjects_(sheetName, headers) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var object = { _row: index + 2 };
    headers.forEach(function (header, column) {
      object[header] = serializeCellValue_(row[column], header);
    });
    return object;
  }).filter(function (object) {
    return headers.some(function (header) {
      return object[header] !== '' && object[header] !== null;
    });
  });
}

function appendObject_(sheetName, headers, object) {
  var sheet = getSheet_(sheetName);
  var row = headers.map(function (header) {
    return object[header] === undefined || object[header] === null ? '' : object[header];
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateObjectRow_(sheetName, headers, rowNumber, changes) {
  var sheet = getSheet_(sheetName);
  var current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (header, index) {
    if (Object.prototype.hasOwnProperty.call(changes, header)) {
      current[index] = changes[header];
    }
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
}

function findObject_(sheetName, headers, key, value) {
  var rows = getAllObjects_(sheetName, headers);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][key]) === String(value)) return rows[i];
  }
  return null;
}

function isDateOnlyHeader_(header) {
  return [
    'check_in_date',
    'check_out_date',
    'flea_tick_date',
    'charge_date',
    'old_check_in',
    'old_check_out',
    'new_check_in',
    'new_check_out',
    'appointment_date',
    'holiday_date',
    'service_date'
  ].indexOf(String(header || '')) !== -1;
}

function serializeCellValue_(value, header) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isDateOnlyHeader_(header)) {
      return Utilities.formatDate(value, APP.TIMEZONE, 'yyyy-MM-dd');
    }
    return Utilities.formatDate(value, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (isDateOnlyHeader_(header) && String(value || '').trim()) {
    return normalizeDateInput(value);
  }
  return value;
}

function getSettingsMap_() {
  var rows = getAllObjects_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS);
  var map = {};
  rows.forEach(function (row) { map[row.key] = row.value; });
  return map;
}

function setSetting_(key, value) {
  var row = findObject_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS, 'key', key);
  if (row) {
    updateObjectRow_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS, row._row, {
      value: value,
      updated_at: nowIso_()
    });
  } else {
    appendObject_(APP.SHEETS.SETTINGS, SETTINGS_HEADERS, {
      key: key,
      value: value,
      description: '',
      updated_at: nowIso_()
    });
  }
}

function getClinicLogoDataUrl_() {
  var fileId = String(getSettingsMap_().clinic_logo_file_id || '').trim();
  if (!fileId) return '';
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var mimeType = String(blob.getContentType() || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) return '';
    var bytes = blob.getBytes();
    if (bytes.length > APP.MAX_LOGO_BYTES) return '';
    return 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes);
  } catch (error) {
    console.warn('ไม่สามารถอ่านโลโก้สถานบริการได้: ' + error.message);
    return '';
  }
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function randomToken_(byteLength) {
  var chunks = [];
  while (chunks.join('').length < byteLength * 2) {
    chunks.push(Utilities.getUuid().replace(/-/g, ''));
  }
  return chunks.join('').substring(0, byteLength * 2);
}

function createBookingCode_() {
  var date = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd');
  var random = Math.floor(1000 + Math.random() * 9000);
  return 'BMP-' + date + '-' + random;
}
