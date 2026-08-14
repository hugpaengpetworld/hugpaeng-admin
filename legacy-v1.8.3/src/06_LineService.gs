/**
 * LINE Login/LIFF verification and Messaging API integration.
 * Secrets live only in Script Properties and are never returned to the client.
 */

function configureLineSecrets(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'settings:manage');
  var props = PropertiesService.getScriptProperties();
  var values = input || {};
  if (values.channelId) {
    props.setProperty(APP.PROPERTY_KEYS.LINE_CHANNEL_ID, String(values.channelId).trim());
  }
  if (values.channelAccessToken) {
    props.setProperty(
      APP.PROPERTY_KEYS.LINE_CHANNEL_ACCESS_TOKEN,
      String(values.channelAccessToken).trim()
    );
  }
  if (values.liffId) {
    props.setProperty(APP.PROPERTY_KEYS.LIFF_ID, String(values.liffId).trim());
  }
  auditFromSession_(session, 'LINE_CONFIG_UPDATED', 'SETTINGS', 'LINE', 'อัปเดต LINE OA');
  return { ok: true };
}

function verifyLineIdToken_(idToken) {
  var token = String(idToken || '').trim();
  var channelId = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.LINE_CHANNEL_ID);
  if (!channelId) throw new Error('ระบบ LINE ยังไม่ได้ตั้งค่า กรุณาเลือกช่องทางเว็บไซต์');
  if (!token) throw new Error('ไม่พบข้อมูลยืนยันตัวตน LINE กรุณาเปิดผ่าน LINE อีกครั้ง');
  var response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: {
      id_token: token,
      client_id: channelId
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('ไม่สามารถยืนยันตัวตน LINE ได้ กรุณาเปิดลิงก์ใหม่');
  }
  var profile = JSON.parse(response.getContentText());
  if (!profile.sub) throw new Error('ข้อมูลบัญชี LINE ไม่สมบูรณ์');
  return {
    userId: profile.sub,
    displayName: profile.name || '',
    pictureUrl: profile.picture || ''
  };
}

function sendLineMessage_(lineUserId, message) {
  var userId = String(lineUserId || '').trim();
  if (!userId) return { ok: false, skipped: true };
  var token = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) {
    console.log('LINE message skipped: channel access token not configured');
    return { ok: false, skipped: true };
  }
  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: String(message || '').substring(0, 5000) }]
    }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    console.error('LINE push failed: ' + response.getResponseCode());
    return { ok: false, status: response.getResponseCode() };
  }
  return { ok: true };
}

function buildApprovalLineMessage_(booking, deadlineIso) {
  var deadline = Utilities.formatDate(
    new Date(deadlineIso),
    APP.TIMEZONE,
    'dd/MM/yyyy HH:mm'
  );
  var settings = getSettingsMap_();
  var paymentLines = [
    'คำขอได้รับอนุมัติแล้ว',
    'รหัสการจอง ' + booking.booking_code,
    'กรุณาชำระมัดจำ 500 บาทภายในเวลา ' + deadline + ' น.',
    'จากนั้นกลับมาแนบสลิปในหน้าตรวจสอบการจอง'
  ];
  if (settings.bank_name) paymentLines.push('ธนาคาร: ' + settings.bank_name);
  if (settings.bank_account_name) paymentLines.push('ชื่อบัญชี: ' + settings.bank_account_name);
  if (settings.bank_account_number) paymentLines.push('เลขบัญชี: ' + settings.bank_account_number);
  return paymentLines.join('\n');
}

function sendPaymentExpiredLine_(booking) {
  return sendLineMessage_(
    booking.line_user_id,
    'รายการ ' + booking.booking_code +
    ' ถูกยกเลิกอัตโนมัติเนื่องจากไม่ได้ชำระมัดจำภายใน 1 ชั่วโมง ' +
    'ห้องถูกคืนเข้าสู่สถานะว่างแล้ว หากต้องการจองใหม่กรุณาส่งคำขออีกครั้ง'
  );
}
