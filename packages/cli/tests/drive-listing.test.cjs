const assert = require('node:assert/strict');
const test = require('node:test');
const { decodeDriveListingLiteral, selectDriveEntry } = require('../dist/runtime/drive-listing.js');
function entry(id, name, folder = false, size = 12) {
  const result = Array(14).fill(null);
  result[0] = id; result[2] = name;
  result[3] = folder ? 'application/vnd.google-apps.folder' : 'application/octet-stream';
  result[13] = size;
  return result;
}
function html(payload) {
  const literal = JSON.stringify(JSON.stringify(payload)).slice(1, -1).replaceAll("'", "\\'");
  return `<script>window['_DRIVE_ivd'] = '${literal}';</script>`;
}
test('selects exact version folders and digest-named tau files', () => {
  assert.equal(selectDriveEntry(html([entry('version', '2.1', true), entry('tau', 'tau_sequence', true)]), '2.1', 'folder').fileId, 'version');
  const name = 'a'.repeat(64) + '.rkyv';
  assert.equal(selectDriveEntry(html([entry('point', name)]), name, 'file').sizeBytes, 12);
});
test('decodes JavaScript hex escapes in the Drive listing', () => {
  assert.equal(decodeDriveListingLiteral(String.raw`window['_DRIVE_ivd'] = '\x5b\x5d';`), '[]');
  const escapedListing = String.raw`window['_DRIVE_ivd'] = '[["folder-id",null,"3\x2E0","application/vnd.google-apps.folder"]]';`;
  assert.equal(selectDriveEntry(escapedListing, '3.0', 'folder').fileId, 'folder-id');
});
test('rejects missing, duplicate, wrong-kind, unsafe IDs and invalid sizes', () => {
  for (const entries of [
    [], [entry('one', '2.1')], [entry('a', '2.1', true), entry('b', '2.1', true)],
    [entry('../bad', '2.1', true)], [entry('old', 'tokamak-backend-crs-v2.1-20260824T000000Z.zip')],
  ]) assert.throws(() => selectDriveEntry(html(entries), '2.1', 'folder'));
  for (const size of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => selectDriveEntry(html([entry('a', 'key', false, size)]), 'key', 'file'));
  }
});
test('fails closed on changed markup, malformed literals and unsupported escapes', () => {
  assert.throws(() => decodeDriveListingLiteral("<script>window['OTHER'] = '[]';</script>"));
  assert.throws(() => decodeDriveListingLiteral("<script>window['_DRIVE_ivd'] = '[ ]</script>"));
  for (const escape of [String.raw`\x`, String.raw`\x5`, String.raw`\x5g`, String.raw`\xZZ`, String.raw`\v`]) {
    assert.throws(() => decodeDriveListingLiteral(`window['_DRIVE_ivd'] = '${escape}';`));
  }
});
