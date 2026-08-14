/**
 * Authenticated admin services. Every entry point checks permissions on the
 * server; hiding a button in the browser is only a usability aid.
 */

function getAdminBootstrap(sessionToken) {
  var session = requirePermission_(sessionToken, 'dashboard:view');
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', session.user_id);
  return {
    user: publicUser_(user),
    dashboard: getDashboardData_(sessionToken),
    permissions: (PERMISSIONS[session.role] || []).slice(),
    rooms: listRooms(sessionToken, todayIso_()),
    roomDate: todayIso_()
  };
}

function getDashboardData_(sessionToken) {
  requirePermission_(sessionToken, 'dashboard:view');
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
  var today = todayIso_();
  var active = bookings.filter(function (booking) {
    return bookingConsumesCapacity(booking.status);
  });
  return {
    pendingApproval: bookings.filter(function (booking) {
      return booking.status === APP.STATUSES.PENDING_APPROVAL;
    }).length,
    awaitingDeposit: bookings.filter(function (booking) {
      return booking.status === APP.STATUSES.APPROVED_AWAITING_DEPOSIT;
    }).length,
    checkInToday: bookings.filter(function (booking) {
      return booking.check_in_date === today &&
        [APP.STATUSES.CONFIRMED, APP.STATUSES.APPROVED_AWAITING_DEPOSIT]
          .indexOf(booking.status) !== -1;
    }).length,
    checkOutToday: bookings.filter(function (booking) {
      return booking.check_out_date === today &&
        booking.status === APP.STATUSES.CHECKED_IN;
    }).length,
    catOccupied: active.filter(function (booking) {
      return booking.species === APP.SPECIES.CAT;
    }).length,
    dogOccupied: active.filter(function (booking) {
      return booking.species === APP.SPECIES.DOG;
    }).length,
    catTotal: getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS).filter(function (room) {
      return room.species === APP.SPECIES.CAT && room.status !== APP.ROOM_STATUSES.DISABLED;
    }).length,
    dogTotal: getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS).filter(function (room) {
      return room.species === APP.SPECIES.DOG && room.status !== APP.ROOM_STATUSES.DISABLED;
    }).length,
    generatedAt: nowIso_()
  };
}

function listBookings(sessionToken, filters) {
  requirePermission_(sessionToken, 'booking:view');
  var query = filters || {};
  if (query.date) query.date = normalizeDateInput(query.date);
  var petsByBookingId = groupPetsByBookingId_();
  var rows = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
    .filter(function (booking) {
      if (query.status && booking.status !== query.status) return false;
      if (query.species && booking.species !== query.species) return false;
      if (query.channel && booking.source_channel !== query.channel) return false;
      if (query.date && !(
        booking.check_in_date <= query.date &&
        booking.check_out_date >= query.date
      )) return false;
      if (query.search) {
        var petNames = (petsByBookingId[booking.booking_id] || []).map(function (pet) {
          return pet.name;
        });
        var haystack = [
          booking.booking_code, booking.customer_name, booking.phone,
          petNames.join(' ')
        ].join(' ').toLowerCase();
        if (haystack.indexOf(String(query.search).toLowerCase()) === -1) return false;
      }
      return true;
    })
    .sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    })
    .slice(0, 500);
  return rows.map(function (booking) {
    return publicBookingSummary_(booking, petsByBookingId[booking.booking_id] || []);
  });
}

function getBookingDetail(sessionToken, bookingId) {
  requirePermission_(sessionToken, 'booking:view');
  var booking = findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId);
  if (!booking) throw new Error('ไม่พบรายการจอง');
  var pets = getAllObjects_(APP.SHEETS.PETS, PET_HEADERS).filter(function (pet) {
    return pet.booking_id === bookingId;
  });
  return {
    booking: publicBookingDetail_(booking, pets),
    pets: pets,
    assignableRooms: listAssignableRoomsForBooking_(booking),
    payments: getAllObjects_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS)
      .filter(function (payment) { return payment.booking_id === bookingId; })
      .map(redactPayment_),
    charges: getAllObjects_(APP.SHEETS.CHARGES, CHARGE_HEADERS).filter(function (charge) {
      return charge.booking_id === bookingId;
    }),
    reschedules: getAllObjects_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS)
      .filter(function (request) { return request.booking_id === bookingId; }),
    settlement: getBookingSettlement_(bookingId)
  };
}

function createStaffBooking(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'booking:create');
  var payload = input || {};
  var bookingType = String(payload.bookingType || APP.BOOKING_TYPES.OVERNIGHT);
  var channel = String(payload.sourceChannel || APP.CHANNELS.PHONE).toUpperCase();
  if ([APP.CHANNELS.WEBSITE, APP.CHANNELS.LINE].indexOf(channel) !== -1) {
    throw new Error('หลังบ้านใช้สำหรับ Facebook, โทรศัพท์, Walk-in หรือช่องทางอื่น');
  }
  if (!isStaffOnlyChannel(channel)) throw new Error('ช่องทางการจองไม่ถูกต้อง');

  if (bookingType === APP.BOOKING_TYPES.OVERNIGHT) {
    return createStaffOvernight_(session, payload, channel);
  }
  if (bookingType === APP.BOOKING_TYPES.DAYCARE) {
    return createStaffDaycare_(session, payload, channel, false);
  }
  if (bookingType === APP.BOOKING_TYPES.EMERGENCY_OWN_CAGE) {
    return createStaffDaycare_(session, payload, channel, true);
  }
  throw new Error('ประเภทบริการไม่ถูกต้อง');
}

/**
 * Creates several overnight room records from one owner form. Each room keeps
 * its own booking row and pets, while booking_group_id links the group.
 */
