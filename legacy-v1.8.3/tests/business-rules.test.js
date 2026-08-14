const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', '01_BusinessRules.gs'),
  'utf8'
);
const context = { Date, Math, Number, String, Array, Object, RegExp, Error };
vm.createContext(context);
vm.runInContext(source, context);

test('formats dates consistently as DD-MM-YYYY', () => {
  assert.equal(context.formatThaiDate('2026-07-31'), '31-07-2026');
});

test('formats Thai phone numbers with +66 for display', () => {
  assert.equal(context.formatPhoneInternational('925424461'), '+66925424461');
  assert.equal(context.formatPhoneInternational('0925424461'), '+66925424461');
  assert.equal(context.formatPhoneInternational('+66 92 542 4461'), '+66925424461');
});

test('normalizes legacy, display, Buddhist Era, and Sheets date-time values', () => {
  assert.equal(context.normalizeDateInput('2026-08-02'), '2026-08-02');
  assert.equal(context.normalizeDateInput('02/08/2026'), '2026-08-02');
  assert.equal(context.normalizeDateInput('02-08-2026'), '2026-08-02');
  assert.equal(context.normalizeDateInput('02-08-2569'), '2026-08-02');
  assert.equal(
    context.normalizeDateInput('2026-08-02T00:00:00+07:00'),
    '2026-08-02'
  );
});

test('rejects impossible and ambiguous malformed dates', () => {
  assert.throws(() => context.normalizeDateInput('31-02-2026'), /วันที่ไม่ถูกต้อง/);
  assert.throws(() => context.normalizeDateInput('August 2, 2026'), /รูปแบบวันที่/);
});

test('builds room booking code base from Buddhist check-in date and room', () => {
  assert.equal(
    context.buildRoomBookingCodeBase('2026-08-01', 'cat07'),
    'BMP-01082569-CAT07'
  );
  assert.equal(
    context.buildRoomBookingCodeBase('2026-08-01', 'DOG03'),
    'BMP-01082569-DOG03'
  );
  assert.throws(
    () => context.buildRoomBookingCodeBase('2026-08-01', 'X01'),
    /รหัสห้องหรือกรง/
  );
});

test('room booking code starts at 01 and never reuses an earlier sequence', () => {
  assert.equal(
    context.nextRoomBookingCode('2026-08-01', 'CAT07', []),
    'BMP-01082569-CAT07-01'
  );
  assert.equal(
    context.nextRoomBookingCode('2026-08-01', 'CAT07', [
      'BMP-01082569-CAT07-01',
      'BMP-01082569-CAT07-02',
      'BMP-01082569-DOG03-09'
    ]),
    'BMP-01082569-CAT07-03'
  );
});

test('calculates number of nights', () => {
  assert.equal(context.calculateNights('2026-08-01', '2026-08-04'), 3);
});

test('rejects same-day overnight booking', () => {
  assert.throws(
    () => context.calculateNights('2026-08-01', '2026-08-01'),
    /วันเช็กเอาต์/
  );
});

test('touching date ranges do not overlap', () => {
  assert.equal(
    context.rangesOverlap('2026-08-01', '2026-08-03', '2026-08-03', '2026-08-05'),
    false
  );
});

test('intersecting date ranges overlap', () => {
  assert.equal(
    context.rangesOverlap('2026-08-01', '2026-08-04', '2026-08-03', '2026-08-05'),
    true
  );
});

test('cat has no weight limit', () => {
  assert.equal(context.validateAnimalCapacity('CAT', [{}, {}]), true);
});

test('single dog may weigh up to 20 kg', () => {
  assert.equal(context.validateAnimalCapacity('DOG', [{ weightKg: 20 }]), true);
});

test('single dog above 20 kg is rejected online', () => {
  assert.throws(
    () => context.validateAnimalCapacity('DOG', [{ weightKg: 20.1 }]),
    /เกิน 20/
  );
});

test('two dogs may share only when each is at most 8 kg', () => {
  assert.equal(
    context.validateAnimalCapacity('DOG', [{ weightKg: 8 }, { weightKg: 7.9 }]),
    true
  );
  assert.throws(
    () => context.validateAnimalCapacity('DOG', [{ weightKg: 8.1 }, { weightKg: 4 }]),
    /แต่ละตัวต้องไม่เกิน 8/
  );
});

test('overnight price is 150 for one pet and 200 for two', () => {
  assert.equal(context.calculateNightlyRate('CAT', 1), 150);
  assert.equal(context.calculateNightlyRate('DOG', 2), 200);
});

test('daycare rounds 30 minutes down and more than 30 up', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.calculateDaycareCharge('09:00', '10:30', false))),
    { billableHours: 1, total: 50 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.calculateDaycareCharge('09:00', '10:31', false))),
    { billableHours: 2, total: 100 }
  );
});

