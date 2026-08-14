/**
 * Temporary booking system for Baan Mhor Poy Vet Clinic.
 * Google Apps Script reads every .gs file as one project, so names are prefixed
 * only to make the copy order obvious.
 */

var APP = Object.freeze({
  NAME_TH: 'คลินิกบ้านหมอปอยรักษาสัตว์',
  NAME_EN: 'Baan Mhor Poy Vet Clinic',
  TIMEZONE: 'Asia/Bangkok',
  CURRENCY: 'บาท',
  VERSION: '1.8.3',
  SESSION_HOURS: 8,
  PAYMENT_WINDOW_MINUTES: 60,
  RESCHEDULE_NOTICE_DAYS: 3,
  MAX_RESCHEDULES: 1,
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  MAX_LOGO_BYTES: 1 * 1024 * 1024,
  AUTH_ITERATIONS: 5000,
  SHEETS: {
    DASHBOARD: 'ภาพรวม',
    BOOKINGS: 'การจอง',
    PETS: 'สัตว์เลี้ยง',
    ROOMS: 'ห้องและกรง',
    PAYMENTS: 'การชำระเงิน',
    CHARGES: 'ค่าใช้จ่ายเพิ่มเติม',
    RESCHEDULES: 'คำขอเลื่อนวัน',
    USERS: 'ผู้ใช้งาน',
    SESSIONS: 'เซสชัน',
    AUDIT: 'ประวัติการใช้งาน',
    SETTINGS: 'ตั้งค่า',
    LISTS: 'รายการอ้างอิง',
    STERILIZATIONS: 'นัดทำหมัน',
    STERILIZATION_HOLIDAYS: 'วันหยุดทำหมัน',
    RECEIPTS: 'ใบเสร็จ',
    RECEIPT_ITEMS: 'รายการใบเสร็จ'
  },
  ROLES: {
    OWNER: 'OWNER',
    DOCTOR: 'DOCTOR',
    STAFF: 'STAFF'
  },
  CHANNELS: {
    WEBSITE: 'WEBSITE',
    LINE: 'LINE',
    FACEBOOK: 'FACEBOOK',
    PHONE: 'PHONE',
    WALK_IN: 'WALK_IN',
    OTHER: 'OTHER'
  },
  BOOKING_TYPES: {
    OVERNIGHT: 'OVERNIGHT',
    DAYCARE: 'DAYCARE',
    EMERGENCY_OWN_CAGE: 'EMERGENCY_OWN_CAGE'
  },
  SPECIES: {
    CAT: 'CAT',
    DOG: 'DOG'
  },
  STATUSES: {
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED_AWAITING_DEPOSIT: 'APPROVED_AWAITING_DEPOSIT',
    CONFIRMED: 'CONFIRMED',
    CHECKED_IN: 'CHECKED_IN',
    CHECKED_OUT: 'CHECKED_OUT',
    REJECTED: 'REJECTED',
    EXPIRED_PAYMENT: 'EXPIRED_PAYMENT',
    CANCELLED_NO_REFUND: 'CANCELLED_NO_REFUND',
    NO_SHOW: 'NO_SHOW'
  },
  ROOM_STATUSES: {
    AVAILABLE: 'AVAILABLE',
    CLEANING: 'CLEANING',
    MAINTENANCE: 'MAINTENANCE',
    DISABLED: 'DISABLED'
  },
  PAYMENT_STATUSES: {
    NOT_REQUIRED: 'NOT_REQUIRED',
    WAITING: 'WAITING',
    SUBMITTED: 'SUBMITTED',
    VERIFIED: 'VERIFIED',
    WAIVED: 'WAIVED',
    EXPIRED: 'EXPIRED',
    FORFEITED: 'FORFEITED',
    REFUND_DUE: 'REFUND_DUE',
    REFUNDED: 'REFUNDED'
  },
  RESCHEDULE_STATUSES: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED'
  },
  STERILIZATION_STATUSES: {
    PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
    CONFIRMED: 'CONFIRMED',
    ARRIVED: 'ARRIVED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    NO_SHOW: 'NO_SHOW'
  },
  PROPERTY_KEYS: {
    SPREADSHEET_ID: 'BMP_SPREADSHEET_ID',
    UPLOAD_FOLDER_ID: 'BMP_UPLOAD_FOLDER_ID',
    AUTH_PEPPER: 'BMP_AUTH_PEPPER',
    LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
    LINE_CHANNEL_ID: 'LINE_CHANNEL_ID',
    LIFF_ID: 'LINE_LIFF_ID',
    API_GATEWAY_KEY: 'BMP_API_GATEWAY_KEY',
    RECEIPT_FOLDER_ID: 'BMP_RECEIPT_FOLDER_ID',
    UPGRADE_V1_7_COMPLETED: 'BMP_UPGRADE_V1_7_COMPLETED',
    UPGRADE_V1_8_COMPLETED: 'BMP_UPGRADE_V1_8_COMPLETED'
  }
});

