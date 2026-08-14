const MAX_API_BODY_BYTES = 8 * 1024 * 1024;

const ALLOWED_ACTIONS = new Set([
  'getPublicConfig', 'checkAvailability', 'createPublicBooking',
  'lookupBooking', 'requestReschedule', 'submitDepositSlip',
  'login', 'logout', 'changeMyPassword', 'getAdminBootstrap',
  'listBookings', 'getBookingDetail', 'createStaffBooking',
  'createStaffMultipleOvernightBookings', 'approveBooking', 'rejectBooking',
  'verifyDeposit', 'assignRoom', 'checkInBooking', 'checkOutBooking',
  'getReceiptForBooking', 'getPrintableReceipt',
  'listRooms', 'updateRoom', 'getAdminSettings', 'updateAdminSettings',
  'uploadClinicLogo', 'configureLineSecrets', 'listUsers', 'createUser',
  'listSterilizationAppointments', 'getSterilizationCalendar',
  'listSterilizationHolidays', 'saveSterilizationHoliday',
  'removeSterilizationHoliday',
  'createSterilizationAppointment', 'updateSterilizationAppointmentStatus'
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api') {
      return handleApiRequest(request, env);
    }

    if (url.pathname === '/admin') {
      url.pathname = '/admin/';
      return Response.redirect(url.toString(), 308);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse, url.pathname);
  }
};

async function handleApiRequest(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, {
      Allow: 'POST'
    });
  }
  if (!env.GAS_API_URL || !env.GAS_GATEWAY_KEY) {
    return jsonResponse({
      ok: false,
      error: 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ กรุณาแจ้งผู้ดูแลระบบ'
    }, 503);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_API_BODY_BYTES) {
    return jsonResponse({ ok: false, error: 'ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด' }, 413);
  }

  let text;
  let input;
  try {
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_API_BODY_BYTES) {
      return jsonResponse({ ok: false, error: 'ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด' }, 413);
    }
    input = JSON.parse(text);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'รูปแบบข้อมูลคำขอไม่ถูกต้อง' }, 400);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.action !== 'string' || !Array.isArray(input.args) ||
      !ALLOWED_ACTIONS.has(input.action)) {
    return jsonResponse({ ok: false, error: 'ไม่อนุญาตให้เรียกคำสั่งนี้' }, 400);
  }

  try {
    const upstream = await fetch(env.GAS_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        action: input.action,
        args: input.args,
        gatewayKey: env.GAS_GATEWAY_KEY
      }),
      redirect: 'follow'
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      return jsonResponse({
        ok: false,
        error: 'เชื่อมต่อระบบข้อมูลไม่สำเร็จ กรุณาลองใหม่'
      }, 502);
    }
    try {
      JSON.parse(body);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: 'ระบบข้อมูลส่งผลลัพธ์ไม่ถูกต้อง กรุณาลองใหม่'
      }, 502);
    }
    return new Response(body, {
      status: 200,
      headers: apiHeaders()
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'เชื่อมต่อระบบข้อมูลไม่สำเร็จ กรุณาลองใหม่'
    }, 502);
  }
}

function jsonResponse(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: Object.assign(apiHeaders(), extraHeaders || {})
  });
}

function apiHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };
}

function withSecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.line-scdn.net; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
    "connect-src 'self' https://*.line.me https://*.line-scdn.net; " +
    "font-src 'self' data:; frame-ancestors 'self' https://*.line.me; base-uri 'self'; form-action 'self'"
  );
  headers.set('cache-control', pathname.startsWith('/admin') ? 'no-store' : 'public, max-age=300');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