function createStaffMultipleOvernightBookings(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'booking:create');
  var payload = input || {};
  var channel = String(payload.sourceChannel || APP.CHANNELS.PHONE).toUpperCase();
  if (!isStaffOnlyChannel(channel)) throw new Error('ช่องทางการจองไม่ถูกต้อง');
  var units = Array.isArray(payload.units) ? payload.units : [];
  if (units.length < 1 || units.length > 18) {
    throw new Error('กรุณาระบุจำนวนห้องพัก 1–18 ห้อง');
  }

  var shared = {
    customerName: payload.customerName,
    phone: payload.phone,
    contactHandle: payload.contactHandle,
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    checkInTime: payload.checkInTime,
    checkOutTime: payload.checkOutTime
  };
  var requests = units.map(function (unit) {
    return validateOvernightRequest_(Object.assign({}, shared, {
      species: unit.species,
      pets: unit.pets
    }), true);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var plannedRooms = [];
    requests.forEach(function (request, index) {
      var preferred = String(units[index].preferredRoomId || '').trim().toUpperCase();
      var roomId = preferred || findAvailableRoomForPlan_(
        request.species,
        request.checkInDate,
        request.checkOutDate,
        plannedRooms
      );
      if (!roomId || plannedRooms.indexOf(roomId) !== -1 ||
          !isRoomAvailableForRange_(roomId, request.species, request.checkInDate, request.checkOutDate, '')) {
        throw new Error('ห้องพักลำดับที่ ' + (index + 1) + ' ไม่ว่างในช่วงวันที่เลือก');
      }
      plannedRooms.push(roomId);
    });

    var groupId = newId_('GRP');
    var results = [];
    requests.forEach(function (request, index) {
      var roomId = plannedRooms[index];
      var bookingId = newId_('BKG');
      var bookingCode = createUniqueRoomBookingCode_(request.checkInDate, roomId);
      appendBookingAndPets_({
        bookingId: bookingId,
        bookingCode: bookingCode,
        bookingGroupId: groupId,
        channel: channel,
        bookingType: APP.BOOKING_TYPES.OVERNIGHT,
        status: APP.STATUSES.PENDING_APPROVAL,
        paymentStatus: APP.PAYMENT_STATUSES.NOT_REQUIRED,
        request: request,
        payload: Object.assign({}, payload, units[index]),
        quote: calculateOvernightCharge(
          request.species,
          request.pets,
          request.checkInDate,
          request.checkOutDate
        ),
        createdBy: session.user_id,
        assignedRoomId: roomId
      });
      auditFromSession_(session, 'BOOKING_CREATED', 'BOOKING', bookingId,
        bookingCode + ' กลุ่ม ' + groupId + ' กันห้องและรออนุมัติ');
      results.push({ bookingId: bookingId, bookingCode: bookingCode, roomId: roomId });
    });
    refreshDashboardSheet_();
    return { ok: true, bookingGroupId: groupId, bookings: results };
  } finally {
    lock.releaseLock();
  }
}

function findAvailableRoomForPlan_(species, checkInDate, checkOutDate, excludedRoomIds) {
  var excluded = excludedRoomIds || [];
  var rooms = getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS)
    .filter(function (room) {
      return room.species === species &&
        room.status === APP.ROOM_STATUSES.AVAILABLE &&
        excluded.indexOf(room.room_id) === -1;
    })
    .sort(function (a, b) { return String(a.room_id).localeCompare(String(b.room_id)); });
  for (var index = 0; index < rooms.length; index += 1) {
    if (isRoomAvailableForRange_(
      rooms[index].room_id, species, checkInDate, checkOutDate, ''
    )) return rooms[index].room_id;
  }
  return '';
}

function createStaffOvernight_(session, payload, channel) {
  var request = validateOvernightRequest_(payload, true);
  var requestedRoomId = String(payload.preferredRoomId || '').trim().toUpperCase();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var provisionalRoomId = requestedRoomId;
    if (provisionalRoomId) {
      if (!isRoomAvailableForRange_(
        provisionalRoomId,
        request.species,
        request.checkInDate,
        request.checkOutDate,
        ''
      )) throw new Error('ห้องหรือกรงที่เลือกไม่ว่างในช่วงวันที่ระบุ');
    } else {
      if (getAvailableCount_(
        request.species,
        request.checkInDate,
        request.checkOutDate,
        ''
      ) < 1) throw new Error('ไม่มีห้องว่างในช่วงวันที่เลือก');
      provisionalRoomId = findAvailableRoomId_(
        request.species,
        request.checkInDate,
        request.checkOutDate,
        ''
      );
    }
    if (!provisionalRoomId) throw new Error('ไม่พบห้องว่างสำหรับช่วงวันที่เลือก');
    var quote = calculateOvernightCharge(
      request.species,
      request.pets,
      request.checkInDate,
      request.checkOutDate
    );
    var bookingId = newId_('BKG');
    var bookingCode = createUniqueRoomBookingCode_(
      request.checkInDate,
      provisionalRoomId
    );
    appendBookingAndPets_({
      bookingId: bookingId,
      bookingCode: bookingCode,
      channel: channel,
      bookingType: APP.BOOKING_TYPES.OVERNIGHT,
      status: APP.STATUSES.PENDING_APPROVAL,
      paymentStatus: APP.PAYMENT_STATUSES.NOT_REQUIRED,
      request: request,
      payload: payload,
      quote: quote,
      createdBy: session.user_id,
      assignedRoomId: provisionalRoomId
    });
    auditFromSession_(
      session,
      'BOOKING_CREATED',
      'BOOKING',
      bookingId,
      bookingCode + ' กันห้องและรออนุมัติ'
    );
    refreshDashboardSheet_();
    return {
      ok: true,
      bookingId: bookingId,
      bookingCode: bookingCode,
      status: APP.STATUSES.PENDING_APPROVAL,
      message: 'สร้างรายการและกันห้องแล้ว สถานะรออนุมัติห้อง'
    };
  } finally {
    lock.releaseLock();
  }
}

function createStaffDaycare_(session, payload, channel, ownCage) {
  var species = String(payload.species || '').toUpperCase();
  var pets = Array.isArray(payload.pets) ? payload.pets : [];
  validateAnimalCapacity(species, pets);
  if (ownCage) validateEmergencyOwnCage(species, pets, channel, true);
  var date = normalizeDateInput(payload.checkInDate || todayIso_());
  var startTime = String(payload.checkInTime || '');
  var endTime = String(payload.checkOutTime || '');
  validateVisitTime(date, startTime);
  validateVisitTime(date, endTime);
  var charge = calculateDaycareCharge(startTime, endTime, ownCage);
  var phone = normalizePhone(payload.phone);
  if (!/^0\d{8,9}$/.test(phone)) throw new Error('กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง');
  var bookingId = newId_('BKG');
  var bookingCode = createUniqueBookingCode_();
  var request = {
    customerName: cleanText_(payload.customerName, 120),
    phone: phone,
    contactHandle: cleanText_(payload.contactHandle, 120),
    species: species,
    pets: pets,
    checkInDate: date,
    checkOutDate: date,
    checkInTime: startTime,
    checkOutTime: endTime
  };
  appendBookingAndPets_({
    bookingId: bookingId,
    bookingCode: bookingCode,
    channel: channel,
    bookingType: ownCage ?
      APP.BOOKING_TYPES.EMERGENCY_OWN_CAGE :
      APP.BOOKING_TYPES.DAYCARE,
    status: APP.STATUSES.CONFIRMED,
    paymentStatus: APP.PAYMENT_STATUSES.NOT_REQUIRED,
    request: request,
    payload: payload,
    quote: {
      nights: 0,
      unitPrice: ownCage ? 0 : 50,
      lodgingTotal: charge.total
    },
    createdBy: session.user_id
  });
  auditFromSession_(
    session,
    'DAYCARE_CREATED',
    'BOOKING',
    bookingId,
    bookingCode + (ownCage ? ' กรงเจ้าของ ไม่คิดค่าบริการ' : ' ฝากรายชั่วโมง')
  );
  refreshDashboardSheet_();
  return {
    ok: true,
    bookingId: bookingId,
    bookingCode: bookingCode,
    total: charge.total,
    billableHours: charge.billableHours
  };
}

