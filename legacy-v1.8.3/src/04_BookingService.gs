/**
 * Public booking and availability services.
 * A PENDING_APPROVAL request consumes capacity immediately. This prevents a
 * second customer from seeing or requesting the same last room while staff
 * review the first request.
 */

function getPublicConfig() {
  var settings = getSettingsMap_();
  var props = PropertiesService.getScriptProperties();
  return {
    clinicName: settings.clinic_name_th || APP.NAME_TH,
    clinicNameTh: settings.clinic_name_th || APP.NAME_TH,
    clinicNameEn: settings.clinic_name_en || APP.NAME_EN,
    clinicPhone: settings.clinic_phone || '',
    logoDataUrl: getClinicLogoDataUrl_(),
    liffId: props.getProperty(APP.PROPERTY_KEYS.LIFF_ID) || '',
    prices: {
      catOne: Number(settings.cat_one_price || 150),
      catTwo: Number(settings.cat_two_price || 200),
      dogOne: Number(settings.dog_one_price || 150),
      dogTwo: Number(settings.dog_two_price || 200)
    },
    deposit: {
      lineOnly: true,
      amount: Number(settings.line_deposit_amount || 500),
      paymentWindowMinutes: APP.PAYMENT_WINDOW_MINUTES
    },
    payment: {
      promptPayImageUrl: settings.promptpay_qr_url || '',
      bankName: settings.bank_name || '',
      accountName: settings.bank_account_name || '',
      accountNumber: settings.bank_account_number || ''
    },
    visitTimes: {
      normal: 'นัดหมายล่วงหน้าได้ตลอด 24 ชั่วโมง',
      thursday: ['นัดหมายล่วงหน้าได้ตลอด 24 ชั่วโมง']
    },
    todayIso: todayIso_(),
    todayThai: formatThaiDate(todayIso_())
  };
}

function checkAvailability(input) {
  var request = validateOvernightRequest_(input || {}, false);
  var remaining = getAvailableCount_(
    request.species,
    request.checkInDate,
    request.checkOutDate,
    ''
  );
  return {
    species: request.species,
    checkInDate: request.checkInDate,
    checkOutDate: request.checkOutDate,
    checkInThai: formatThaiDate(request.checkInDate),
    checkOutThai: formatThaiDate(request.checkOutDate),
    availableCount: remaining,
    available: remaining > 0,
    quote: {
      nights: calculateNights(request.checkInDate, request.checkOutDate),
      unitPrice: calculateNightlyRate(request.species, request.pets.length),
      lodgingTotal:
        calculateNights(request.checkInDate, request.checkOutDate) *
        calculateNightlyRate(request.species, request.pets.length)
    }
  };
}

