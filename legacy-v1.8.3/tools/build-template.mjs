import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "output");
await fs.mkdir(outputDir, { recursive: true });

const colors = {
  dark: "#123D32",
  active: "#2F755B",
  accent: "#85C9A5",
  pale: "#DCECE3",
  light: "#F5F7F4",
  white: "#FFFFFF",
  border: "#C9D8D0",
  warning: "#FFF5D9",
  warningText: "#7A510B",
  danger: "#FFEFED",
  dangerText: "#A33A33",
};

const bookingHeaders = [
  "booking_id","booking_code","created_at","updated_at","source_channel",
  "line_user_id","booking_type","status","payment_status","customer_name",
  "phone","contact_handle","species","pet_count","check_in_date",
  "check_out_date","check_in_time","check_out_time","nights","unit_price",
  "lodging_total","deposit_required","deposit_amount","payment_deadline",
  "assigned_room_id","health_review_required","health_review_status",
  "vaccination_file_id","flea_tick_treated","flea_tick_date",
  "flea_tick_product","flea_tick_found_now","food_option","special_notes",
  "reschedule_count","original_booking_id","checked_in_at","checked_out_at",
  "cancel_reason","created_by","approved_by","approved_at","version"
  ,"booking_group_id","check_in_notes"
];
const petHeaders = [
  "pet_id","booking_id","pet_order","name","species","sex","breed","age_text",
  "weight_kg","neutered","chronic_conditions","current_medications","allergies",
  "feeding_instructions","created_at"
];
const roomHeaders = [
  "room_id","room_name","species","status","current_booking_id","notes","updated_at"
];
const paymentHeaders = [
  "payment_id","booking_id","payment_type","amount","status","slip_file_id",
  "source_account_name","source_account_number_masked","verified_by","verified_at",
  "refund_amount","refund_account_name","refund_account_number_masked",
  "refund_verified_original_account","refund_by","refund_at","notes","created_at"
];
const chargeHeaders = [
  "charge_id","booking_id","charge_date","item_name","quantity","unit_price",
  "amount","notes","created_by","created_at"
];
const rescheduleHeaders = [
  "request_id","booking_id","requested_at","old_check_in","old_check_out",
  "new_check_in","new_check_out","status","customer_phone","processed_by",
  "processed_at","reason"
];
const userHeaders = [
  "user_id","username","password_hash","salt","role","display_name","active",
  "failed_attempts","locked_until","must_change_password","created_at","updated_at",
  "last_login"
];
const sessionHeaders = [
  "session_id","token_hash","user_id","role","expires_at","created_at","last_seen_at"
];
const auditHeaders = [
  "audit_id","timestamp","user_id","username","role","action","entity_type",
  "entity_id","summary"
];
const settingHeaders = ["key","value","description","updated_at"];
const sterilizationHeaders = [
  "appointment_id","appointment_code","appointment_date","appointment_time",
  "customer_name","phone","pet_name","species","sex","breed","weight_kg",
  "source_channel","status","notes","created_by","created_at","updated_at"
  ,"age_text","vaccination_status"
];
const sterilizationHolidayHeaders = [
  "holiday_id","holiday_date","reason","active","created_by","created_at","updated_at"
];
const receiptHeaders = [
  "receipt_id","receipt_no","booking_id","issued_at","customer_name",
  "customer_phone","pet_summary","room_summary","actual_checkin",
  "actual_checkout","stay_days","stay_nights","total_amount",
  "deposit_amount","amount_due","paid_at_checkout","refund_amount",
  "payment_method","payment_status","receipt_status","pdf_file_id",
  "created_by","created_at","voided_at","voided_by","void_reason","notes"
];
const receiptItemHeaders = [
  "receipt_item_id","receipt_id","receipt_no","booking_id","line_no",
  "item_type","item_name","description","pet_name","room_id","quantity",
  "unit","unit_price","amount","service_date","notes","created_at"
];