function appendBookingAndPets_(data) {
  var healthReviewRequired =
    !toBoolean_(data.payload.fleaTickTreated) ||
    toBoolean_(data.payload.fleaTickFoundNow);
  appendObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, {
    booking_id: data.bookingId,
    booking_code: data.bookingCode,
    created_at: nowIso_(),
    updated_at: nowIso_(),
    source_channel: data.channel,
    line_user_id: '',
    booking_type: data.bookingType,
    status: data.status,
    payment_status: data.paymentStatus,
    customer_name: data.request.customerName,
    phone: data.request.phone,
    contact_handle: data.request.contactHandle,
    species: data.request.species,
    pet_count: data.request.pets.length,
    check_in_date: data.request.checkInDate,
    check_out_date: data.request.checkOutDate,
    check_in_time: data.request.checkInTime,
    check_out_time: data.request.checkOutTime,
    nights: data.quote.nights,
    unit_price: data.quote.unitPrice,
    lodging_total: data.quote.lodgingTotal,
    deposit_required: false,
    deposit_amount: 0,
    payment_deadline: '',
    assigned_room_id: data.assignedRoomId || '',
    health_review_required: healthReviewRequired,
    health_review_status: healthReviewRequired ? 'PENDING' : 'NOT_REQUIRED',
    vaccination_file_id: '',
    flea_tick_treated: toBoolean_(data.payload.fleaTickTreated),
    flea_tick_date: String(data.payload.fleaTickDate || ''),
    flea_tick_product: cleanText_(data.payload.fleaTickProduct, 120),
    flea_tick_found_now: toBoolean_(data.payload.fleaTickFoundNow),
    food_option: normalizeFoodOption_(data.payload.foodOption),
    special_notes: cleanText_(data.payload.specialNotes, 1000),
    reschedule_count: 0,
    original_booking_id: '',
    checked_in_at: '',
    checked_out_at: '',
    cancel_reason: '',
    created_by: data.createdBy,
    approved_by: data.status === APP.STATUSES.CONFIRMED ? data.createdBy : '',
    approved_at: data.status === APP.STATUSES.CONFIRMED ? nowIso_() : '',
    version: 1,
    booking_group_id: data.bookingGroupId || '',
    check_in_notes: ''
  });
  data.request.pets.forEach(function (pet, index) {
    appendObject_(APP.SHEETS.PETS, PET_HEADERS, {
      pet_id: newId_('PET'),
      booking_id: data.bookingId,
      pet_order: index + 1,
      name: cleanText_(pet.name, 100),
      species: data.request.species,
      sex: cleanText_(pet.sex, 30),
      breed: cleanText_(pet.breed, 100),
      age_text: cleanText_(pet.ageText, 50),
      weight_kg: data.request.species === APP.SPECIES.DOG ? Number(pet.weightKg) : '',
      neutered: toBoolean_(pet.neutered),
      chronic_conditions: cleanText_(pet.chronicConditions, 500),
      current_medications: cleanText_(pet.currentMedications, 500),
      allergies: cleanText_(pet.allergies, 500),
      feeding_instructions: cleanText_(pet.feedingInstructions, 500),
      created_at: nowIso_()
    });
  });
}

function approveBooking(sessionToken, bookingId) {
  var session = requirePermission_(sessionToken, 'booking:approve');
  var booking = requireBookingStatus_(bookingId, [APP.STATUSES.PENDING_APPROVAL]);
  var changes = {
    approved_by: session.user_id,
    approved_at: nowIso_(),
    updated_at: nowIso_(),
    version: Number(booking.version || 0) + 1
  };
  if (booking.source_channel === APP.CHANNELS.LINE) {
    changes.status = APP.STATUSES.APPROVED_AWAITING_DEPOSIT;
    changes.payment_status = APP.PAYMENT_STATUSES.WAITING;
    changes.payment_deadline =
      new Date(Date.now() + APP.PAYMENT_WINDOW_MINUTES * 60000).toISOString();
  } else {
    changes.status = APP.STATUSES.CONFIRMED;
    changes.payment_status = APP.PAYMENT_STATUSES.NOT_REQUIRED;
  }
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, changes);
  auditFromSession_(session, 'BOOKING_APPROVED', 'BOOKING', bookingId, booking.booking_code);
  if (booking.source_channel === APP.CHANNELS.LINE && booking.line_user_id) {
    sendLineMessage_(booking.line_user_id, buildApprovalLineMessage_(booking, changes.payment_deadline));
  }
  refreshDashboardSheet_();
  return {
    ok: true,
    status: changes.status,
    paymentDeadline: changes.payment_deadline || ''
  };
}

function rejectBooking(sessionToken, bookingId, reason) {
  var session = requirePermission_(sessionToken, 'booking:reject');
  var booking = requireBookingStatus_(bookingId, [
    APP.STATUSES.PENDING_APPROVAL,
    APP.STATUSES.APPROVED_AWAITING_DEPOSIT
  ]);
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
    status: APP.STATUSES.REJECTED,
    payment_status: booking.payment_status === APP.PAYMENT_STATUSES.VERIFIED ?
      APP.PAYMENT_STATUSES.FORFEITED : booking.payment_status,
    cancel_reason: cleanText_(reason, 500),
    updated_at: nowIso_(),
    version: Number(booking.version || 0) + 1
  });
  auditFromSession_(session, 'BOOKING_REJECTED', 'BOOKING', bookingId, booking.booking_code);
  refreshDashboardSheet_();
  return { ok: true };
}

function verifyDeposit(sessionToken, bookingId, paymentId, sourceAccount) {
  var session = requirePermission_(sessionToken, 'payment:verify');
  var booking = requireBookingStatus_(bookingId, [APP.STATUSES.APPROVED_AWAITING_DEPOSIT]);
  if (!booking.payment_deadline ||
      new Date(booking.payment_deadline).getTime() <= Date.now()) {
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      status: APP.STATUSES.EXPIRED_PAYMENT,
      payment_status: APP.PAYMENT_STATUSES.EXPIRED,
      cancel_reason: 'ไม่ชำระมัดจำภายใน 1 ชั่วโมง',
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    refreshDashboardSheet_();
    throw new Error('รายการหมดเวลาชำระแล้ว ระบบคืนห้องเรียบร้อย');
  }
  var payment = findObject_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS, 'payment_id', paymentId);
  if (!payment || payment.booking_id !== bookingId ||
      payment.status !== APP.PAYMENT_STATUSES.SUBMITTED) {
    throw new Error('ไม่พบหลักฐานที่รอตรวจสอบ');
  }
  var accountName = cleanText_((sourceAccount || {}).accountName, 120);
  var accountNumber = String((sourceAccount || {}).accountNumber || '');
  if (!accountName || accountNumber.replace(/\D/g, '').length < 4) {
    throw new Error('กรุณาบันทึกชื่อบัญชีและเลขบัญชีต้นทางจากหลักฐานการโอน');
  }
  updateObjectRow_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS, payment._row, {
    status: APP.PAYMENT_STATUSES.VERIFIED,
    source_account_name: accountName,
    source_account_number_masked: maskAccountNumber_(accountNumber),
    verified_by: session.user_id,
    verified_at: nowIso_()
  });
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
    status: APP.STATUSES.CONFIRMED,
    payment_status: APP.PAYMENT_STATUSES.VERIFIED,
    updated_at: nowIso_(),
    version: Number(booking.version || 0) + 1
  });
  auditFromSession_(session, 'DEPOSIT_VERIFIED', 'BOOKING', bookingId, booking.booking_code);
  if (booking.line_user_id) {
    sendLineMessage_(
      booking.line_user_id,
      'ยืนยันรับมัดจำแล้ว\nรหัสการจอง ' + booking.booking_code +
      '\nสถานะ: ยืนยันการจอง'
    );
  }
  refreshDashboardSheet_();
  return { ok: true };
}

