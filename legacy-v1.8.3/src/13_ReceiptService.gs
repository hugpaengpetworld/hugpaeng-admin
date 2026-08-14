/**
 * Receipt service for boarding check-out.
 *
 * Receipts are stored as immutable snapshots in the receipt sheets. The
 * browser receives a self-contained 80 mm HTML document and sends it to the
 * operating-system print dialog, which works with standard thermal printers.
 */

var RECEIPT_PAYMENT_METHODS = [
  'เงินสด', 'โอนเงิน', 'พร้อมเพย์', 'บัตร', 'อื่น ๆ', 'ไม่ระบุ'
];

function getReceiptForBooking(sessionToken, bookingId) {
  var session = requirePermission_(sessionToken, 'receipt:view');
  return getOrCreateReceiptForBooking_(session, bookingId, {});
}

function getPrintableReceipt(sessionToken, bookingId) {
  var session = requirePermission_(sessionToken, 'receipt:print');
  var receipt = getOrCreateReceiptForBooking_(session, bookingId, {});
  return {
    receipt: receipt,
    html: buildReceiptHtml_(receipt)
  };
}

function getOrCreateReceiptForBooking_(session, bookingId, receiptInput) {
  var normalizedBookingId = String(bookingId || '').trim();
  if (!normalizedBookingId) throw new Error('ไม่พบรหัสรายการจอง');

  var existing = findActiveReceiptByBookingId_(normalizedBookingId);
  if (existing) return receiptViewModel_(existing);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    existing = findActiveReceiptByBookingId_(normalizedBookingId);
    if (existing) return receiptViewModel_(existing);

    var booking = findObject_(
      APP.SHEETS.BOOKINGS,
      BOOKING_HEADERS,
      'booking_id',
      normalizedBookingId
    );
    if (!booking) throw new Error('ไม่พบรายการจอง');
    if (booking.status !== APP.STATUSES.CHECKED_OUT) {
      throw new Error('ออกใบเสร็จได้หลังจากเช็กเอาต์แล้วเท่านั้น');
    }
    return receiptViewModel_(issueReceiptForBooking_(session, booking, receiptInput));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates one receipt snapshot. The caller must hold ScriptLock when this is
 * called from a mutating flow such as checkOutBooking().
 */
function issueReceiptForBooking_(session, booking, receiptInput) {
  var existing = findActiveReceiptByBookingId_(booking.booking_id);
  if (existing) return existing;
  if (booking.status !== APP.STATUSES.CHECKED_OUT) {
    throw new Error('ออกใบเสร็จได้หลังจากเช็กเอาต์แล้วเท่านั้น');
  }

  var input = receiptInput || {};
  var paymentMethod = cleanText_(input.paymentMethod, 60) || 'ไม่ระบุ';
  if (RECEIPT_PAYMENT_METHODS.indexOf(paymentMethod) === -1) {
    throw new Error('วิธีชำระเงินไม่ถูกต้อง');
  }

  var pets = getAllObjects_(APP.SHEETS.PETS, PET_HEADERS).filter(function (pet) {
    return pet.booking_id === booking.booking_id;
  });
  var charges = getAllObjects_(APP.SHEETS.CHARGES, CHARGE_HEADERS).filter(function (charge) {
    return charge.booking_id === booking.booking_id;
  });
  var settlement = getBookingSettlement_(booking.booking_id);
  var issuedAt = nowIso_();
  var receiptId = newId_('RCP');
  var receiptNo = nextReceiptNumber_();
  var actualCheckOut = booking.checked_out_at || issuedAt;
  var stayNights = Math.max(0, Number(booking.nights || 0));
  var stayDays = Math.max(
    1,
    receiptDateDiffDays_(booking.check_in_date, booking.check_out_date) + 1
  );
  var roomSummary = booking.assigned_room_id || 'ไม่ระบุห้อง';
  var petSummary = pets.length ? pets.map(function (pet) {
    return (String(pet.name || '').trim() || 'ไม่ระบุชื่อ') +
      ' (' + petSpeciesLabelTh_(pet.species || booking.species) + ')';
  }).join(', ') : petSpeciesLabelTh_(booking.species) + ' ' + Number(booking.pet_count || 0) + ' ตัว';

  var receipt = {
    receipt_id: receiptId,
    receipt_no: receiptNo,
    booking_id: booking.booking_id,
    issued_at: issuedAt,
    customer_name: booking.customer_name,
    customer_phone: formatPhoneInternational(booking.phone),
    pet_summary: petSummary,
    room_summary: roomSummary,
    actual_checkin: booking.checked_in_at || '',
    actual_checkout: actualCheckOut,
    stay_days: stayDays,
    stay_nights: stayNights,
    total_amount: Number(settlement.total || 0),
    deposit_amount: Number(settlement.depositPaid || 0),
    amount_due: Number(settlement.amountDue || 0),
    paid_at_checkout: Math.max(0, Number(settlement.amountDue || 0)),
    refund_amount: Number(settlement.refundDue || 0),
    payment_method: paymentMethod,
    payment_status: Number(settlement.refundDue || 0) > 0 ? 'REFUND_DUE' : 'PAID',
    receipt_status: 'ISSUED',
    pdf_file_id: '',
    created_by: session.user_id,
    created_at: issuedAt,
    voided_at: '',
    voided_by: '',
    void_reason: '',
    notes: cleanText_(input.notes, 1000)
  };
  appendObject_(APP.SHEETS.RECEIPTS, RECEIPT_HEADERS, receipt);

  var lineNo = 1;
  var lodgingQuantity = booking.booking_type === APP.BOOKING_TYPES.OVERNIGHT ?
    Math.max(1, stayNights) : 1;
  var lodgingUnit = booking.booking_type === APP.BOOKING_TYPES.OVERNIGHT ? 'คืน' : 'รายการ';
  var lodgingTotal = Number(settlement.lodgingTotal || 0);
  appendReceiptItem_(receipt, {
    lineNo: lineNo++,
    itemType: 'LODGING',
    itemName: booking.booking_type === APP.BOOKING_TYPES.OVERNIGHT ? 'ค่าที่พัก' : 'ค่าฝากเลี้ยง',
    description: booking.check_in_date + ' ถึง ' + booking.check_out_date,
    petName: petSummary,
    roomId: booking.assigned_room_id,
    quantity: lodgingQuantity,
    unit: lodgingUnit,
    unitPrice: lodgingQuantity ? lodgingTotal / lodgingQuantity : lodgingTotal,
    amount: lodgingTotal,
    serviceDate: booking.check_out_date,
    notes: ''
  });

  charges.forEach(function (charge) {
    appendReceiptItem_(receipt, {
      lineNo: lineNo++,
      itemType: 'EXTRA',
      itemName: charge.item_name || 'ค่าใช้จ่ายเพิ่มเติม',
      description: charge.notes || '',
      petName: '',
      roomId: booking.assigned_room_id,
      quantity: Number(charge.quantity || 1),
      unit: 'รายการ',
      unitPrice: Number(charge.unit_price || charge.amount || 0),
      amount: Number(charge.amount || 0),
      serviceDate: charge.charge_date || booking.check_out_date,
      notes: charge.notes || ''
    });
  });

  auditFromSession_(session, 'RECEIPT_ISSUED', 'RECEIPT', receiptId, receiptNo);
  return receipt;
}

function appendReceiptItem_(receipt, input) {
  appendObject_(APP.SHEETS.RECEIPT_ITEMS, RECEIPT_ITEM_HEADERS, {
    receipt_item_id: newId_('RCPI'),
    receipt_id: receipt.receipt_id,
    receipt_no: receipt.receipt_no,
    booking_id: receipt.booking_id,
    line_no: input.lineNo,
    item_type: input.itemType,
    item_name: input.itemName,
    description: input.description,
    pet_name: input.petName,
    room_id: input.roomId,
    quantity: input.quantity,
    unit: input.unit,
    unit_price: roundReceiptAmount_(input.unitPrice),
    amount: roundReceiptAmount_(input.amount),
    service_date: input.serviceDate,
    notes: input.notes,
    created_at: receipt.created_at
  });
}

function findActiveReceiptByBookingId_(bookingId) {
  var receipts = getAllObjects_(APP.SHEETS.RECEIPTS, RECEIPT_HEADERS).filter(function (receipt) {
    return receipt.booking_id === bookingId && receipt.receipt_status !== 'VOID';
  });
  receipts.sort(function (a, b) {
    return String(b.issued_at || '').localeCompare(String(a.issued_at || ''));
  });
  return receipts[0] || null;
}

function nextReceiptNumber_() {
  var datePart = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd');
  var prefix = 'BMP-RCP-' + datePart + '-';
  var highest = getAllObjects_(APP.SHEETS.RECEIPTS, RECEIPT_HEADERS)
    .reduce(function (max, receipt) {
      var value = String(receipt.receipt_no || '');
      if (value.indexOf(prefix) !== 0) return max;
      var sequence = Number(value.slice(prefix.length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0);
  return prefix + String(highest + 1).padStart(4, '0');
}

function receiptViewModel_(receipt) {
  var booking = findObject_(
    APP.SHEETS.BOOKINGS,
    BOOKING_HEADERS,
    'booking_id',
    receipt.booking_id
  );
  var items = getAllObjects_(APP.SHEETS.RECEIPT_ITEMS, RECEIPT_ITEM_HEADERS)
    .filter(function (item) { return item.receipt_id === receipt.receipt_id; })
    .sort(function (a, b) { return Number(a.line_no || 0) - Number(b.line_no || 0); })
    .map(function (item) {
      return {
        lineNo: Number(item.line_no || 0),
        itemType: item.item_type,
        itemName: item.item_name,
        description: item.description,
        petName: item.pet_name,
        roomId: item.room_id,
        quantity: Number(item.quantity || 0),
        unit: item.unit,
        unitPrice: Number(item.unit_price || 0),
        amount: Number(item.amount || 0),
        serviceDate: item.service_date,
        notes: item.notes
      };
    });
  return {
    receiptId: receipt.receipt_id,
    receiptNo: receipt.receipt_no,
    bookingId: receipt.booking_id,
    bookingCode: booking ? booking.booking_code : receipt.booking_id,
    issuedAt: receipt.issued_at,
    customerName: receipt.customer_name,
    customerPhone: formatPhoneInternational(receipt.customer_phone),
    petSummary: receipt.pet_summary,
    roomSummary: receipt.room_summary,
    actualCheckIn: receipt.actual_checkin,
    actualCheckOut: receipt.actual_checkout,
    stayDays: Number(receipt.stay_days || 0),
    stayNights: Number(receipt.stay_nights || 0),
    totalAmount: Number(receipt.total_amount || 0),
    depositAmount: Number(receipt.deposit_amount || 0),
    amountDue: Number(receipt.amount_due || 0),
    paidAtCheckout: Number(receipt.paid_at_checkout || 0),
    refundAmount: Number(receipt.refund_amount || 0),
    paymentMethod: receipt.payment_method,
    paymentStatus: receipt.payment_status,
    receiptStatus: receipt.receipt_status,
    notes: receipt.notes,
    items: items
  };
}

function buildReceiptHtml_(receipt) {
  var settings = getSettingsMap_();
  var clinicNameTh = settings.clinic_name_th || settings.clinic_name || APP.NAME_TH;
  var clinicNameEn = settings.clinic_name_en || APP.NAME_EN;
  var clinicPhone = settings.clinic_phone || settings.phone || '';
  var itemRows = receipt.items.map(function (item) {
    return '<tr><td><strong>' + escapeReceiptHtml_(item.itemName) + '</strong>' +
      (item.description ? '<br><small>' + escapeReceiptHtml_(item.description) + '</small>' : '') +
      '</td><td class="num">' + formatReceiptMoney_(item.amount) + '</td></tr>';
  }).join('');
  var refundRow = receipt.refundAmount > 0 ?
    '<div class="total-row"><span>เงินทอน/คืนลูกค้า</span><strong>' +
      formatReceiptMoney_(receipt.refundAmount) + ' บาท</strong></div>' : '';
  var noteBlock = receipt.notes ?
    '<section><strong>หมายเหตุ</strong><p>' + escapeReceiptHtml_(receipt.notes) + '</p></section>' : '';

  return '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeReceiptHtml_(receipt.receiptNo) + '</title><style>' +
    '@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:0;background:#eee}' +
    '.receipt{width:72mm;max-width:100%;margin:16px auto;background:#fff;padding:4mm;font-size:12px;line-height:1.45}' +
    'h1{font-size:16px;margin:0;text-align:center}h2{font-size:14px;margin:2px 0;text-align:center}.center{text-align:center}' +
    '.muted{color:#555}.rule{border-top:1px dashed #333;margin:10px 0}.info{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}' +
    'table{width:100%;border-collapse:collapse}th,td{padding:5px 0;border-bottom:1px dashed #aaa;text-align:left;vertical-align:top}' +
    '.num{text-align:right;white-space:nowrap}.total-row{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.grand{font-size:15px;border-top:2px solid #111;padding-top:6px}' +
    'section p{margin:4px 0;white-space:pre-wrap}.actions{text-align:center;margin:16px}.actions button{padding:10px 18px;border:0;border-radius:8px;background:#123D32;color:#fff;font-weight:bold}' +
    '@media print{body{background:#fff}.receipt{width:auto;margin:0;padding:0}.actions{display:none}}' +
    '</style></head><body><main class="receipt"><h1>' + escapeReceiptHtml_(clinicNameTh) + '</h1>' +
    (clinicNameEn ? '<h2>' + escapeReceiptHtml_(clinicNameEn) + '</h2>' : '') +
    (clinicPhone ? '<div class="center muted">โทร ' + escapeReceiptHtml_(clinicPhone) + '</div>' : '') +
    '<div class="rule"></div><h2>ใบเสร็จรับเงิน</h2><div class="center">เลขที่ ' +
    escapeReceiptHtml_(receipt.receiptNo) + '</div><div class="center muted">' +
    escapeReceiptHtml_(formatReceiptDateTime_(receipt.issuedAt)) + '</div><div class="rule"></div>' +
    '<div class="info"><span>รหัสจอง</span><strong>' +
    escapeReceiptHtml_(receipt.bookingCode || receipt.bookingId) + '</strong>' +
    '<span>ลูกค้า</span><strong>' + escapeReceiptHtml_(receipt.customerName) + '</strong>' +
    '<span>โทร</span><strong>' + escapeReceiptHtml_(receipt.customerPhone) + '</strong>' +
    '<span>สัตว์เลี้ยง</span><strong>' + escapeReceiptHtml_(receipt.petSummary) + '</strong>' +
    '<span>ห้องพัก</span><strong>' + escapeReceiptHtml_(receipt.roomSummary) + '</strong></div>' +
    '<div class="rule"></div><table><thead><tr><th>รายการ</th><th class="num">จำนวนเงิน</th></tr></thead><tbody>' +
    itemRows + '</tbody></table><div class="total-row"><span>รวม</span><strong>' +
    formatReceiptMoney_(receipt.totalAmount) + ' บาท</strong></div><div class="total-row"><span>หักมัดจำ</span><strong>' +
    formatReceiptMoney_(receipt.depositAmount) + ' บาท</strong></div><div class="total-row grand"><span>รับเพิ่ม ณ เช็กเอาต์</span><strong>' +
    formatReceiptMoney_(receipt.paidAtCheckout) + ' บาท</strong></div>' + refundRow +
    '<div class="total-row"><span>วิธีชำระ</span><strong>' + escapeReceiptHtml_(receipt.paymentMethod) + '</strong></div>' +
    noteBlock + '<div class="rule"></div><p class="center">ขอบคุณที่ใช้บริการ</p></main>' +
    '<div class="actions"><button onclick="window.print()">พิมพ์ใบเสร็จ</button></div></body></html>';
}

function formatReceiptDateTime_(value) {
  if (!value) return '';
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, APP.TIMEZONE, 'dd-MM-yyyy HH:mm');
}

function formatReceiptMoney_(value) {
  var number = roundReceiptAmount_(value);
  var parts = number.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function receiptDateDiffDays_(startIso, endIso) {
  return Math.round(
    (parseIsoDate(endIso).getTime() - parseIsoDate(startIso).getTime()) /
    (24 * 60 * 60 * 1000)
  );
}

function roundReceiptAmount_(value) {
  var number = Number(value || 0);
  if (!Number.isFinite(number)) number = 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function escapeReceiptHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