const wb = Workbook.create();
const dashboard = wb.worksheets.add("ภาพรวม");
const bookings = wb.worksheets.add("การจอง");
const pets = wb.worksheets.add("สัตว์เลี้ยง");
const rooms = wb.worksheets.add("ห้องและกรง");
const payments = wb.worksheets.add("การชำระเงิน");
const charges = wb.worksheets.add("ค่าใช้จ่ายเพิ่มเติม");
const reschedules = wb.worksheets.add("คำขอเลื่อนวัน");
const users = wb.worksheets.add("ผู้ใช้งาน");
const sessions = wb.worksheets.add("เซสชัน");
const audit = wb.worksheets.add("ประวัติการใช้งาน");
const settings = wb.worksheets.add("ตั้งค่า");
const lists = wb.worksheets.add("รายการอ้างอิง");
const sterilizations = wb.worksheets.add("นัดทำหมัน");
const sterilizationHolidays = wb.worksheets.add("วันหยุดทำหมัน");
const receipts = wb.worksheets.add("ใบเสร็จ");
const receiptItems = wb.worksheets.add("รายการใบเสร็จ");

const allSheets = [
  dashboard, bookings, pets, rooms, payments, charges,
  reschedules, users, sessions, audit, settings, lists, sterilizations,
  sterilizationHolidays, receipts, receiptItems
];
for (const sheet of allSheets) sheet.showGridLines = false;

