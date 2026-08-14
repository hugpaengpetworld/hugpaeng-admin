function doGet(event) {
  var page = String((event && event.parameter && event.parameter.page) || '').toLowerCase();
  var file = page === 'admin' ? 'Admin' : 'Index';
  var template = HtmlService.createTemplateFromFile(file);
  template.appUrl = ScriptApp.getService().getUrl() || '';
  return template.evaluate()
    .setTitle(page === 'admin' ? 'หลังบ้าน | ' + APP.NAME_TH : APP.NAME_TH)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getPrivateFileUrl(sessionToken, fileId) {
  requirePermission_(sessionToken, 'file:view');
  if (!fileId) throw new Error('ไม่พบไฟล์');
  DriveApp.getFileById(fileId).getName();
  return 'https://drive.google.com/open?id=' + encodeURIComponent(fileId);
}