function roomHasBookingConflict_(roomId, booking, bookings) {
  return bookings.some(function (other) {
    if (other.booking_id === booking.booking_id) return false;
    if (other.booking_type !== APP.BOOKING_TYPES.OVERNIGHT) return false;
    if (other.assigned_room_id !== roomId) return false;
    if (!bookingConsumesCapacity(other.status)) return false;

    // A pet that has actually checked in physically occupies the room until
    // checkout is recorded, even when the planned checkout date has passed.
    if (other.status === APP.STATUSES.CHECKED_IN) return true;
    return rangesOverlap(
      other.check_in_date,
      other.check_out_date,
      booking.check_in_date,
      booking.check_out_date
    );
  });
}

function listAssignableRoomsForBooking_(booking) {
  if (booking.booking_type === APP.BOOKING_TYPES.EMERGENCY_OWN_CAGE) return [];
  var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
  return getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS)
    .filter(function (room) {
      if (room.species !== booking.species) return false;
      if ([APP.ROOM_STATUSES.DISABLED, APP.ROOM_STATUSES.MAINTENANCE]
        .indexOf(room.status) !== -1) return false;

      var isCurrent = room.room_id === booking.assigned_room_id;
      if (!isCurrent && room.status !== APP.ROOM_STATUSES.AVAILABLE) return false;
      if (!isCurrent && room.current_booking_id &&
          room.current_booking_id !== booking.booking_id) return false;
      return !roomHasBookingConflict_(room.room_id, booking, bookings);
    })
    .sort(function (a, b) {
      return String(a.room_id).localeCompare(String(b.room_id));
    })
    .map(function (room) {
      return {
        roomId: room.room_id,
        roomName: room.room_name,
        selected: room.room_id === booking.assigned_room_id
      };
    });
}

function assignRoom(sessionToken, bookingId, roomId) {
  var session = requirePermission_(sessionToken, 'booking:assign');
  var targetRoomId = String(roomId || '').trim().toUpperCase();
  if (!targetRoomId) throw new Error('กรุณาเลือกห้องพัก');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var booking = requireBookingStatus_(bookingId, [
      APP.STATUSES.PENDING_APPROVAL,
      APP.STATUSES.APPROVED_AWAITING_DEPOSIT,
      APP.STATUSES.CONFIRMED,
      APP.STATUSES.CHECKED_IN
    ]);
    if (booking.booking_type === APP.BOOKING_TYPES.EMERGENCY_OWN_CAGE) {
      throw new Error('รายการกรงเจ้าของไม่ผูกกับห้องพักของคลินิก');
    }
    var room = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', targetRoomId);
    if (!room || room.species !== booking.species ||
        [APP.ROOM_STATUSES.DISABLED, APP.ROOM_STATUSES.MAINTENANCE]
          .indexOf(room.status) !== -1) {
      throw new Error('ห้องพักไม่พร้อมใช้งาน');
    }
    var isCurrentRoom = targetRoomId === booking.assigned_room_id;
    if (!isCurrentRoom && room.status !== APP.ROOM_STATUSES.AVAILABLE) {
      throw new Error('ห้องพักไม่พร้อมใช้งาน');
    }
    if (!isCurrentRoom && room.current_booking_id &&
        room.current_booking_id !== bookingId) {
      throw new Error('ห้องพักนี้มีสัตว์กำลังเข้าพัก');
    }
    var bookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS);
    if (roomHasBookingConflict_(targetRoomId, booking, bookings)) {
      throw new Error('ห้องพักนี้ถูกกำหนดให้รายการอื่นหรือยังไม่ได้เช็กเอาท์');
    }

    var previousRoomId = booking.assigned_room_id;
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      assigned_room_id: targetRoomId,
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    if (booking.status === APP.STATUSES.CHECKED_IN) {
      if (previousRoomId && previousRoomId !== targetRoomId) {
        var previousRoom = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', previousRoomId);
        if (previousRoom && previousRoom.current_booking_id === bookingId) {
          updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, previousRoom._row, {
            current_booking_id: '',
            updated_at: nowIso_()
          });
        }
      }
      updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, room._row, {
        current_booking_id: bookingId,
        updated_at: nowIso_()
      });
    }
    auditFromSession_(session, 'ROOM_ASSIGNED', 'BOOKING', bookingId, targetRoomId);
    refreshDashboardSheet_();
    return { ok: true, roomId: targetRoomId };
  } finally {
    lock.releaseLock();
  }
}