function createPublicBooking(input) {
  var payload = input || {};
  var channel = String(payload.sourceChannel || APP.CHANNELS.WEBSITE).toUpperCase();
  if ([APP.CHANNELS.WEBSITE, APP.CHANNELS.LINE].indexOf(channel) === -1) {
    throw new Error('หน้าลูกค้ารับคำขอจากเว็บไซต์หรือ LINE เท่านั้น');
  }

  var lineIdentity = { userId: '' };
  if (channel === APP.CHANNELS.LINE) {
    lineIdentity = verifyLineIdToken_(payload.lineIdToken);
  }

  var request = validateOvernightRequest_(payload, true);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var availableCount = getAvailableCount_(
      request.species,
      request.checkInDate,
      request.checkOutDate,
      ''
    );
    if (availableCount < 1) {
      throw new Error('ขออภัย ห้องประเภทนี้เต็มในช่วงวันที่เลือก กรุณาเลือกวันใหม่');
    }
    var provisionalRoomId = findAvailableRoomId_(
      request.species,
      request.checkInDate,
      request.checkOutDate,
      ''
    );
    if (!provisionalRoomId) {
      throw new Error('ขออภัย ไม่พบห้องว่างสำหรับช่วงวันที่เลือก กรุณาลองใหม่');
    }

    var bookingId = newId_('BKG');
    var bookingCode = createUniqueRoomBookingCode_(
      request.checkInDate,
      provisionalRoomId
    );
    var quote = calculateOvernightCharge(
      request.species,
      request.pets,
      request.checkInDate,
      request.checkOutDate
    );
    var deposit = depositRuleForChannel(channel);
    var vaccinationFileId = '';
    if (payload.vaccinationFile && payload.vaccinationFile.data) {
      vaccinationFileId = savePrivateUpload_(
        payload.vaccinationFile,
        bookingCode + '-vaccination'
      );
    }
    var healthReviewRequired =
      !toBoolean_(payload.fleaTickTreated) ||
      toBoolean_(payload.fleaTickFoundNow);

    appendObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, {
      booking_id: bookingId,
      booking_code: bookingCode,
      created_at: nowIso_(),
      updated_at: nowIso_(),
      source_channel: channel,
      line_user_id: lineIdentity.userId || '',
      booking_type: APP.BOOKING_TYPES.OVERNIGHT,
      status: APP.STATUSES.PENDING_APPROVAL,
      payment_status: deposit.required ?
        APP.PAYMENT_STATUSES.WAITING :
        APP.PAYMENT_STATUSES.NOT_REQUIRED,
      customer_name: request.customerName,
      phone: request.phone,
      contact_handle: request.contactHandle,
      species: request.species,
      pet_count: request.pets.length,
      check_in_date: request.checkInDate,
      check_out_date: request.checkOutDate,
      check_in_time: request.checkInTime,
      check_out_time: request.checkOutTime,
      nights: quote.nights,
      unit_price: quote.unitPrice,
      lodging_total: quote.lodgingTotal,
      deposit_required: deposit.required,
      deposit_amount: deposit.amount,
      payment_deadline: '',
      assigned_room_id: provisionalRoomId,
      health_review_required: healthReviewRequired,
      health_review_status: healthReviewRequired ? 'PENDING' : 'NOT_REQUIRED',
      vaccination_file_id: vaccinationFileId,
      flea_tick_treated: toBoolean_(payload.fleaTickTreated),
      flea_tick_date: String(payload.fleaTickDate || ''),
      flea_tick_product: cleanText_(payload.fleaTickProduct, 120),
      flea_tick_found_now: toBoolean_(payload.fleaTickFoundNow),
      food_option: normalizeFoodOption_(payload.foodOption),
      special_notes: cleanText_(payload.specialNotes, 1000),
      reschedule_count: 0,
      original_booking_id: '',
      checked_in_at: '',
      checked_out_at: '',
      cancel_reason: '',
      created_by: 'PUBLIC',
      approved_by: '',
      approved_at: '',
      version: 1
    });

    request.pets.forEach(function (pet, index) {
      appendObject_(APP.SHEETS.PETS, PET_HEADERS, {
        pet_id: newId_('PET'),
        booking_id: bookingId,
        pet_order: index + 1,
        name: cleanText_(pet.name, 100),
        species: request.species,
        sex: cleanText_(pet.sex, 30),
        breed: cleanText_(pet.breed, 100),
        age_text: cleanText_(pet.ageText, 50),
        weight_kg: request.species === APP.SPECIES.DOG ? Number(pet.weightKg) : '',
        neutered: toBoolean_(pet.neutered),
        chronic_conditions: cleanText_(pet.chronicConditions, 500),
        current_medications: cleanText_(pet.currentMedications, 500),
        allergies: cleanText_(pet.allergies, 500),
        feeding_instructions: cleanText_(pet.feedingInstructions, 500),
        created_at: nowIso_()
      });
    });

    audit_({
      userId: '',
      username: '',
      role: 'PUBLIC',
      action: 'BOOKING_REQUESTED',
      entityType: 'BOOKING',
      entityId: bookingId,
      summary: bookingCode + ' กันความจุและรออนุมัติห้อง'
    });
    refreshDashboardSheet_();
    return {
      ok: true,
      bookingCode: bookingCode,
      status: APP.STATUSES.PENDING_APPROVAL,
      statusLabel: 'รออนุมัติห้อง',
      message: 'รับคำขอแล้ว ระบบกันห้องไว้ชั่วคราวและส่งให้พนักงานตรวจสอบ',
      lodgingTotal: quote.lodgingTotal,
      depositRequiredAfterApproval: deposit.required,
      remainingCount: availableCount - 1
    };
  } finally {
    lock.releaseLock();
  }
}