var PERMISSIONS = Object.freeze({
  OWNER: [
    'dashboard:view', 'booking:view', 'booking:create', 'booking:approve',
    'booking:reject', 'booking:assign', 'booking:checkin', 'booking:checkout',
    'booking:cancel', 'booking:reschedule', 'health:view', 'health:approve',
    'payment:view', 'payment:verify', 'payment:refund', 'charge:manage',
    'room:manage', 'report:view', 'user:manage', 'settings:manage',
    'audit:view', 'file:view', 'sterilization:view',
    'sterilization:create', 'sterilization:update',
    'sterilization:holiday', 'receipt:view', 'receipt:print'
  ],
  DOCTOR: [
    'dashboard:view', 'booking:view', 'booking:create', 'booking:approve',
    'booking:reject', 'booking:assign', 'booking:checkin', 'booking:checkout',
    'booking:reschedule', 'health:view', 'health:approve', 'payment:view',
    'charge:manage', 'room:manage', 'report:view', 'file:view',
    'sterilization:view', 'sterilization:create', 'sterilization:update',
    'sterilization:holiday', 'receipt:view', 'receipt:print'
  ],
  STAFF: [
    'dashboard:view', 'booking:view', 'booking:create', 'booking:approve',
    'booking:reject', 'booking:assign', 'booking:checkin', 'booking:checkout',
    'booking:reschedule', 'health:view', 'payment:view', 'payment:verify',
    'charge:manage', 'room:manage', 'file:view', 'sterilization:view',
    'sterilization:create', 'sterilization:update',
    'receipt:view', 'receipt:print'
  ]
});

var BOOKING_HEADERS = [
  'booking_id', 'booking_code', 'created_at', 'updated_at', 'source_channel',
  'line_user_id', 'booking_type', 'status', 'payment_status', 'customer_name',
  'phone', 'contact_handle', 'species', 'pet_count', 'check_in_date',
  'check_out_date', 'check_in_time', 'check_out_time', 'nights', 'unit_price',
  'lodging_total', 'deposit_required', 'deposit_amount', 'payment_deadline',
  'assigned_room_id', 'health_review_required', 'health_review_status',
  'vaccination_file_id', 'flea_tick_treated', 'flea_tick_date',
  'flea_tick_product', 'flea_tick_found_now', 'food_option',
  'special_notes', 'reschedule_count', 'original_booking_id',
  'checked_in_at', 'checked_out_at', 'cancel_reason', 'created_by',
  'approved_by', 'approved_at', 'version', 'booking_group_id',
  'check_in_notes'
];

var PET_HEADERS = [
  'pet_id', 'booking_id', 'pet_order', 'name', 'species', 'sex', 'breed',
  'age_text', 'weight_kg', 'neutered', 'chronic_conditions',
  'current_medications', 'allergies', 'feeding_instructions', 'created_at'
];

var ROOM_HEADERS = [
  'room_id', 'room_name', 'species', 'status', 'current_booking_id',
  'notes', 'updated_at'
];

var PAYMENT_HEADERS = [
  'payment_id', 'booking_id', 'payment_type', 'amount', 'status',
  'slip_file_id', 'source_account_name', 'source_account_number_masked',
  'verified_by', 'verified_at', 'refund_amount', 'refund_account_name',
  'refund_account_number_masked', 'refund_verified_original_account',
  'refund_by', 'refund_at', 'notes', 'created_at'
];

var CHARGE_HEADERS = [
  'charge_id', 'booking_id', 'charge_date', 'item_name', 'quantity',
  'unit_price', 'amount', 'notes', 'created_by', 'created_at'
];

var RESCHEDULE_HEADERS = [
  'request_id', 'booking_id', 'requested_at', 'old_check_in', 'old_check_out',
  'new_check_in', 'new_check_out', 'status', 'customer_phone',
  'processed_by', 'processed_at', 'reason'
];

var USER_HEADERS = [
  'user_id', 'username', 'password_hash', 'salt', 'role', 'display_name',
  'active', 'failed_attempts', 'locked_until', 'must_change_password',
  'created_at', 'updated_at', 'last_login'
];

var SESSION_HEADERS = [
  'session_id', 'token_hash', 'user_id', 'role', 'expires_at',
  'created_at', 'last_seen_at'
];

var AUDIT_HEADERS = [
  'audit_id', 'timestamp', 'user_id', 'username', 'role', 'action',
  'entity_type', 'entity_id', 'summary'
];

var SETTINGS_HEADERS = ['key', 'value', 'description', 'updated_at'];

var STERILIZATION_HEADERS = [
  'appointment_id', 'appointment_code', 'appointment_date',
  'appointment_time', 'customer_name', 'phone', 'pet_name', 'species',
  'sex', 'breed', 'weight_kg', 'source_channel', 'status', 'notes',
  'created_by', 'created_at', 'updated_at', 'age_text',
  'vaccination_status'
];

var STERILIZATION_HOLIDAY_HEADERS = [
  'holiday_id', 'holiday_date', 'reason', 'active', 'created_by',
  'created_at', 'updated_at'
];

var RECEIPT_HEADERS = [
  'receipt_id', 'receipt_no', 'booking_id', 'issued_at', 'customer_name',
  'customer_phone', 'pet_summary', 'room_summary', 'actual_checkin',
  'actual_checkout', 'stay_days', 'stay_nights', 'total_amount',
  'deposit_amount', 'amount_due', 'paid_at_checkout', 'refund_amount',
  'payment_method', 'payment_status', 'receipt_status', 'pdf_file_id',
  'created_by', 'created_at', 'voided_at', 'voided_by', 'void_reason', 'notes'
];

var RECEIPT_ITEM_HEADERS = [
  'receipt_item_id', 'receipt_id', 'receipt_no', 'booking_id', 'line_no',
  'item_type', 'item_name', 'description', 'pet_name', 'room_id', 'quantity',
  'unit', 'unit_price', 'amount', 'service_date', 'notes', 'created_at'
];
