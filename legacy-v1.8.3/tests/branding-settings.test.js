const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
}

test('public and admin brands use shared dynamic name and logo hooks', () => {
  const admin = readSource('Admin.html');
  const publicPage = readSource('Index.html');
  const commonClient = readSource('CommonClient.html');
  assert.match(admin, /data-brand-logo/);
  assert.match(admin, /data-clinic-name-th/);
  assert.match(admin, /data-clinic-name-en>Baan Mhor Poy Vet Clinic/);
  assert.match(publicPage, /data-brand-logo/);
  assert.match(publicPage, /data-clinic-name-th/);
  assert.match(commonClient, /function applyBranding\(config\)/);
});

test('settings screen exposes Thai and English names, phone, and logo upload', () => {
  const client = readSource('AdminClient.html');
  assert.match(client, /ชื่อสถานบริการภาษาไทย/);
  assert.match(client, /ชื่อสถานบริการภาษาอังกฤษ/);
  assert.match(client, /หมายเลขโทรศัพท์/);
  assert.match(client, /id=\"settings-logo-file\"/);
  assert.match(client, /function uploadClinicLogoForm\(event\)/);
});

test('logo upload is authorized, private, type checked, and never returns a Drive ID', () => {
  const server = readSource('05_AdminService.gs');
  assert.match(server, /function uploadClinicLogo\(sessionToken, fileInput\)/);
  assert.match(server, /requirePermission_\(sessionToken, 'settings:manage'\)/);
  assert.match(server, /validateClinicLogoSignature_\(bytes, mimeType\)/);
  assert.match(server, /setSharing\(DriveApp\.Access\.PRIVATE, DriveApp\.Permission\.NONE\)/);
  assert.match(server, /return \{ ok: true, logoDataUrl: getClinicLogoDataUrl_\(\) \};/);
  assert.doesNotMatch(server, /return \{ ok: true, (?:fileId|logoFileId):/);
});

test('public configuration includes both clinic names and rendered logo data', () => {
  const publicService = readSource('04_BookingService.gs');
  assert.match(publicService, /clinicNameTh: settings\.clinic_name_th/);
  assert.match(publicService, /clinicNameEn: settings\.clinic_name_en/);
  assert.match(publicService, /logoDataUrl: getClinicLogoDataUrl_\(\)/);
});