test('daycare is capped at 150 baht from 3 hours', () => {
  assert.equal(context.calculateDaycareCharge('09:00', '18:00', false).total, 150);
});

test('owner cage daycare is free', () => {
  assert.equal(context.calculateDaycareCharge('09:00', '18:00', true).total, 0);
});

test('planned and actual visit times support the full 24-hour day', () => {
  assert.equal(context.validateVisitTime('2026-08-03', '00:00'), true);
  assert.equal(context.validateVisitTime('2026-08-03', '23:59'), true);
  assert.equal(context.validateVisitTime('2026-08-06', '13:00'), true);
});

test('visit time validation still rejects malformed dates and times', () => {
  assert.throws(() => context.validateVisitTime('2026-08-03', '24:00'), /เวลา/);
  assert.throws(() => context.validateVisitTime('2026-08-03', '7:00'), /รูปแบบเวลา/);
  assert.throws(() => context.validateVisitTime('31-02-2026', '12:00'), /วันที่/);
});

test('deposit applies to LINE only', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.depositRuleForChannel('LINE'))),
    { required: true, amount: 500 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.depositRuleForChannel('WEBSITE'))),
    { required: false, amount: 0 }
  );
});

test('final settlement returns only the difference', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.finalSettlement(300, 50, 500))),
    { total: 350, amountDue: 0, refundDue: 150 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.finalSettlement(600, 100, 500))),
    { total: 700, amountDue: 200, refundDue: 0 }
  );
});

test('reschedule needs 3 days notice and is allowed once', () => {
  assert.equal(
    context.canRequestReschedule('2026-08-01', '2026-08-04', 0).allowed,
    true
  );
  assert.equal(
    context.canRequestReschedule('2026-08-02', '2026-08-04', 0).allowed,
    false
  );
  assert.equal(
    context.canRequestReschedule('2026-08-01', '2026-08-10', 1).allowed,
    false
  );
});

test('pending approval immediately consumes room capacity', () => {
  assert.equal(context.bookingConsumesCapacity('PENDING_APPROVAL'), true);
  assert.equal(context.bookingConsumesCapacity('REJECTED'), false);
  assert.equal(context.bookingConsumesCapacity('EXPIRED_PAYMENT'), false);
});

test('sterilization capacity counts active statuses but releases cancelled slots', () => {
  assert.equal(context.sterilizationStatusConsumesCapacity('PENDING_CONFIRMATION'), true);
  assert.equal(context.sterilizationStatusConsumesCapacity('COMPLETED'), true);
  assert.equal(context.sterilizationStatusConsumesCapacity('CANCELLED'), false);
  assert.equal(context.sterilizationStatusConsumesCapacity('NO_SHOW'), false);
});

test('sterilization appointments are limited to four animals per day', () => {
  assert.equal(context.validateSterilizationDailyCapacity(3, 4), true);
  assert.throws(
    () => context.validateSterilizationDailyCapacity(4, 4),
    /สูงสุด 4 ตัวต่อวัน/
  );
});

test('sterilization species is selected from dog, cat, or a required other value', () => {
  assert.equal(context.normalizeSterilizationSpecies('DOG', ''), 'สุนัข');
  assert.equal(context.normalizeSterilizationSpecies('CAT', ''), 'แมว');
  assert.equal(context.normalizeSterilizationSpecies('OTHER', 'กระต่าย'), 'กระต่าย');
  assert.throws(
    () => context.normalizeSterilizationSpecies('OTHER', ''),
    /ระบุชนิดสัตว์เพิ่มเติม/
  );
  assert.throws(
    () => context.normalizeSterilizationSpecies('', ''),
    /เลือกชนิดสัตว์/
  );
});

test('sterilization sex accepts only male or female', () => {
  assert.equal(context.normalizeSterilizationSex('MALE'), 'ผู้');
  assert.equal(context.normalizeSterilizationSex('FEMALE'), 'เมีย');
  assert.throws(() => context.normalizeSterilizationSex(''), /เลือกเพศสัตว์/);
  assert.throws(() => context.normalizeSterilizationSex('UNKNOWN'), /เลือกเพศสัตว์/);
});

test('emergency owner cage is staff-only and rejects dogs above 8 kg', () => {
  assert.equal(
    context.validateEmergencyOwnCage('CAT', [{}], 'WALK_IN', true),
    true
  );
  assert.throws(
    () => context.validateEmergencyOwnCage('DOG', [{ weightKg: 9 }], 'PHONE', true),
    /เกิน 8/
  );
  assert.throws(
    () => context.validateEmergencyOwnCage('CAT', [{}], 'WEBSITE', true),
    /โทรศัพท์หรือ Walk-in/
  );
});
