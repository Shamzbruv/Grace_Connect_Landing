const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('js/analytics.js', 'utf8');
function load(path, dnt) {
  const scripts = [];
  const context = {
    URL, navigator: {doNotTrack:dnt},
    window: { location: { origin:'https://www.graceconnect.love',pathname:path,
      href:'https://www.graceconnect.love'+path+'?token=SECRET#access_token=SECRET' } },
    document: { referrer:'https://www.graceconnect.love/auth-callback.html?token=SECRET',
      head: {appendChild: s => scripts.push(s)}, createElement: () => ({}) },
  };
  vm.runInNewContext(code,context);
  return {scripts,...context};
}
test('recovery pages never load analytics', () => {
  for (const path of ['/auth-callback.html','/reset-password.html']) {
    const result=load(path);
    assert.equal(result.scripts.length,0);
    assert.equal(result.window.dataLayer,undefined);
  }
});
test('page views omit query and fragment credentials', () => {
  const result=load('/manage-subscription.html');
  result.window.gcTrack('view',{page_location:'https://example.org?secret=SECRET'});
  assert.equal(JSON.stringify(result.window.dataLayer).includes('SECRET'),false);
  const config=result.window.dataLayer[1][2];
  assert.equal(config.page_location,'https://www.graceconnect.love/manage-subscription.html');
  assert.equal(config.page_referrer,'https://www.graceconnect.love/auth-callback.html');
});
test('do not track remains respected',()=>assert.equal(load('/index.html','1').scripts.length,0));