function lookupBooking(bookingCode, phone) {
  var booking = getBookingByCodeAndPhone_(bookingCode, phone);
  var pets = getAllObjects_(APP.SHEETS.PETS, PET_HEADERS)
    .filter(function (pet) { return pet.booking_id === booking.booking_id; })
    .map(function (pet) {
      return {
        name: pet.name,
        species: pet.species,
        weightKg: pet.weight_kg
      };
    });
  var latestReschedule = getAllObjects_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS)
    .filter(function (request) { return request.booking_id === booking.booking_id; })
    .sort(function (a, b) {
      return String(b.requested_at).localeCompare(String(a.requested_at));
    })[0];
  return {
    bookingCode: booking.booking_code,
    customerName: booking.customer_name,
    species: booking.species,
    pets: pets,
    status: booking.status,
    statusLabel: bookingStatusLabel_(booking.status),
    paymentStatus: booking.payment_status,
    paymentStatusLabel: paymentStatusLabel_(booking.payment_status),
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
    checkInThai: formatThaiDate(booking.check_in_date),
    checkOutThai: formatThaiDate(booking.check_out_date),
    lodgingTotal: Number(booking.lodging_total || 0),
    paymentDeadline: booking.payment_deadline || '',
    rescheduleCount: Number(booking.reschedule_count || 0),
    reschedule: latestReschedule ? {
      newCheckIn: latestReschedule.new_check_in,
      newCheckOut: latestReschedule.new_check_out,
      status: latestReschedule.status
    } : null
  };
}

function requestReschedule(bookingCode, phone, input) {
  var booking = getBookingByCodeAndPhone_(bookingCode, phone);
  if ([
    APP.STATUSES.REJECTED,
    APP.STATUSES.EXPIRED_PAYMENT,
    APP.STATUSES.CANCELLED_NO_REFUND,
    APP.STATUSES.CHECKED_OUT,
    APP.STATUSES.NO_SHOW
  ].indexOf(booking.status) !== -1) {
    throw new Error('สถานะรายการนี้ไม่สามารถขอเลื่อนวันได้');
  }
  var eligibility = canRequestReschedule(
    todayIso_(),
    booking.check_in_date,
    booking.reschedule_count
  );
  if (!eligibility.allowed) throw new Error(eligibility.reason);
  var newCheckIn = normalizeDateInput((input || {}).checkInDate);
  var newCheckOut = normalizeDateInput((input || {}).checkOutDate);
  calculateNights(newCheckIn, newCheckOut);
  var pending = getAllObjects_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS)
    .some(function (request) {
      return request.booking_id === booking.booking_id &&
        request.status === APP.RESCHEDULE_STATUSES.PENDING;
    });
  if (pending) throw new Error('รายการนี้มีคำขอเลื่อนวันที่กำลังรอตรวจสอบอยู่แล้ว');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (getAvailableCount_(
      booking.species,
      newCheckIn,
      newCheckOut,
      booking.booking_id
    ) < 1) {
      throw new Error('ไม่มีห้องว่างในช่วงวันใหม่ที่เลือก');
    }
    var requestId = newId_('RSC');
    appendObject_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS, {
      request_id: requestId,
      booking_id: booking.booking_id,
      requested_at: nowIso_(),
      old_check_in: booking.check_in_date,
      old_check_out: booking.check_out_date,
      new_check_in: newCheckIn,
      new_check_out: newCheckOut,
      status: APP.RESCHEDULE_STATUSES.PENDING,
      customer_phone: normalizePhone(phone),
      processed_by: '',
      processed_at: '',
      reason: cleanText_((input || {}).reason, 500)
    });
    audit_({
      userId: '',
      username: '',
      role: 'PUBLIC',
      action: 'RESCHEDULE_REQUESTED',
      entityType: 'BOOKING',
      entityId: booking.booking_id,
      summary: booking.booking_code + ' ขอเลื่อนเป็น ' + newCheckIn + ' ถึง ' + newCheckOut
    });
    return {
      ok: true,
      requestId: requestId,
      message: 'รับคำขอเลื่อนวันแล้ว วันเดิมยังคงอยู่จนกว่าพนักงานจะอนุมัติ'
    };
  } finally {
    lock.releaseLock();
  }
}

