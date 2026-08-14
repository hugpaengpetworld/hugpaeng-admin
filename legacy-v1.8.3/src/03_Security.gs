function ensureInitialOwner_() {
  var users = getAllObjects_(APP.SHEETS.USERS, USER_HEADERS);
  if (users.length > 0) return { created: false };

  var temporaryPassword = 'Bmp!9' + randomToken_(6);
  createUserInternal_({
    username: 'owner',
    password: temporaryPassword,
    role: APP.ROLES.OWNER,
    displayName: 'เจ้าของระบบ',
    mustChangePassword: true
  }, 'SYSTEM');
  return {
    created: true,
    username: 'owner',
    temporaryPassword: temporaryPassword
  };
}

function login(username, password) {
  cleanupExpiredSessions_();
  var normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername || !password) {
    throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  }

  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'username', normalizedUsername);
  if (!user || String(user.active) !== 'true') {
    Utilities.sleep(350);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw new Error('บัญชีถูกพักชั่วคราว กรุณาลองใหม่ภายหลัง');
  }

  var expected = hashPassword_(String(password), String(user.salt));
  if (!constantTimeEqual_(expected, String(user.password_hash))) {
    var failed = Number(user.failed_attempts || 0) + 1;
    var changes = { failed_attempts: failed, updated_at: nowIso_() };
    if (failed >= 5) {
      changes.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      changes.failed_attempts = 0;
    }
    updateObjectRow_(APP.SHEETS.USERS, USER_HEADERS, user._row, changes);
    audit_({
      userId: user.user_id,
      username: normalizedUsername,
      role: user.role,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user.user_id,
      summary: 'เข้าสู่ระบบไม่สำเร็จ'
    });
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  var token = randomToken_(32);
  var sessionId = newId_('SES');
  var expiresAt = new Date(Date.now() + APP.SESSION_HOURS * 60 * 60 * 1000).toISOString();
  appendObject_(APP.SHEETS.SESSIONS, SESSION_HEADERS, {
    session_id: sessionId,
    token_hash: hashToken_(token),
    user_id: user.user_id,
    role: user.role,
    expires_at: expiresAt,
    created_at: nowIso_(),
    last_seen_at: nowIso_()
  });
  updateObjectRow_(APP.SHEETS.USERS, USER_HEADERS, user._row, {
    failed_attempts: 0,
    locked_until: '',
    last_login: nowIso_(),
    updated_at: nowIso_()
  });
  audit_({
    userId: user.user_id,
    username: normalizedUsername,
    role: user.role,
    action: 'LOGIN_SUCCESS',
    entityType: 'SESSION',
    entityId: sessionId,
    summary: 'เข้าสู่ระบบสำเร็จ'
  });
  return {
    token: token,
    expiresAt: expiresAt,
    user: publicUser_(user)
  };
}

function logout(sessionToken) {
  var session = getSession_(sessionToken, false);
  if (!session) return { ok: true };
  var sheet = getSheet_(APP.SHEETS.SESSIONS);
  sheet.deleteRow(session._row);
  audit_({
    userId: session.user_id,
    username: '',
    role: session.role,
    action: 'LOGOUT',
    entityType: 'SESSION',
    entityId: session.session_id,
    summary: 'ออกจากระบบ'
  });
  return { ok: true };
}

function getCurrentUser(sessionToken) {
  var session = getSession_(sessionToken, true);
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', session.user_id);
  if (!user || String(user.active) !== 'true') throw new Error('บัญชีผู้ใช้ถูกปิดใช้งาน');
  return publicUser_(user);
}

function changeMyPassword(sessionToken, currentPassword, newPassword) {
  var session = getSession_(sessionToken, true);
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', session.user_id);
  validatePasswordStrength_(newPassword);
  if (!constantTimeEqual_(hashPassword_(String(currentPassword), String(user.salt)), String(user.password_hash))) {
    throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  var salt = randomToken_(16);
  updateObjectRow_(APP.SHEETS.USERS, USER_HEADERS, user._row, {
    salt: salt,
    password_hash: hashPassword_(String(newPassword), salt),
    must_change_password: false,
    updated_at: nowIso_()
  });
  deleteUserSessions_(user.user_id, session.session_id);
  auditFromSession_(session, 'PASSWORD_CHANGED', 'USER', user.user_id, 'เปลี่ยนรหัสผ่าน');
  return { ok: true };
}

function listUsers(sessionToken) {
  requirePermission_(sessionToken, 'user:manage');
  return getAllObjects_(APP.SHEETS.USERS, USER_HEADERS).map(publicUser_);
}

function createUser(sessionToken, input) {
  var session = requirePermission_(sessionToken, 'user:manage');
  var result = createUserInternal_(input, session.user_id);
  auditFromSession_(session, 'USER_CREATED', 'USER', result.userId, 'สร้างผู้ใช้ ' + result.username);
  return result;
}

function createUserInternal_(input, createdBy) {
  var username = String(input.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,40}$/.test(username)) {
    throw new Error('ชื่อผู้ใช้ต้องมี 4–40 ตัว ใช้ a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง');
  }
  if (findObject_(APP.SHEETS.USERS, USER_HEADERS, 'username', username)) {
    throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
  }
  validatePasswordStrength_(input.password);
  var role = String(input.role || '');
  if ([APP.ROLES.OWNER, APP.ROLES.DOCTOR, APP.ROLES.STAFF].indexOf(role) === -1) {
    throw new Error('บทบาทไม่ถูกต้อง');
  }
  var salt = randomToken_(16);
  var userId = newId_('USR');
  appendObject_(APP.SHEETS.USERS, USER_HEADERS, {
    user_id: userId,
    username: username,
    password_hash: hashPassword_(String(input.password), salt),
    salt: salt,
    role: role,
    display_name: String(input.displayName || username).trim(),
    active: true,
    failed_attempts: 0,
    locked_until: '',
    must_change_password: input.mustChangePassword !== false,
    created_at: nowIso_(),
    updated_at: nowIso_(),
    last_login: ''
  });
  return {
    userId: userId,
    username: username,
    createdBy: createdBy
  };
}

