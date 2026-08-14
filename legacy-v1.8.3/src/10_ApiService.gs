/**
 * JSON gateway for the Cloudflare-hosted web interface.
 *
 * The browser never calls this endpoint directly. Cloudflare Worker keeps the
 * shared gateway key in a secret and forwards only allow-listed operations.
 */

function doPost(event) {
  try {
    var request = parseApiRequest_(event);
    requireApiGatewayKey_(request.gatewayKey);
    var result = dispatchApiAction_(request.action, request.args);
    return apiJsonResponse_({ ok: true, data: result });
  } catch (error) {
    return apiJsonResponse_({
      ok: false,
      error: apiSafeErrorMessage_(error)
    });
  }
}

function configureCloudflareGateway() {
  var props = PropertiesService.getScriptProperties();
  var gatewayKey = props.getProperty(APP.PROPERTY_KEYS.API_GATEWAY_KEY);
  if (!gatewayKey) {
    gatewayKey = randomToken_(32);
    props.setProperty(APP.PROPERTY_KEYS.API_GATEWAY_KEY, gatewayKey);
  }
  var result = {
    webAppUrl: ScriptApp.getService().getUrl() || '',
    gatewayKey: gatewayKey
  };
  console.log('GAS_API_URL=' + result.webAppUrl);
  console.log('GAS_GATEWAY_KEY=' + result.gatewayKey);
  return result;
}

function rotateCloudflareGatewayKey() {
  var gatewayKey = randomToken_(32);
  PropertiesService.getScriptProperties()
    .setProperty(APP.PROPERTY_KEYS.API_GATEWAY_KEY, gatewayKey);
  console.log('GAS_GATEWAY_KEY=' + gatewayKey);
  return { gatewayKey: gatewayKey };
}

function parseApiRequest_(event) {
  var raw = event && event.postData && event.postData.contents;
  if (!raw) throw new Error('ไม่พบข้อมูลคำขอ');
  if (String(raw).length > 8 * 1024 * 1024) {
    throw new Error('ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด');
  }
  var request;
  try {
    request = JSON.parse(raw);
  } catch (error) {
    throw new Error('รูปแบบข้อมูลคำขอไม่ถูกต้อง');
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('รูปแบบข้อมูลคำขอไม่ถูกต้อง');
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(String(request.action || ''))) {
    throw new Error('คำสั่งไม่ถูกต้อง');
  }
  if (!Array.isArray(request.args)) throw new Error('อาร์กิวเมนต์ไม่ถูกต้อง');
  return {
    action: String(request.action),
    args: request.args,
    gatewayKey: String(request.gatewayKey || '')
  };
}

function requireApiGatewayKey_(providedKey) {
  var expectedKey = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.API_GATEWAY_KEY);
  if (!expectedKey) {
    throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudflare');
  }
  if (!constantTimeEqual_(String(providedKey || ''), String(expectedKey))) {
    throw new Error('ไม่ได้รับอนุญาตให้เรียกใช้ API');
  }
}

function dispatchApiAction_(action, args) {
  var handlers = apiActionHandlers_();
  if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
    throw new Error('ไม่อนุญาตให้เรียกคำสั่งนี้');
  }
  return handlers[action].apply(null, args);
}

function apiActionHandlers_() {
  return {
    getPublicConfig: getPublicConfig,
    checkAvailability: checkAvailability,
    createPublicBooking: createPublicBooking,
    lookupBooking: lookupBooking,
    requestReschedule: requestReschedule,
    submitDepositSlip: submitDepositSlip,
    login: login,
    logout: logout,
    changeMyPassword: changeMyPassword,
    getAdminBootstrap: getAdminBootstrap,
    listBookings: listBookings,
    getBookingDetail: getBookingDetail,
    createStaffBooking: createStaffBooking,
    createStaffMultipleOvernightBookings: createStaffMultipleOvernightBookings,
    approveBooking: approveBooking,
    rejectBooking: rejectBooking,
    verifyDeposit: verifyDeposit,
    assignRoom: assignRoom,
    checkInBooking: checkInBooking,
    checkOutBooking: checkOutBooking,
    getReceiptForBooking: getReceiptForBooking,
    getPrintableReceipt: getPrintableReceipt,
    listRooms: listRooms,
    updateRoom: updateRoom,
    getAdminSettings: getAdminSettings,
    updateAdminSettings: updateAdminSettings,
    uploadClinicLogo: uploadClinicLogo,
    configureLineSecrets: configureLineSecrets,
    listUsers: listUsers,
    createUser: createUser,
    listSterilizationAppointments: listSterilizationAppointments,
    getSterilizationCalendar: getSterilizationCalendar,
    listSterilizationHolidays: listSterilizationHolidays,
    saveSterilizationHoliday: saveSterilizationHoliday,
    removeSterilizationHoliday: removeSterilizationHoliday,
    createSterilizationAppointment: createSterilizationAppointment,
    updateSterilizationAppointmentStatus: updateSterilizationAppointmentStatus
  };
}

function apiJsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiSafeErrorMessage_(error) {
  var message = error && error.message ? String(error.message) : '';
  if (!message || message.length > 500) return 'ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่';
  return message;
}
