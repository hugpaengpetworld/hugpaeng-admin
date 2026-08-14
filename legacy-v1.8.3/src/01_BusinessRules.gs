/**
 * Pure business rules. This file intentionally avoids Apps Script services so
 * the critical rules can also be checked with the included Node tests.
 */

function normalizePhone(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.indexOf('66') === 0 && digits.length >= 11) {
    digits = '0' + digits.substring(2);
  }
  return digits;
}

/**
 * Formats a stored Thai phone number for display without changing the value
 * kept in Google Sheets. Numeric cells may have already dropped the leading
 * zero, so a 9-digit mobile number is treated as a Thai national number.
 */
function formatPhoneInternational(phone) {
  var original = String(phone || '').trim();
  var digits = original.replace(/\D/g, '');
  if (!digits) return '';
  if (/^66\d{8,9}$/.test(digits)) return '+' + digits;
  if (/^0\d{8,9}$/.test(digits)) return '+66' + digits.substring(1);
  if (/^\d{8,9}$/.test(digits)) return '+66' + digits;
  return original;
}

function normalizeDateInput(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
    return toIsoDate(new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    )));
  }

  var raw = String(value || '').trim();
  if (!raw) throw new Error('กรุณาระบุวันที่');

  // Google Sheets may return an ISO date-time for cells formatted as dates.
  var isoDateTime = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(raw);
  var year;
  var month;
  var day;
  if (isoDateTime) {
    year = Number(isoDateTime[1]);
    month = Number(isoDateTime[2]);
    day = Number(isoDateTime[3]);
  } else {
    var yearFirst = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(raw);
    var dayFirst = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(raw);
    if (yearFirst) {
      year = Number(yearFirst[1]);
      month = Number(yearFirst[2]);
      day = Number(yearFirst[3]);
    } else if (dayFirst) {
      day = Number(dayFirst[1]);
      month = Number(dayFirst[2]);
      year = Number(dayFirst[3]);
    } else {
      throw new Error('รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้ วัน-เดือน-ปี');
    }
  }

  // Accept Buddhist Era input while keeping storage/API values canonical CE.
  if (year >= 2400) year -= 543;
  var date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('วันที่ไม่ถูกต้อง');
  }
  return toIsoDate(date);
}