function submitDepositSlip(bookingCode, phone, fileInput) {
  var booking = getBookingByCodeAndPhone_(bookingCode, phone);
  if (booking.source_channel !== APP.CHANNELS.LINE ||
      booking.status !== APP.STATUSES.APPROVED_AWAITING_DEPOSIT) {
    throw new Error('รายการนี้ยังไม่อยู่ในขั้นตอนชำระมัดจำ');
  }
  if (!booking.payment_deadline ||
      new Date(booking.payment_deadline).getTime() <= Date.now()) {
    throw new Error('หมดเวลาชำระมัดจำแล้ว กรุณาติดต่อคลินิก');
  }
  var hasActiveSlip = getAllObjects_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS)
    .some(function (payment) {
      return payment.booking_id === booking.booking_id &&
        payment.payment_type === 'DEPOSIT' &&
        [APP.PAYMENT_STATUSES.SUBMITTED, APP.PAYMENT_STATUSES.VERIFIED]
          .indexOf(payment.status) !== -1;
    });
  if (hasActiveSlip) {
    throw new Error('รายการนี้ส่งหลักฐานแล้ว กรุณารอพนักงานตรวจสอบ');
  }
  var fileId = savePrivateUpload_(fileInput, booking.booking_code + '-deposit');
  appendObject_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS, {
    payment_id: newId_('PAY'),
    booking_id: booking.booking_id,
    payment_type: 'DEPOSIT',
    amount: Number(booking.deposit_amount || 500),
    status: APP.PAYMENT_STATUSES.SUBMITTED,
    slip_file_id: fileId,
    source_account_name: '',
    source_account_number_masked: '',
    verified_by: '',
    verified_at: '',
    refund_amount: 0,
    refund_account_name: '',
    refund_account_number_masked: '',
    refund_verified_original_account: false,
    refund_by: '',
    refund_at: '',
    notes: '',
    created_at: nowIso_()
  });
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
    payment_status: APP.PAYMENT_STATUSES.SUBMITTED,
    updated_at: nowIso_(),
    version: Number(booking.version || 0) + 1
  });
  audit_({
    userId: '',
    username: '',
    role: 'PUBLIC',
    action: 'PAYMENT_SLIP_SUBMITTED',
    entityType: 'BOOKING',
    entityId: booking.booking_id,
    summary: booking.booking_code
  });
  return { ok: true, message: 'รับหลักฐานการโอนแล้ว รอพนักงานตรวจสอบ' };
}

function validateOvernightRequest_(input, requireCustomer) {
  var species = String(input.species || '').toUpperCase();
  var pets = Array.isArray(input.pets) ? input.pets : [];
  var checkInDate = normalizeDateInput(input.checkInDate);
  var checkOutDate = normalizeDateInput(input.checkOutDate);
  var checkInTime = String(input.checkInTime || '');
  var checkOutTime = String(input.checkOutTime || '');
  if (requireCustomer) {
    validateAnimalCapacity(species, pets);
  } else {
    if ([APP.SPECIES.CAT, APP.SPECIES.DOG].indexOf(species) === -1) {
      throw new Error('ประเภทสัตว์ไม่ถูกต้อง');
    }
    if (pets.length < 1 || pets.length > 2) {
      throw new Error('เข้าพักได้ 1–2 ตัวต่อห้องหรือกรง');
    }
  }
  calculateNights(checkInDate, checkOutDate);
  validateVisitTime(checkInDate, checkInTime);
  validateVisitTime(checkOutDate, checkOutTime);
  if (checkInDate < todayIso_()) throw new Error('วันเช็กอินต้องไม่เป็นวันที่ผ่านมาแล้ว');
  if (requireCustomer) {
    if (!cleanText_(input.customerName, 120)) throw new Error('กรุณาระบุชื่อผู้จอง');
    var phone = normalizePhone(input.phone);
    if (!/^0\d{8,9}$/.test(phone)) throw new Error('กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง');
    pets.forEach(function (pet) {
      if (!cleanText_(pet.name, 100)) throw new Error('กรุณาระบุชื่อสัตว์เลี้ยงทุกตัว');
    });
  }
  return {
    species: species,
    pets: pets,
    checkInDate: checkInDate,
    checkOutDate: checkOutDate,
    checkInTime: checkInTime,
    checkOutTime: checkOutTime,
    customerName: cleanText_(input.customerName, 120),
    phone: normalizePhone(input.phone),
    contactHandle: cleanText_(input.contactHandle, 120)
  };
}