function checkInBooking(sessionToken, bookingId, input) {
  var session = requirePermission_(sessionToken, 'booking:checkin');
  var payload = input || {};
  var depositAmount = Number(payload.depositAmount || 0);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    throw new Error('จำนวนเงินมัดจำไม่ถูกต้อง');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var booking = requireBookingStatus_(bookingId, [APP.STATUSES.CONFIRMED]);
    if (booking.booking_type !== APP.BOOKING_TYPES.EMERGENCY_OWN_CAGE &&
        !booking.assigned_room_id) {
      throw new Error('กรุณาเลือกห้องพักก่อนเช็กอิน');
    }
    var room = null;
    if (booking.assigned_room_id) {
      room = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', booking.assigned_room_id);
      if (!room || room.species !== booking.species ||
          [APP.ROOM_STATUSES.DISABLED, APP.ROOM_STATUSES.MAINTENANCE]
            .indexOf(room.status) !== -1) {
        throw new Error('ห้องพักที่เลือกไม่พร้อมใช้งาน');
      }
      if (room.current_booking_id && room.current_booking_id !== bookingId) {
        throw new Error('ห้องพักนี้มีสัตว์กำลังเข้าพัก');
      }
      if (roomHasBookingConflict_(
        room.room_id,
        booking,
        getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
      )) {
        throw new Error('ห้องพักนี้ถูกใช้งานหรือยังไม่ได้เช็กเอาท์');
      }
    }
    var existingDeposit = getAllObjects_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS)
      .filter(function (payment) {
        return payment.booking_id === bookingId && payment.payment_type === 'DEPOSIT' &&
          payment.status === APP.PAYMENT_STATUSES.VERIFIED;
      })
      .reduce(function (sum, payment) { return sum + Number(payment.amount || 0); }, 0);
    if (depositAmount < existingDeposit) {
      throw new Error('มัดจำที่รับจริงต้องไม่น้อยกว่ายอดที่ตรวจรับไว้แล้ว');
    }
    var additionalDeposit = depositAmount - existingDeposit;
    if (additionalDeposit > 0) {
      appendObject_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS, {
        payment_id: newId_('PAY'), booking_id: bookingId, payment_type: 'DEPOSIT',
        amount: additionalDeposit, status: APP.PAYMENT_STATUSES.VERIFIED,
        verified_by: session.user_id, verified_at: nowIso_(),
        notes: 'รับมัดจำเมื่อเช็กอิน', created_at: nowIso_()
      });
    }
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      status: APP.STATUSES.CHECKED_IN,
      deposit_amount: depositAmount,
      check_in_notes: cleanText_(payload.checkInNotes, 1500),
      checked_in_at: nowIso_(),
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    if (room) {
      updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, room._row, {
        current_booking_id: bookingId, updated_at: nowIso_()
      });
    }
    auditFromSession_(session, 'CHECK_IN', 'BOOKING', bookingId, booking.booking_code);
    refreshDashboardSheet_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function checkOutBooking(sessionToken, bookingId, chargeInputs, receiptInput) {
  var session = requirePermission_(sessionToken, 'booking:checkout');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var booking = requireBookingStatus_(bookingId, [APP.STATUSES.CHECKED_IN]);
    var normalizedReceiptInput = receiptInput || {};
    var plannedCheckOutDate = normalizeDateInput(booking.check_out_date);
    if (
      plannedCheckOutDate > todayIso_() &&
      normalizedReceiptInput.confirmEarlyCheckout !== true
    ) {
      throw new Error(
        'วันออกตามแผนคือ ' + formatThaiDate(plannedCheckOutDate) +
        ' กรุณายืนยันการเช็กเอาต์ก่อนกำหนด'
      );
    }
    var allowedChargeNames = ['ค่าอาหาร', 'ค่ายา', 'ให้น้ำเกลือ', 'ตรวจเลือด', 'อื่น ๆ'];
    var charges = Array.isArray(chargeInputs) ? chargeInputs : [];
    var normalizedCharges = charges.map(function (input) {
      var category = String(input.category || '');
      if (allowedChargeNames.indexOf(category) === -1) throw new Error('ประเภทค่าใช้จ่ายไม่ถูกต้อง');
      var amount = Number(input.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('จำนวนเงินค่าใช้จ่ายไม่ถูกต้อง');
      var detail = cleanText_(input.detail, 150);
      if (category === 'อื่น ๆ' && !detail) throw new Error('กรุณาระบุรายละเอียดค่าใช้จ่ายอื่น ๆ');
      return { category: category, amount: amount, detail: detail };
    });
    normalizedCharges.forEach(function (charge) {
      appendObject_(APP.SHEETS.CHARGES, CHARGE_HEADERS, {
        charge_id: newId_('CHG'), booking_id: bookingId, charge_date: todayIso_(),
        item_name: charge.category === 'อื่น ๆ' ? charge.detail : charge.category,
        quantity: 1, unit_price: charge.amount, amount: charge.amount,
        notes: charge.category === 'อื่น ๆ' ? 'ประเภท: อื่น ๆ' : charge.detail,
        created_by: session.user_id, created_at: nowIso_()
      });
    });
    var settlement = getBookingSettlement_(bookingId);
    var checkedOutAt = nowIso_();
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      status: APP.STATUSES.CHECKED_OUT,
      payment_status: settlement.refundDue > 0 ?
        APP.PAYMENT_STATUSES.REFUND_DUE : booking.payment_status,
      checked_out_at: checkedOutAt,
      updated_at: checkedOutAt,
      version: Number(booking.version || 0) + 1
    });
    if (booking.assigned_room_id) {
      var room = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', booking.assigned_room_id);
      if (room) updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, room._row, {
        status: APP.ROOM_STATUSES.CLEANING,
        current_booking_id: '',
        updated_at: checkedOutAt
      });
    }
    auditFromSession_(session, 'CHECK_OUT', 'BOOKING', bookingId, booking.booking_code);
    refreshDashboardSheet_();

    var receipt = null;
    var receiptError = '';
    try {
      var checkedOutBooking = findObject_(
        APP.SHEETS.BOOKINGS,
        BOOKING_HEADERS,
        'booking_id',
        bookingId
      );
      receipt = receiptViewModel_(
        issueReceiptForBooking_(session, checkedOutBooking, normalizedReceiptInput)
      );
    } catch (receiptIssueError) {
      // Do not put the animal back into an occupied room when receipt creation
      // alone fails. The receipt service can safely create it on first print.
      receiptError = receiptIssueError && receiptIssueError.message ?
        receiptIssueError.message : 'สร้างใบเสร็จไม่สำเร็จ';
    }
    return {
      ok: true,
      settlement: settlement,
      receipt: receipt,
      receiptError: receiptError
    };
  } finally {
    lock.releaseLock();
  }
}

function addCharge(sessionToken, bookingId, input) {
  var session = requirePermission_(sessionToken, 'charge:manage');
  if (!findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId)) {
    throw new Error('ไม่พบรายการจอง');
  }
  var quantity = Number((input || {}).quantity);
  var unitPrice = Number((input || {}).unitPrice);
  if (!Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('จำนวนหรือราคาไม่ถูกต้อง');
  }
  var chargeId = newId_('CHG');
  appendObject_(APP.SHEETS.CHARGES, CHARGE_HEADERS, {
    charge_id: chargeId,
    booking_id: bookingId,
    charge_date: todayIso_(),
    item_name: cleanText_((input || {}).itemName, 150),
    quantity: quantity,
    unit_price: unitPrice,
    amount: quantity * unitPrice,
    notes: cleanText_((input || {}).notes, 500),
    created_by: session.user_id,
    created_at: nowIso_()
  });
  auditFromSession_(session, 'CHARGE_ADDED', 'BOOKING', bookingId, chargeId);
  return { ok: true, settlement: getBookingSettlement_(bookingId) };
}