function parseIsoDate(value) {
  var normalized = normalizeDateInput(value);
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toIsoDate(date) {
  var year = date.getUTCFullYear();
  var month = String(date.getUTCMonth() + 1).padStart(2, '0');
  var day = String(date.getUTCDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function formatThaiDate(isoDate) {
  var date = parseIsoDate(isoDate);
  var day = String(date.getUTCDate()).padStart(2, '0');
  var month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return day + '-' + month + '-' + date.getUTCFullYear();
}

function buildRoomBookingCodeBase(checkInIso, roomId) {
  var date = parseIsoDate(checkInIso);
  var normalizedRoomId = String(roomId || '').trim().toUpperCase();
  if (!/^(CAT|DOG)\d{2}$/.test(normalizedRoomId)) {
    throw new Error('รหัสห้องหรือกรงไม่ถูกต้อง');
  }
  var day = String(date.getUTCDate()).padStart(2, '0');
  var month = String(date.getUTCMonth() + 1).padStart(2, '0');
  var buddhistYear = String(date.getUTCFullYear() + 543);
  return 'BMP-' + day + month + buddhistYear + '-' + normalizedRoomId;
}

function nextRoomBookingCode(checkInIso, roomId, existingCodes) {
  var base = buildRoomBookingCodeBase(checkInIso, roomId);
  var prefix = base + '-';
  var highestSequence = (Array.isArray(existingCodes) ? existingCodes : [])
    .reduce(function (highest, value) {
      var code = String(value || '').trim().toUpperCase();
      if (code.indexOf(prefix) !== 0) return highest;
      var suffix = code.substring(prefix.length);
      if (!/^\d+$/.test(suffix)) return highest;
      return Math.max(highest, Number(suffix));
    }, 0);
  return prefix + String(highestSequence + 1).padStart(2, '0');
}

function calculateNights(checkInIso, checkOutIso) {
  var checkIn = parseIsoDate(checkInIso);
  var checkOut = parseIsoDate(checkOutIso);
  var nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
  if (nights < 1) throw new Error('วันเช็กเอาต์ต้องอยู่หลังวันเช็กอิน');
  return nights;
}

function rangesOverlap(startA, endA, startB, endB) {
  return parseIsoDate(startA).getTime() < parseIsoDate(endB).getTime() &&
    parseIsoDate(endA).getTime() > parseIsoDate(startB).getTime();
}

function validateAnimalCapacity(species, pets) {
  if (!Array.isArray(pets) || pets.length < 1 || pets.length > 2) {
    throw new Error('เข้าพักได้ 1–2 ตัวต่อห้องหรือกรง');
  }
  if (species === 'CAT') return true;
  if (species !== 'DOG') throw new Error('ประเภทสัตว์ไม่ถูกต้อง');

  for (var i = 0; i < pets.length; i += 1) {
    var weight = Number(pets[i].weightKg);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error('กรุณาระบุน้ำหนักสุนัขทุกตัว');
    }
    if (pets.length === 1 && weight > 20) {
      throw new Error('สุนัขน้ำหนักเกิน 20 กิโลกรัม กรุณาติดต่อคลินิกโดยตรง');
    }
    if (pets.length === 2 && weight > 8) {
      throw new Error('สุนัขที่พักร่วมกันแต่ละตัวต้องไม่เกิน 8 กิโลกรัม');
    }
  }
  return true;
}

function calculateNightlyRate(species, petCount) {
  if (species !== 'CAT' && species !== 'DOG') {
    throw new Error('ประเภทสัตว์ไม่ถูกต้อง');
  }
  if (petCount === 1) return 150;
  if (petCount === 2) return 200;
  throw new Error('จำนวนสัตว์ต้องเป็น 1 หรือ 2 ตัว');
}

function calculateOvernightCharge(species, pets, checkInIso, checkOutIso) {
  validateAnimalCapacity(species, pets);
  var nights = calculateNights(checkInIso, checkOutIso);
  var rate = calculateNightlyRate(species, pets.length);
  return { nights: nights, unitPrice: rate, lodgingTotal: nights * rate };
}

function calculateDaycareCharge(startTime, endTime, usesOwnerCage) {
  if (usesOwnerCage) {
    return { billableHours: 0, total: 0 };
  }
  var start = parseTimeMinutes(startTime);
  var end = parseTimeMinutes(endTime);
  if (end <= start) throw new Error('เวลารับกลับต้องอยู่หลังเวลาฝาก');
  var minutes = end - start;
  var fullHours = Math.floor(minutes / 60);
  var remainder = minutes % 60;
  var roundedHours = fullHours + (remainder > 30 ? 1 : 0);
  roundedHours = Math.max(1, Math.min(3, roundedHours));
  return { billableHours: roundedHours, total: roundedHours * 50 };
}

function parseTimeMinutes(value) {
  var match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error('รูปแบบเวลาไม่ถูกต้อง');
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('เวลาไม่ถูกต้อง');
  return hour * 60 + minute;
}

function validateVisitTime(dateIso, timeValue) {
  parseIsoDate(dateIso);
  parseTimeMinutes(timeValue);
  return true;
}

function depositRuleForChannel(channel) {
  if (channel === 'LINE') {
    return { required: true, amount: 500 };
  }
  return { required: false, amount: 0 };
}

function finalSettlement(lodgingTotal, extraCharges, depositPaid) {
  var total = Number(lodgingTotal || 0) + Number(extraCharges || 0);
  var deposit = Number(depositPaid || 0);
  return {
    total: total,
    amountDue: Math.max(0, total - deposit),
    refundDue: Math.max(0, deposit - total)
  };
}

function canRequestReschedule(nowIso, currentCheckInIso, rescheduleCount) {
  if (Number(rescheduleCount || 0) >= 1) {
    return { allowed: false, reason: 'รายการนี้ใช้สิทธิ์เลื่อนวันแล้ว' };
  }
  var now = parseIsoDate(nowIso);
  var checkIn = parseIsoDate(currentCheckInIso);
  var noticeDays = Math.floor((checkIn.getTime() - now.getTime()) / 86400000);
  if (noticeDays < 3) {
    return { allowed: false, reason: 'ต้องแจ้งเลื่อนวันล่วงหน้าอย่างน้อย 3 วัน' };
  }
  return { allowed: true, reason: '' };
}

function bookingConsumesCapacity(status) {
  return [
    'PENDING_APPROVAL',
    'APPROVED_AWAITING_DEPOSIT',
    'CONFIRMED',
    'CHECKED_IN'
  ].indexOf(status) !== -1;
}

function sterilizationStatusConsumesCapacity(status) {
  return ['CANCELLED', 'NO_SHOW'].indexOf(status) === -1;
}

function validateSterilizationDailyCapacity(currentCount, capacity) {
  var used = Number(currentCount || 0);
  var limit = Number(capacity || 4);
  if (!Number.isFinite(limit) || limit < 1) limit = 4;
  if (used >= limit) {
    throw new Error('คิวทำหมันของวันที่เลือกเต็มแล้ว (สูงสุด ' + limit + ' ตัวต่อวัน)');
  }
  return true;
}

function normalizeSterilizationSpecies(categoryValue, otherValue) {
  var category = String(categoryValue || '').trim().toUpperCase();
  if (category === 'DOG') return 'สุนัข';
  if (category === 'CAT') return 'แมว';
  if (category === 'OTHER') {
    var other = String(otherValue || '').trim();
    if (!other) throw new Error('กรุณาระบุชนิดสัตว์เพิ่มเติม');
    if (other.length > 50) throw new Error('ชนิดสัตว์ต้องไม่เกิน 50 ตัวอักษร');
    return other;
  }
  throw new Error('กรุณาเลือกชนิดสัตว์');
}

function normalizeSterilizationSex(sexValue) {
  var sex = String(sexValue || '').trim().toUpperCase();
  if (sex === 'MALE') return 'ผู้';
  if (sex === 'FEMALE') return 'เมีย';
  throw new Error('กรุณาเลือกเพศสัตว์');
}

function isPublicBookingTypeAllowed(bookingType) {
  return bookingType === 'OVERNIGHT';
}

function isStaffOnlyChannel(channel) {
  return ['FACEBOOK', 'PHONE', 'WALK_IN', 'OTHER'].indexOf(channel) !== -1;
}

function validateEmergencyOwnCage(species, pets, channel, usesOwnerCage) {
  if (!usesOwnerCage) throw new Error('บริการนี้ใช้ได้เฉพาะกรงที่เจ้าของนำมาเอง');
  if (channel !== 'PHONE' && channel !== 'WALK_IN') {
    throw new Error('บริการฝากชั่วคราวกรงส่วนตัวรับเฉพาะโทรศัพท์หรือ Walk-in');
  }
  if (species === 'DOG') {
    for (var i = 0; i < pets.length; i += 1) {
      if (Number(pets[i].weightKg) > 8) {
        throw new Error('สุนัขน้ำหนักเกิน 8 กิโลกรัมต้องใช้กรงของคลินิก');
      }
    }
  }
  return true;
}