function getAvailableCount_(species, checkInDate, checkOutDate, ignoreBookingId) {
  calculateNights(checkInDate, checkOutDate);
  var total = getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS)
    .filter(function (room) {
      return room.species === species && room.status === APP.ROOM_STATUSES.AVAILABLE;
    }).length;
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
  var heldBookingIds = {};
  bookings.forEach(function (booking) {
    if (booking.booking_id === ignoreBookingId) return;
    if (booking.booking_type !== APP.BOOKING_TYPES.OVERNIGHT) return;
    if (booking.species !== species) return;
    if (!bookingConsumesCapacity(booking.status)) return;
    if (rangesOverlap(
      booking.check_in_date,
      booking.check_out_date,
      checkInDate,
      checkOutDate
    )) {
      heldBookingIds[booking.booking_id] = true;
    }
  });

  var reschedules = getAllObjects_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS);
  reschedules.forEach(function (request) {
    if (request.status !== APP.RESCHEDULE_STATUSES.PENDING) return;
    if (request.booking_id === ignoreBookingId) return;
    var sourceBooking = bookings.filter(function (booking) {
      return booking.booking_id === request.booking_id;
    })[0];
    if (!sourceBooking || sourceBooking.species !== species) return;
    if (rangesOverlap(
      request.new_check_in,
      request.new_check_out,
      checkInDate,
      checkOutDate
    )) {
      heldBookingIds[request.booking_id] = true;
    }
  });
  return Math.max(0, total - Object.keys(heldBookingIds).length);
}

function findAvailableRoomId_(species, checkInDate, checkOutDate, ignoreBookingId) {
  calculateNights(checkInDate, checkOutDate);
  var rooms = getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS)
    .filter(function (room) {
      return room.species === species &&
        room.status === APP.ROOM_STATUSES.AVAILABLE;
    })
    .sort(function (a, b) {
      return String(a.room_id).localeCompare(String(b.room_id));
    });
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
  for (var roomIndex = 0; roomIndex < rooms.length; roomIndex += 1) {
    var roomId = rooms[roomIndex].room_id;
    var conflict = bookings.some(function (booking) {
      if (booking.booking_id === ignoreBookingId) return false;
      if (booking.booking_type !== APP.BOOKING_TYPES.OVERNIGHT) return false;
      if (booking.assigned_room_id !== roomId) return false;
      if (!bookingConsumesCapacity(booking.status)) return false;
      if (booking.status === APP.STATUSES.CHECKED_IN) return true;
      return rangesOverlap(
        booking.check_in_date,
        booking.check_out_date,
        checkInDate,
        checkOutDate
      );
    });
    if (!conflict) return roomId;
  }
  return '';
}

function isRoomAvailableForRange_(roomId, species, checkInDate, checkOutDate, ignoreBookingId) {
  calculateNights(checkInDate, checkOutDate);
  var room = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', roomId);
  if (!room || room.species !== species || room.status !== APP.ROOM_STATUSES.AVAILABLE) {
    return false;
  }
  return !getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS).some(function (booking) {
    if (booking.booking_id === ignoreBookingId) return false;
    if (booking.booking_type !== APP.BOOKING_TYPES.OVERNIGHT) return false;
    if (booking.assigned_room_id !== roomId) return false;
    if (!bookingConsumesCapacity(booking.status)) return false;
    if (booking.status === APP.STATUSES.CHECKED_IN) return true;
    return rangesOverlap(
      booking.check_in_date,
      booking.check_out_date,
      checkInDate,
      checkOutDate
    );
  });
}

