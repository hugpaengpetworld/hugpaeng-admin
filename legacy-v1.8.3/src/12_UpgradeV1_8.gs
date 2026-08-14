/**
 * One-time, idempotent upgrade for an existing v1.7/v1.8 spreadsheet.
 * Run this function once after copying all v1.8.1 source files.
 */
function upgradeSystemV1_8() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = getSpreadsheet_();
    var upgradeSheets = [
      {
        name: APP.SHEETS.STERILIZATION_HOLIDAYS,
        headers: STERILIZATION_HOLIDAY_HEADERS
      },
      {
        name: APP.SHEETS.RECEIPTS,
        headers: RECEIPT_HEADERS
      },
      {
        name: APP.SHEETS.RECEIPT_ITEMS,
        headers: RECEIPT_ITEM_HEADERS
      }
    ];
    upgradeSheets.forEach(function (definition) {
      var sheet = ensureSheet_(spreadsheet, definition.name, definition.headers);
      formatUpgradeV1_8Sheet_(sheet, definition.headers.length);
    });
    ensureReceiptFolder_();

    var completedAt = nowIso_();
    PropertiesService.getScriptProperties().setProperty(
      APP.PROPERTY_KEYS.UPGRADE_V1_8_COMPLETED,
      completedAt
    );
    console.log('อัปเกรดเป็น v1.8.1 สำเร็จ: เพิ่มวันหยุดคิวทำหมันและระบบใบเสร็จ');
    return {
      ok: true,
      completedAt: completedAt,
      sheetName: APP.SHEETS.STERILIZATION_HOLIDAYS,
      sheetNames: upgradeSheets.map(function (definition) { return definition.name; })
    };
  } finally {
    lock.releaseLock();
  }
}

function formatUpgradeV1_8Sheet_(sheet, headerCount) {
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 1, headerCount)
    .setBackground('#123D32')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.setRowHeight(1, 40);
  sheet.autoResizeColumns(1, headerCount);
}