function approveReschedule(sessionToken, requestId) {
  var session = requirePermission_(sessionToken, 'booking:reschedule');
  var request = findObject_(
    APP.SHEETS.RESCHEDULES,
    RESCHEDULE_HEADERS,
    'request_id',
    requestId
  );
  if (!request || request.status !== APP.RESCHEDULE_STATUSES.PENDING) {
    throw new Error('ไม่พบคำขอเลื่อนวันที่รอดำเนินการ');
  }
  var booking = findObject_(
    APP.SHEETS.BOOKINGS,
    BOOKING_HEADERS,
    'booking_id',
    request.booking_id
  );
  var eligibility = canRequestReschedule(
    todayIso_(),
    booking.check_in_date,
    booking.reschedule_count
  );
  if (!eligibility.allowed) throw new Error(eligibility.reason);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (getAvailableCount_(
      booking.species,
      request.new_check_in,
      request.new_check_out,
      booking.booking_id
    ) < 1) throw new Error('ห้องในช่วงวันใหม่ไม่ว่างแล้ว');
    var provisionalRoomId = findAvailableRoomId_(
      booking.species,
      request.new_check_in,
      request.new_check_out,
      booking.booking_id
    );
    if (!provisionalRoomId) throw new Error('ไม่พบห้องว่างสำหรับช่วงวันใหม่');
    var quote = calculateOvernightCharge(
      booking.species,
      getAllObjects_(APP.SHEETS.PETS, PET_HEADERS)
        .filter(function (pet) { return pet.booking_id === booking.booking_id; })
        .map(function (pet) { return { weightKg: pet.weight_kg }; }),
      request.new_check_in,
      request.new_check_out
    );
    updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
      check_in_date: request.new_check_in,
      check_out_date: request.new_check_out,
      nights: quote.nights,
      unit_price: quote.unitPrice,
      lodging_total: quote.lodgingTotal,
      assigned_room_id: provisionalRoomId,
      reschedule_count: Number(booking.reschedule_count || 0) + 1,
      updated_at: nowIso_(),
      version: Number(booking.version || 0) + 1
    });
    updateObjectRow_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS, request._row, {
      status: APP.RESCHEDULE_STATUSES.APPROVED,
      processed_by: session.user_id,
      processed_at: nowIso_()
    });
    auditFromSession_(session, 'RESCHEDULE_APPROVED', 'BOOKING', booking.booking_id, requestId);
    refreshDashboardSheet_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function rejectReschedule(sessionToken, requestId, reason) {
  var session = requirePermission_(sessionToken, 'booking:reschedule');
  var request = findObject_(
    APP.SHEETS.RESCHEDULES,
    RESCHEDULE_HEADERS,
    'request_id',
    requestId
  );
  if (!request || request.status !== APP.RESCHEDULE_STATUSES.PENDING) {
    throw new Error('ไม่พบคำขอเลื่อนวันที่รอดำเนินการ');
  }
  updateObjectRow_(APP.SHEETS.RESCHEDULES, RESCHEDULE_HEADERS, request._row, {
    status: APP.RESCHEDULE_STATUSES.REJECTED,
    processed_by: session.user_id,
    processed_at: nowIso_(),
    reason: cleanText_(reason, 500)
  });
  auditFromSession_(session, 'RESCHEDULE_REJECTED', 'BOOKING', request.booking_id, requestId);
  return { ok: true };
}

function approveHealthReview(sessionToken, bookingId, note) {
  var session = requirePermission_(sessionToken, 'health:approve');
  var booking = findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId);
  if (!booking) throw new Error('ไม่พบรายการจอง');
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
    health_review_status: 'APPROVED',
    special_notes: cleanText_(
      String(booking.special_notes || '') + '\n[ตรวจสุขภาพ] ' + String(note || ''),
      1000
    ),
    updated_at: nowIso_(),
    version: Number(booking.version || 0) + 1
  });
  auditFromSession_(session, 'HEALTH_APPROVED', 'BOOKING', bookingId, cleanText_(note, 200));
  return { ok: true };
}

function listRooms(sessionToken, selectedDate) {
  requirePermission_(sessionToken, 'booking:view');
  var roomDate = normalizeDateInput(selectedDate || todayIso_());
  var petsByBookingId = {};
  getAllObjects_(APP.SHEETS.PETS, PET_HEADERS).forEach(function (pet) {
    if (!petsByBookingId[pet.booking_id]) petsByBookingId[pet.booking_id] = [];
    petsByBookingId[pet.booking_id].push(String(pet.name || '').trim());
  });
  var assignedBookings = getAllObjects_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS)
    .filter(function (booking) {
      return Boolean(booking.assigned_room_id);
    });
  var capacityBookings = assignedBookings.filter(function (booking) {
    return booking.booking_type === APP.BOOKING_TYPES.OVERNIGHT &&
      bookingConsumesCapacity(booking.status);
  });
  return getAllObjects_(APP.SHEETS.ROOMS, ROOM_HEADERS).map(function (room) {
    var displayState = 'AVAILABLE';
    var displayLabel = 'ว่าง';
    var bookingId = '';
    var bookingCode = '';
    var petNames = [];
    var checkInDate = '';
    var checkOutDate = '';
    var assignedRoomBookings = assignedBookings.filter(function (booking) {
      return booking.assigned_room_id === room.room_id;
    });
    var checkedIn = assignedRoomBookings.filter(function (booking) {
      return booking.status === APP.STATUSES.CHECKED_IN;
    })[0];

    // Actual occupancy always wins over the selected planning date and the
    // room's maintenance/cleaning flag. It ends only after checkout.
    if (checkedIn) {
      bookingId = checkedIn.booking_id;
      bookingCode = checkedIn.booking_code;
      petNames = (petsByBookingId[checkedIn.booking_id] || []).filter(Boolean);
      checkInDate = checkedIn.check_in_date;
      checkOutDate = checkedIn.check_out_date;
      displayState = 'OCCUPIED';
      displayLabel = 'กำลังเข้าพัก';
    } else if (room.status !== APP.ROOM_STATUSES.AVAILABLE) {
      displayState = 'UNAVAILABLE';
      displayLabel = roomStatusLabel_(room.status);
    } else {
      var roomBookings = capacityBookings.filter(function (booking) {
        return booking.assigned_room_id === room.room_id;
      });
      var plannedBookings = roomBookings.filter(function (booking) {
        return booking.status !== APP.STATUSES.CHECKED_IN &&
          booking.check_in_date <= roomDate &&
          booking.check_out_date > roomDate;
      });
      var approved = plannedBookings.filter(function (booking) {
        return [
          APP.STATUSES.APPROVED_AWAITING_DEPOSIT,
          APP.STATUSES.CONFIRMED
        ].indexOf(booking.status) !== -1;
      })[0];
      var pending = plannedBookings.filter(function (booking) {
        return booking.status === APP.STATUSES.PENDING_APPROVAL;
      })[0];
      var activeBooking = approved || pending;
      if (activeBooking) {
        bookingId = activeBooking.booking_id;
        bookingCode = activeBooking.booking_code;
        petNames = (petsByBookingId[activeBooking.booking_id] || []).filter(Boolean);
        checkInDate = activeBooking.check_in_date;
        checkOutDate = activeBooking.check_out_date;
        if (activeBooking.status === APP.STATUSES.PENDING_APPROVAL) {
          displayState = 'PENDING';
          displayLabel = 'รออนุมัติห้อง';
        } else {
          displayState = 'OCCUPIED';
          displayLabel = 'อนุมัติแล้ว';
        }
      }
    }
    return {
      roomId: room.room_id,
      roomName: room.room_name,
      species: room.species,
      status: room.status,
      notes: room.notes,
      displayState: displayState,
      displayLabel: displayLabel,
      bookingId: bookingId,
      bookingCode: bookingCode,
      petNames: petNames,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      selectedDate: roomDate
    };
  });
}