function getBookingByCodeAndPhone_(bookingCode, phone) {
  var code = String(bookingCode || '').trim().toUpperCase();
  var normalizedPhone = normalizePhone(phone);
  var booking = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
    .filter(function (row) {
      return String(row.booking_code).toUpperCase() === code &&
        normalizePhone(row.phone) === normalizedPhone;
    })[0];
  if (!booking) throw new Error('ไม่พบรายการ กรุณาตรวจสอบรหัสการจองและเบอร์โทรศัพท์');
  return booking;
}

function savePrivateUpload_(fileInput, preferredName) {
  if (!fileInput || !fileInput.data) throw new Error('กรุณาเลือกไฟล์');
  var mimeType = String(fileInput.mimeType || '').toLowerCase();
  var allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.indexOf(mimeType) === -1) {
    throw new Error('รองรับเฉพาะ JPG, PNG, WEBP หรือ PDF');
  }
  var base64 = String(fileInput.data).replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > APP.MAX_UPLOAD_BYTES) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
  var extension = mimeType === 'application/pdf' ? '.pdf' :
    mimeType === 'image/png' ? '.png' :
    mimeType === 'image/webp' ? '.webp' : '.jpg';
  var safeName = String(preferredName || 'upload').replace(/[^A-Za-z0-9_-]/g, '-') + extension;
  var blob = Utilities.newBlob(bytes, mimeType, safeName);
  var folderId = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.UPLOAD_FOLDER_ID) || ensureUploadFolder_();
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return file.getId();
}

function createUniqueBookingCode_() {
  for (var i = 0; i < 20; i += 1) {
    var code = createBookingCode_();
    if (!findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_code', code)) return code;
  }
  throw new Error('ไม่สามารถสร้างรหัสการจองได้ กรุณาลองอีกครั้ง');
}

function createUniqueRoomBookingCode_(checkInDate, roomId) {
  var existingCodes = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
    .map(function (booking) { return booking.booking_code; });
  return nextRoomBookingCode(checkInDate, roomId, existingCodes);
}

function cleanText_(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().substring(0, maxLength || 500);
}

function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true' ||
    String(value).toLowerCase() === 'yes' || String(value) === '1';
}

function normalizeFoodOption_(value) {
  var option = String(value || '').toUpperCase();
  return option === 'CLINIC_FOOD' ? 'CLINIC_FOOD' : 'OWNER_FOOD';
}

function bookingStatusLabel_(status) {
  var labels = {};
  labels[APP.STATUSES.PENDING_APPROVAL] = 'รออนุมัติห้อง';
  labels[APP.STATUSES.APPROVED_AWAITING_DEPOSIT] = 'อนุมัติแล้ว รอชำระมัดจำ';
  labels[APP.STATUSES.CONFIRMED] = 'ยืนยันการจอง';
  labels[APP.STATUSES.CHECKED_IN] = 'เช็กอินแล้ว';
  labels[APP.STATUSES.CHECKED_OUT] = 'เช็กเอาต์แล้ว';
  labels[APP.STATUSES.REJECTED] = 'ไม่อนุมัติ';
  labels[APP.STATUSES.EXPIRED_PAYMENT] = 'หมดเวลาชำระ';
  labels[APP.STATUSES.CANCELLED_NO_REFUND] = 'ยกเลิก (ไม่คืนมัดจำ)';
  labels[APP.STATUSES.NO_SHOW] = 'ไม่มาเข้าพัก';
  return labels[status] || status;
}

function paymentStatusLabel_(status) {
  var labels = {};
  labels[APP.PAYMENT_STATUSES.NOT_REQUIRED] = 'ไม่ต้องชำระมัดจำ';
  labels[APP.PAYMENT_STATUSES.WAITING] = 'รอชำระ';
  labels[APP.PAYMENT_STATUSES.SUBMITTED] = 'ส่งสลิปแล้ว';
  labels[APP.PAYMENT_STATUSES.VERIFIED] = 'ตรวจสอบแล้ว';
  labels[APP.PAYMENT_STATUSES.EXPIRED] = 'หมดเวลา';
  labels[APP.PAYMENT_STATUSES.FORFEITED] = 'ริบมัดจำ';
  labels[APP.PAYMENT_STATUSES.REFUND_DUE] = 'รอคืนส่วนต่าง';
  labels[APP.PAYMENT_STATUSES.REFUNDED] = 'คืนส่วนต่างแล้ว';
  return labels[status] || status;
}
