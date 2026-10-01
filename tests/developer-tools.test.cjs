const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load() {
  const scope = { window: {}, document: { querySelector: () => null } };
  vm.runInNewContext(fs.readFileSync('js/developer-tools.js','utf8'),scope);
  return scope.window.GraceDeveloperTools;
}
function root() {
  const handlers = new Map();
  return { innerHTML:'', handlers, querySelector(selector) {
    if (selector === '[data-reset-form]' && !this.innerHTML.includes('data-reset-form')) return null;
    return { addEventListener: (event,callback) => handlers.set(selector+event,callback) };
  } };
}
test('background validation accepts real image types and rejects empty or oversized files', () => {
  const tools = load();
  tools.validateBackgroundFile({type:'image/webp',size:1234});
  for (const file of [null,{type:'image/svg+xml',size:10},{type:'image/png',size:0},{type:'image/jpeg',size:5242881}]) assert.throws(() => tools.validateBackgroundFile(file));
});
test('untrusted titles are escaped and database errors are not treated as success', () => {
  const tools=load();
  assert.equal(tools.escape('<img src=x onerror="bad()">'),'&lt;img src=x onerror=&quot;bad()&quot;&gt;');
  assert.throws(() => tools.unwrap({error:new Error('denied')}),/denied/);
});
test('reset button requires owner role, server capability and configured worker', () => {
  const tools=load();
  for (const role of ['super_developer','read_only_support']) for (const ready of [true,false]) {
    const page=root();
    tools.renderOperations(page,{reset:{can_start:true,preserved_account:'owner@example.test'},reset_ready:ready},{},{developer_role:role});
    assert.equal(page.innerHTML.includes('data-reset-form'),role==='super_developer' && ready);
    assert.equal(page.handlers.has('[data-reset-form]submit'),role==='super_developer' && ready);
  }
});
test('consumed reset has no form for any phase, including interrupted cleanup', () => {
  const tools=load();
  for (const phase of ['data','storage','r2','accounts','complete']) {
    const page=root();
    tools.renderOperations(page,{reset:{used:true,can_start:true,phase,last_error:'<script>alert(1)</script>'},reset_ready:true},{},{developer_role:'super_developer'});
    assert.ok(!page.innerHTML.includes('data-reset-form'));
    assert.ok(!page.innerHTML.includes('<script>'));
    assert.match(page.innerHTML,/cannot be started again/);
  }
});
test('payment status does not imply configuration equals a successful live payment', () => {
  const page=root();
  load().renderOperations(page,{reset:{},payments_ready:true},{},{});
  assert.match(page.innerHTML,/Confirm a real payment/);
  assert.match(page.innerHTML,/redirect alone never grants paid access/);
});