function resetUserPassword(sessionToken, userId) {
  var session = requirePermission_(sessionToken, 'user:manage');
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', userId);
  if (!user) throw new Error('ไม่พบผู้ใช้');
  var temporaryPassword = 'Bmp!9' + randomToken_(6);
  var salt = randomToken_(16);
  updateObjectRow_(APP.SHEETS.USERS, USER_HEADERS, user._row, {
    salt: salt,
    password_hash: hashPassword_(temporaryPassword, salt),
    must_change_password: true,
    failed_attempts: 0,
    locked_until: '',
    updated_at: nowIso_()
  });
  deleteUserSessions_(userId, '');
  auditFromSession_(session, 'PASSWORD_RESET', 'USER', userId, 'รีเซ็ตรหัสผ่านผู้ใช้ ' + user.username);
  return { temporaryPassword: temporaryPassword };
}

function setUserActive(sessionToken, userId, active) {
  var session = requirePermission_(sessionToken, 'user:manage');
  if (session.user_id === userId && !active) {
    throw new Error('ไม่สามารถปิดบัญชีของตนเองได้');
  }
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', userId);
  if (!user) throw new Error('ไม่พบผู้ใช้');
  updateObjectRow_(APP.SHEETS.USERS, USER_HEADERS, user._row, {
    active: Boolean(active),
    updated_at: nowIso_()
  });
  if (!active) deleteUserSessions_(userId, '');
  auditFromSession_(session, active ? 'USER_ENABLED' : 'USER_DISABLED', 'USER', userId, user.username);
  return { ok: true };
}

function requirePermission_(sessionToken, permission) {
  var session = getSession_(sessionToken, true);
  var allowed = PERMISSIONS[session.role] || [];
  if (allowed.indexOf(permission) === -1) {
    throw new Error('คุณไม่มีสิทธิ์ดำเนินการนี้');
  }
  return session;
}

function getSession_(sessionToken, required) {
  var token = String(sessionToken || '');
  if (!token) {
    if (required) throw new Error('กรุณาเข้าสู่ระบบอีกครั้ง');
    return null;
  }
  var hash = hashToken_(token);
  var session = findObject_(APP.SHEETS.SESSIONS, SESSION_HEADERS, 'token_hash', hash);
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) getSheet_(APP.SHEETS.SESSIONS).deleteRow(session._row);
    if (required) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    return null;
  }
  updateObjectRow_(APP.SHEETS.SESSIONS, SESSION_HEADERS, session._row, {
    last_seen_at: nowIso_()
  });
  return session;
}

function deleteUserSessions_(userId, exceptSessionId) {
  var rows = getAllObjects_(APP.SHEETS.SESSIONS, SESSION_HEADERS)
    .filter(function (row) {
      return row.user_id === userId && row.session_id !== exceptSessionId;
    })
    .sort(function (a, b) { return b._row - a._row; });
  var sheet = getSheet_(APP.SHEETS.SESSIONS);
  rows.forEach(function (row) { sheet.deleteRow(row._row); });
}

function cleanupExpiredSessions_() {
  var rows = getAllObjects_(APP.SHEETS.SESSIONS, SESSION_HEADERS)
    .filter(function (row) { return new Date(row.expires_at).getTime() <= Date.now(); })
    .sort(function (a, b) { return b._row - a._row; });
  var sheet = getSheet_(APP.SHEETS.SESSIONS);
  rows.forEach(function (row) { sheet.deleteRow(row._row); });
}

function validatePasswordStrength_(password) {
  var value = String(password || '');
  if (value.length < 10 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) ||
      !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('รหัสผ่านต้องมีอย่างน้อย 10 ตัว และมีตัวใหญ่ ตัวเล็ก ตัวเลข และอักขระพิเศษ');
  }
}

function hashPassword_(password, salt) {
  var pepper = PropertiesService.getScriptProperties()
    .getProperty(APP.PROPERTY_KEYS.AUTH_PEPPER) || '';
  var bytes = Utilities.computeHmacSha256Signature(
    String(password) + ':' + String(salt),
    pepper,
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

function hashToken_(token) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token),
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

function bytesToHex_(bytes) {
  return bytes.map(function (byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqual_(left, right) {
  var a = String(left || '');
  var b = String(right || '');
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function publicUser_(user) {
  return {
    userId: user.user_id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    active: String(user.active) === 'true',
    mustChangePassword: String(user.must_change_password) === 'true',
    lastLogin: user.last_login || ''
  };
}

function audit_(entry) {
  appendObject_(APP.SHEETS.AUDIT, AUDIT_HEADERS, {
    audit_id: newId_('AUD'),
    timestamp: nowIso_(),
    user_id: entry.userId || '',
    username: entry.username || '',
    role: entry.role || '',
    action: entry.action || '',
    entity_type: entry.entityType || '',
    entity_id: entry.entityId || '',
    summary: String(entry.summary || '').substring(0, 500)
  });
}

function auditFromSession_(session, action, entityType, entityId, summary) {
  var user = findObject_(APP.SHEETS.USERS, USER_HEADERS, 'user_id', session.user_id);
  audit_({
    userId: session.user_id,
    username: user ? user.username : '',
    role: session.role,
    action: action,
    entityType: entityType,
    entityId: entityId,
    summary: summary
  });
}