function columnName(index) {
  let n = index + 1;
  let result = "";
  while (n) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function configureDataSheet(sheet, headers, widths = {}) {
  const end = columnName(headers.length - 1);
  sheet.getRange(`A1:${end}1`).values = [headers];
  sheet.getRange(`A1:${end}1`).format = {
    fill: colors.dark,
    font: { name: "Noto Sans Thai", bold: true, color: colors.white, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
    horizontalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  sheet.getRange(`A1:${end}1`).format.rowHeight = 38;
  sheet.getRange(`A2:${end}101`).format = {
    font: { name: "Noto Sans Thai", size: 10 },
    verticalAlignment: "center",
    borders: { preset: "inside", style: "thin", color: "#E2E9E5" },
  };
  sheet.freezePanes.freezeRows(1);
  headers.forEach((header, i) => {
    const column = columnName(i);
    sheet.getRange(`${column}:${column}`).format.columnWidth = widths[header] || 16;
  });
}

configureDataSheet(bookings, bookingHeaders, {
  booking_code: 19, created_at: 22, updated_at: 22, customer_name: 23,
  phone: 16, contact_handle: 20, check_in_date: 15, check_out_date: 15,
  payment_deadline: 22, special_notes: 34, cancel_reason: 28,
});
configureDataSheet(pets, petHeaders, {
  name: 18, breed: 18, chronic_conditions: 28, current_medications: 28,
  allergies: 25, feeding_instructions: 32, created_at: 22,
});
configureDataSheet(rooms, roomHeaders, { room_name: 20, notes: 30, updated_at: 22 });
configureDataSheet(payments, paymentHeaders, {
  source_account_name: 22, refund_account_name: 22, notes: 28, created_at: 22,
});
configureDataSheet(charges, chargeHeaders, { item_name: 24, notes: 28, created_at: 22 });
configureDataSheet(reschedules, rescheduleHeaders, { requested_at: 22, reason: 30 });
configureDataSheet(users, userHeaders, {
  password_hash: 24, salt: 20, display_name: 22, locked_until: 22,
  created_at: 22, updated_at: 22, last_login: 22,
});
configureDataSheet(sessions, sessionHeaders, { token_hash: 24, expires_at: 22, created_at: 22, last_seen_at: 22 });
configureDataSheet(audit, auditHeaders, { timestamp: 22, action: 22, summary: 44 });
configureDataSheet(settings, settingHeaders, { key: 28, value: 34, description: 45, updated_at: 22 });
configureDataSheet(lists, ["กลุ่ม","รหัส","ชื่อภาษาไทย"], { "กลุ่ม": 18, "รหัส": 30, "ชื่อภาษาไทย": 28 });
configureDataSheet(sterilizations, sterilizationHeaders, {
  appointment_code: 21, appointment_date: 16, appointment_time: 14,
  customer_name: 22, phone: 16, pet_name: 18, species: 15, sex: 15,
  breed: 18, source_channel: 18, status: 25, notes: 34,
  created_at: 22, updated_at: 22,
});
configureDataSheet(sterilizationHolidays, sterilizationHolidayHeaders, {
  holiday_date: 16, reason: 34, created_at: 22, updated_at: 22,
});
configureDataSheet(receipts, receiptHeaders, {
  receipt_no: 24, booking_id: 24, issued_at: 22, customer_name: 22,
  customer_phone: 16, pet_summary: 34, room_summary: 20,
  actual_checkin: 22, actual_checkout: 22, payment_method: 18,
  payment_status: 18, receipt_status: 18, created_at: 22,
  voided_at: 22, void_reason: 30, notes: 34,
});
configureDataSheet(receiptItems, receiptItemHeaders, {
  receipt_id: 24, receipt_no: 24, booking_id: 24, item_name: 24,
  description: 34, pet_name: 24, room_id: 18, service_date: 16,
  notes: 30, created_at: 22,
});

// Dashboard
dashboard.getRange("A1:B1").values = [["ตัวชี้วัด", "ค่า"]];
dashboard.getRange("A1:B1").format = {
  fill: colors.dark,
  font: { name: "Noto Sans Thai", bold: true, color: colors.white, size: 12 },
  horizontalAlignment: "center",
};
dashboard.getRange("A2:A8").values = [
  ["อัปเดตล่าสุด"], ["รออนุมัติห้อง"], ["อนุมัติแล้ว รอมัดจำ"],
  ["เช็กอินวันนี้"], ["เช็กเอาต์วันนี้"], ["ห้องแมวทั้งหมด"], ["ห้องพักสุนัขทั้งหมด"]
];
dashboard.getRange("B2").formulas = [["=NOW()"]];
dashboard.getRange("B3").formulas = [['=COUNTIF(\'การจอง\'!H:H,"PENDING_APPROVAL")']];
dashboard.getRange("B4").formulas = [['=COUNTIF(\'การจอง\'!H:H,"APPROVED_AWAITING_DEPOSIT")']];
dashboard.getRange("B5").formulas = [['=COUNTIFS(\'การจอง\'!O:O,TODAY(),\'การจอง\'!H:H,"CONFIRMED")']];
dashboard.getRange("B6").formulas = [['=COUNTIFS(\'การจอง\'!P:P,TODAY(),\'การจอง\'!H:H,"CHECKED_IN")']];
dashboard.getRange("B7").formulas = [['=COUNTIF(\'ห้องและกรง\'!C:C,"CAT")']];
dashboard.getRange("B8").formulas = [['=COUNTIF(\'ห้องและกรง\'!C:C,"DOG")']];
dashboard.getRange("A2:B8").format = {
  font: { name: "Noto Sans Thai", size: 12 },
  borders: { preset: "all", style: "thin", color: colors.border },
};
dashboard.getRange("A2:A8").format.fill = colors.pale;
dashboard.getRange("B2:B8").format = {
  fill: colors.white,
  font: { name: "Noto Sans Thai", bold: true, color: colors.dark, size: 15 },
  horizontalAlignment: "center",
  borders: { preset: "all", style: "thin", color: colors.border },
};
dashboard.getRange("A10:B10").merge();
dashboard.getRange("A10").values = [["คำขอใหม่ใช้สถานะ PENDING_APPROVAL และกันความจุทันที"]];
dashboard.getRange("A10:B10").format = {
  fill: colors.warning,
  font: { name: "Noto Sans Thai", bold: true, color: colors.warningText },
  wrapText: true,
};
dashboard.getRange("A:A").format.columnWidth = 34;
dashboard.getRange("B:B").format.columnWidth = 24;
dashboard.freezePanes.freezeRows(1);

// Rooms
const roomRows = [];
for (let i = 1; i <= 11; i++) {
  const id = `CAT${String(i).padStart(2, "0")}`;
  roomRows.push([id, `ห้องพักแมว ${id}`, "CAT", "AVAILABLE", "", "", ""]);
}
for (let i = 1; i <= 7; i++) {
  const id = `DOG${String(i).padStart(2, "0")}`;
  roomRows.push([id, `ห้องพักสุนัข ${id}`, "DOG", "AVAILABLE", "", "", ""]);
}
rooms.getRange(`A2:G${roomRows.length + 1}`).values = roomRows;
rooms.getRange("C2:C100").dataValidation = { rule: { type: "list", values: ["CAT", "DOG"] } };
rooms.getRange("D2:D100").dataValidation = {
  rule: { type: "list", values: ["AVAILABLE", "CLEANING", "MAINTENANCE", "DISABLED"] }
};
rooms.getRange("D2:D100").format.fill = colors.pale;

// Settings
const settingRows = [
  ["clinic_name_th","คลินิกบ้านหมอปอยรักษาสัตว์","ชื่อกิจการภาษาไทย",""],
  ["clinic_name_en","Baan Mhor Poy Vet Clinic","ชื่อกิจการภาษาอังกฤษ",""],
  ["clinic_logo_file_id","","ไฟล์โลโก้สถานบริการใน Google Drive",""],
  ["timezone","Asia/Bangkok","เขตเวลา",""],
  ["normal_open_time","09:00","เวลาเปิดติดต่อสถานบริการ (ไม่จำกัดเวลาเช็กอิน/เช็กเอาท์)",""],
  ["normal_close_time","18:00","เวลาปิดติดต่อสถานบริการ (ไม่จำกัดเวลาเช็กอิน/เช็กเอาท์)",""],
  ["thursday_morning_window","10:00-11:00","ช่วงนัดหมายเช้าวันพฤหัสบดี",""],
  ["thursday_evening_window","17:00-17:30","ช่วงนัดหมายเย็นวันพฤหัสบดี",""],
  ["cat_one_price","150","ราคาแมว 1 ตัวต่อคืน",""],
  ["cat_two_price","200","ราคาแมว 2 ตัวต่อคืน",""],
  ["dog_one_price","150","ราคาสุนัข 1 ตัวต่อคืน",""],
  ["dog_two_price","200","ราคาสุนัข 2 ตัวต่อคืน",""],
  ["line_deposit_amount","500","มัดจำเฉพาะ LINE",""],
  ["payment_window_minutes","60","เวลาชำระหลังอนุมัติ",""],
  ["reschedule_notice_days","3","แจ้งเลื่อนล่วงหน้า",""],
  ["max_reschedules","1","จำนวนครั้งที่เลื่อนได้",""],
  ["bank_name","","ชื่อธนาคาร",""],
  ["bank_account_name","","ชื่อบัญชี",""],
  ["bank_account_number","","เลขบัญชี",""],
  ["promptpay_qr_url","","URL รูป QR PromptPay",""],
  ["clinic_phone","","หมายเลขโทรศัพท์",""],
  ["line_oa_url","","LINE OA",""],
  ["facebook_url","","Facebook",""],
  ["sterilization_daily_capacity","4","จำนวนสัตว์สูงสุดสำหรับคิวทำหมันต่อวัน",""],
];
settings.getRange(`A2:D${settingRows.length + 1}`).values = settingRows;
settings.getRange(`B2:B${settingRows.length + 1}`).format.fill = colors.pale;

// Reference lists and data validation
const listRows = [
  ["ROLE","OWNER","เจ้าของ"],["ROLE","DOCTOR","หมอ"],["ROLE","STAFF","พนักงาน"],
  ["SPECIES","CAT","แมว"],["SPECIES","DOG","สุนัข"],
  ["CHANNEL","WEBSITE","เว็บไซต์"],["CHANNEL","LINE","LINE"],
  ["CHANNEL","FACEBOOK","Facebook"],["CHANNEL","PHONE","โทรศัพท์"],
  ["CHANNEL","WALK_IN","Walk-in"],["CHANNEL","OTHER","อื่น ๆ"],
  ["STATUS","PENDING_APPROVAL","รออนุมัติห้อง"],
  ["STATUS","APPROVED_AWAITING_DEPOSIT","อนุมัติแล้ว รอมัดจำ"],
  ["STATUS","CONFIRMED","ยืนยันการจอง"],["STATUS","CHECKED_IN","เช็กอินแล้ว"],
  ["STATUS","CHECKED_OUT","เช็กเอาต์แล้ว"],["STATUS","REJECTED","ไม่อนุมัติ"],
  ["STATUS","EXPIRED_PAYMENT","หมดเวลาชำระ"],
  ["STATUS","CANCELLED_NO_REFUND","ยกเลิก ไม่คืนมัดจำ"],
  ["STERILIZATION_STATUS","PENDING_CONFIRMATION","รอยืนยันนัด"],
  ["STERILIZATION_STATUS","CONFIRMED","ยืนยันนัดแล้ว"],
  ["STERILIZATION_STATUS","ARRIVED","มาถึงคลินิกแล้ว"],
  ["STERILIZATION_STATUS","COMPLETED","ดำเนินการเสร็จแล้ว"],
  ["STERILIZATION_STATUS","CANCELLED","ยกเลิก"],
  ["STERILIZATION_STATUS","NO_SHOW","ไม่มาตามนัด"],
];
lists.getRange(`A2:C${listRows.length + 1}`).values = listRows;

bookings.getRange("E2:E500").dataValidation = {
  rule: { type: "list", values: ["WEBSITE","LINE","FACEBOOK","PHONE","WALK_IN","OTHER"] }
};
bookings.getRange("G2:G500").dataValidation = {
  rule: { type: "list", values: ["OVERNIGHT","DAYCARE","EMERGENCY_OWN_CAGE"] }
};
bookings.getRange("H2:H500").dataValidation = {
  rule: { type: "list", values: [
    "PENDING_APPROVAL","APPROVED_AWAITING_DEPOSIT","CONFIRMED","CHECKED_IN",
    "CHECKED_OUT","REJECTED","EXPIRED_PAYMENT","CANCELLED_NO_REFUND","NO_SHOW"
  ] }
};
bookings.getRange("M2:M500").dataValidation = { rule: { type: "list", values: ["CAT","DOG"] } };
users.getRange("E2:E100").dataValidation = { rule: { type: "list", values: ["OWNER","DOCTOR","STAFF"] } };
sterilizations.getRange("L2:L500").dataValidation = {
  rule: { type: "list", values: ["FACEBOOK","PHONE","WALK_IN","OTHER"] }
};
sterilizations.getRange("M2:M500").dataValidation = {
  rule: { type: "list", values: [
    "PENDING_CONFIRMATION","CONFIRMED","ARRIVED","COMPLETED","CANCELLED","NO_SHOW"
  ] }
};
bookings.getRange("H2:H500").conditionalFormats.add("containsText", {
  text: "PENDING_APPROVAL",
  format: { fill: colors.warning, font: { color: colors.warningText, bold: true } }
});
bookings.getRange("H2:H500").conditionalFormats.add("containsText", {
  text: "REJECTED",
  format: { fill: colors.danger, font: { color: colors.dangerText, bold: true } }
});

for (const sheet of allSheets) {
  const used = sheet.getUsedRange();
  if (used) used.format.font = { name: "Noto Sans Thai" };
}

const inspected = await wb.inspect({
  kind: "table",
  range: "ห้องและกรง!A1:G20",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 8,
});
console.log(inspected.ndjson);

const settingsInspection = await wb.inspect({
  kind: "table",
  range: "ตั้งค่า!A1:D25",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 4,
});
console.log(settingsInspection.ndjson);

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula errors",
});
console.log(errors.ndjson);

const previewRanges = {
  "ภาพรวม": "A1:B10",
  "การจอง": "A1:M12",
  "สัตว์เลี้ยง": "A1:J12",
  "ห้องและกรง": "A1:G20",
  "การชำระเงิน": "A1:J12",
  "ค่าใช้จ่ายเพิ่มเติม": "A1:J12",
  "คำขอเลื่อนวัน": "A1:L12",
  "ผู้ใช้งาน": "A1:M12",
  "เซสชัน": "A1:G12",
  "ประวัติการใช้งาน": "A1:I12",
  "ตั้งค่า": "A1:D24",
  "รายการอ้างอิง": "A1:C20",
  "นัดทำหมัน": "A1:M12",
  "วันหยุดทำหมัน": "A1:G12",
  "ใบเสร็จ": "A1:M12",
  "รายการใบเสร็จ": "A1:Q12",
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const preview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(
    path.join(outputDir, `preview-${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer())
  );
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
const outputPath = path.join(outputDir, "BMP-Booking-System-Template.xlsx");
await xlsx.save(outputPath);
console.log(outputPath);