function roomStatusLabel_(status) {
  var labels = {};
  labels[APP.ROOM_STATUSES.AVAILABLE] = 'ว่าง';
  labels[APP.ROOM_STATUSES.CLEANING] = 'กำลังทำความสะอาด';
  labels[APP.ROOM_STATUSES.MAINTENANCE] = 'ปิดซ่อมบำรุง';
  labels[APP.ROOM_STATUSES.DISABLED] = 'ปิดใช้งาน';
  return labels[status] || status;
}

function updateRoom(sessionToken, roomId, input) {
  var session = requirePermission_(sessionToken, 'room:manage');
  var room = findObject_(APP.SHEETS.ROOMS, ROOM_HEADERS, 'room_id', roomId);
  if (!room) throw new Error('ไม่พบห้องหรือกรง');
  var status = String((input || {}).status || '');
  if (Object.keys(APP.ROOM_STATUSES).map(function (key) {
    return APP.ROOM_STATUSES[key];
  }).indexOf(status) === -1) throw new Error('สถานะห้องไม่ถูกต้อง');
  updateObjectRow_(APP.SHEETS.ROOMS, ROOM_HEADERS, room._row, {
    status: status,
    notes: cleanText_((input || {}).notes, 500),
    updated_at: nowIso_()
  });
  auditFromSession_(session, 'ROOM_UPDATED', 'ROOM', roomId, status);
  refreshDashboardSheet_();
  return { ok: true };
}

function markRefunded(sessionToken, bookingId, input) {
  var session = requirePermission_(sessionToken, 'payment:refund');
  var settlement = getBookingSettlement_(bookingId);
  if (settlement.refundDue <= 0) throw new Error('รายการนี้ไม่มีส่วนต่างที่ต้องคืน');
  if (!toBoolean_((input || {}).verifiedOriginalAccount)) {
    throw new Error('ต้องยืนยันว่าชื่อและเลขบัญชีตรงกับบัญชีที่โอนเข้ามา');
  }
  var originalPayment = getAllObjects_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS)
    .filter(function (payment) {
      return payment.booking_id === bookingId &&
        payment.payment_type === 'DEPOSIT' &&
        payment.status === APP.PAYMENT_STATUSES.VERIFIED;
    })[0];
  if (!originalPayment) throw new Error('ไม่พบข้อมูลมัดจำที่ตรวจรับแล้ว');
  var refundName = cleanText_((input || {}).accountName, 120);
  var refundNumber = String((input || {}).accountNumber || '');
  var originalLastFour = String(originalPayment.source_account_number_masked || '').slice(-4);
  var refundLastFour = refundNumber.replace(/\D/g, '').slice(-4);
  if (normalizeAccountName_(refundName) !==
      normalizeAccountName_(originalPayment.source_account_name) ||
      !originalLastFour || originalLastFour !== refundLastFour) {
    throw new Error('ชื่อบัญชีหรือเลขบัญชีไม่ตรงกับข้อมูลต้นทางที่บันทึกไว้');
  }
  var booking = findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId);
  appendObject_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS, {
    payment_id: newId_('PAY'),
    booking_id: bookingId,
    payment_type: 'REFUND',
    amount: settlement.refundDue,
    status: APP.PAYMENT_STATUSES.REFUNDED,
    slip_file_id: '',
    source_account_name: '',
    source_account_number_masked: '',
    verified_by: '',
    verified_at: '',
    refund_amount: settlement.refundDue,
    refund_account_name: refundName,
    refund_account_number_masked: maskAccountNumber_(refundNumber),
    refund_verified_original_account: true,
    refund_by: session.user_id,
    refund_at: nowIso_(),
    notes: cleanText_((input || {}).notes, 500),
    created_at: nowIso_()
  });
  updateObjectRow_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, booking._row, {
    payment_status: APP.PAYMENT_STATUSES.REFUNDED,
    updated_at: nowIso_()
  });
  auditFromSession_(session, 'REFUND_RECORDED', 'BOOKING', bookingId, String(settlement.refundDue));
  return { ok: true };
}

function getAdminSettings(sessionToken) {
  requirePermission_(sessionToken, 'settings:manage');
  var settings = getSettingsMap_();
  return {
    clinicName: settings.clinic_name_th || APP.NAME_TH,
    clinicNameTh: settings.clinic_name_th || APP.NAME_TH,
    clinicNameEn: settings.clinic_name_en || APP.NAME_EN,
    clinicPhone: settings.clinic_phone || '',
    logoDataUrl: getClinicLogoDataUrl_(),
    bankName: settings.bank_name || '',
    bankAccountName: settings.bank_account_name || '',
    bankAccountNumber: settings.bank_account_number || '',
    promptPayQrUrl: settings.promptpay_qr_url || '',
    lineOaUrl: settings.line_oa_url || '',
    facebookUrl: settings.facebook_url || '',
    lineConfigured: Boolean(PropertiesService.getScriptProperties()
      .getProperty(APP.PROPERTY_KEYS.LINE_CHANNEL_ACCESS_TOKEN)),
    liffId: PropertiesService.getScriptProperties()
      .getProperty(APP.PROPERTY_KEYS.LIFF_ID) || ''
  };
}

function updateAdminSettings(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'settings:manage');
  var values = input || {};
  var allowed = {
    clinicName: 'clinic_name_th',
    clinicNameTh: 'clinic_name_th',
    clinicNameEn: 'clinic_name_en',
    clinicPhone: 'clinic_phone',
    bankName: 'bank_name',
    bankAccountName: 'bank_account_name',
    bankAccountNumber: 'bank_account_number',
    promptPayQrUrl: 'promptpay_qr_url',
    lineOaUrl: 'line_oa_url',
    facebookUrl: 'facebook_url'
  };
  Object.keys(allowed).forEach(function (clientKey) {
    if (Object.prototype.hasOwnProperty.call(values, clientKey)) {
      setSetting_(allowed[clientKey], cleanText_(values[clientKey], 500));
    }
  });
  auditFromSession_(session, 'SETTINGS_UPDATED', 'SETTINGS', 'GENERAL', 'อัปเดตค่าระบบ');
  return { ok: true };
}

function uploadClinicLogo(sessionToken, fileInput) {
  var session = requirePermission_(sessionToken, 'settings:manage');
  if (!fileInput || !fileInput.data) throw new Error('กรุณาเลือกไฟล์โลโก้');

  var mimeType = String(fileInput.mimeType || '').toLowerCase();
  var allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.indexOf(mimeType) === -1) {
    throw new Error('โลโก้รองรับเฉพาะ JPG, PNG หรือ WEBP');
  }
  var expectedPrefix = 'data:' + mimeType + ';base64,';
  var encoded = String(fileInput.data || '');
  if (encoded.indexOf(expectedPrefix) !== 0) throw new Error('ข้อมูลไฟล์โลโก้ไม่ถูกต้อง');

  var bytes;
  try {
    bytes = Utilities.base64Decode(encoded.substring(expectedPrefix.length));
  } catch (error) {
    throw new Error('อ่านข้อมูลไฟล์โลโก้ไม่สำเร็จ');
  }
  if (!bytes.length || bytes.length > APP.MAX_LOGO_BYTES) {
    throw new Error('โลโก้ต้องมีขนาดไม่เกิน 1 MB');
  }
  validateClinicLogoSignature_(bytes, mimeType);

  var extension = mimeType === 'image/png' ? '.png' :
    mimeType === 'image/webp' ? '.webp' : '.jpg';
  var blob = Utilities.newBlob(bytes, mimeType, 'clinic-logo-' + Date.now() + extension);
  var folderId = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.UPLOAD_FOLDER_ID) || ensureUploadFolder_();
  var newFile = DriveApp.getFolderById(folderId).createFile(blob);
  newFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  var oldFileId = String(getSettingsMap_().clinic_logo_file_id || '').trim();
  setSetting_('clinic_logo_file_id', newFile.getId());
  if (oldFileId && oldFileId !== newFile.getId()) {
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (error) {}
  }

  auditFromSession_(session, 'CLINIC_LOGO_UPDATED', 'SETTINGS', 'CLINIC_LOGO', 'อัปเดตโลโก้สถานบริการ');
  return { ok: true, logoDataUrl: getClinicLogoDataUrl_() };
}

function validateClinicLogoSignature_(bytes, mimeType) {
  var value = function (index) { return Number(bytes[index]) & 255; };
  var valid = false;
  if (mimeType === 'image/jpeg') {
    valid = bytes.length >= 3 && value(0) === 255 && value(1) === 216 && value(2) === 255;
  } else if (mimeType === 'image/png') {
    valid = bytes.length >= 8 && value(0) === 137 && value(1) === 80 && value(2) === 78 &&
      value(3) === 71 && value(4) === 13 && value(5) === 10 && value(6) === 26 && value(7) === 10;
  } else if (mimeType === 'image/webp') {
    valid = bytes.length >= 12 && value(0) === 82 && value(1) === 73 && value(2) === 70 &&
      value(3) === 70 && value(8) === 87 && value(9) === 69 && value(10) === 66 && value(11) === 80;
  }
  if (!valid) throw new Error('เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพที่เลือก');
}

function getBookingSettlement_(bookingId) {
  var booking = findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId);
  if (!booking) throw new Error('ไม่พบรายการจอง');
  var extra = getAllObjects_(APP.SHEETS.CHARGES, CHARGE_HEADERS)
    .filter(function (charge) { return charge.booking_id === bookingId; })
    .reduce(function (sum, charge) { return sum + Number(charge.amount || 0); }, 0);
  var paid = getAllObjects_(APP.SHEETS.PAYMENTS, PAYMENT_HEADERS)
    .filter(function (payment) {
      return payment.booking_id === bookingId &&
        payment.payment_type === 'DEPOSIT' &&
        payment.status === APP.PAYMENT_STATUSES.VERIFIED;
    })
    .reduce(function (sum, payment) { return sum + Number(payment.amount || 0); }, 0);
  var settlement = finalSettlement(Number(booking.lodging_total || 0), extra, paid);
  settlement.lodgingTotal = Number(booking.lodging_total || 0);
  settlement.extraCharges = extra;
  settlement.depositPaid = paid;
  return settlement;
}

function requireBookingStatus_(bookingId, allowedStatuses) {
  var booking = findObject_(APP.SHEETS.BOOKINGS, BOOKING_HEADERS, 'booking_id', bookingId);
  if (!booking) throw new Error('ไม่พบรายการจอง');
  if (allowedStatuses.indexOf(booking.status) === -1) {
    throw new Error('สถานะปัจจุบันไม่รองรับการดำเนินการนี้');
  }
  return booking;
}

function groupPetsByBookingId_() {
  var grouped = {};
  getAllObjects_(APP.SHEETS.PETS, PET_HEADERS).forEach(function (pet) {
    if (!grouped[pet.booking_id]) grouped[pet.booking_id] = [];
    grouped[pet.booking_id].push(pet);
  });
  Object.keys(grouped).forEach(function (bookingId) {
    grouped[bookingId].sort(function (a, b) {
      return Number(a.pet_order || 0) - Number(b.pet_order || 0);
    });
  });
  return grouped;
}

function petSpeciesLabelTh_(species) {
  if (species === APP.SPECIES.CAT) return 'แมว';
  if (species === APP.SPECIES.DOG) return 'สุนัข';
  return 'สัตว์เลี้ยง';
}

function petDisplayLabels_(pets, fallbackSpecies) {
  return (pets || []).map(function (pet) {
    var name = String(pet.name || '').trim() || 'ไม่ระบุชื่อ';
    return name + ' (' + petSpeciesLabelTh_(pet.species || fallbackSpecies) + ')';
  });
}

function publicBookingSummary_(booking, pets) {
  return {
    bookingId: booking.booking_id,
    bookingCode: booking.booking_code,
    createdAt: booking.created_at,
    channel: booking.source_channel,
    bookingType: booking.booking_type,
    status: booking.status,
    statusLabel: bookingStatusLabel_(booking.status),
    customerName: booking.customer_name,
    phone: formatPhoneInternational(booking.phone),
    species: booking.species,
    petCount: Number(booking.pet_count || 0),
    petNames: (pets || []).map(function (pet) { return String(pet.name || '').trim(); })
      .filter(Boolean),
    petLabels: petDisplayLabels_(pets, booking.species),
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
    nights: Number(booking.nights || 0),
    roomId: booking.assigned_room_id || '',
    paymentStatus: booking.payment_status,
    healthReviewStatus: booking.health_review_status
  };
}

function publicBookingDetail_(booking, pets) {
  var output = publicBookingSummary_(booking, pets || []);
  [
    'contact_handle', 'check_in_time', 'check_out_time', 'nights',
    'unit_price', 'lodging_total', 'deposit_required', 'deposit_amount',
    'payment_deadline', 'health_review_required', 'vaccination_file_id',
    'flea_tick_treated', 'flea_tick_date', 'flea_tick_product',
    'flea_tick_found_now', 'food_option', 'special_notes',
    'reschedule_count', 'checked_in_at', 'checked_out_at'
    , 'booking_group_id', 'check_in_notes'
  ].forEach(function (key) { output[key] = booking[key]; });
  return output;
}

function redactPayment_(payment) {
  return {
    paymentId: payment.payment_id,
    paymentType: payment.payment_type,
    amount: Number(payment.amount || 0),
    status: payment.status,
    hasSlip: Boolean(payment.slip_file_id),
    slipFileId: payment.slip_file_id,
    verifiedAt: payment.verified_at,
    refundAmount: Number(payment.refund_amount || 0),
    refundAccountName: payment.refund_account_name,
    refundAccountNumberMasked: payment.refund_account_number_masked,
    notes: payment.notes,
    createdAt: payment.created_at
  };
}

function maskAccountNumber_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) throw new Error('เลขบัญชีไม่ถูกต้อง');
  return Array(Math.max(1, digits.length - 3)).join('*') + digits.slice(-4);
}

function normalizeAccountName_(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}
