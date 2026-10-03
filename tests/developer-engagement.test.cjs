const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function fixture(data) {
  const nodes = new Map();
  const root = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '[data-ios-config]' && !this.innerHTML.includes('data-ios-config')) return null;
      if (!nodes.has(selector)) nodes.set(selector, {
        disabled: false, textContent: '', handlers: {},
        addEventListener(event, callback) { this.handlers[event] = callback; },
      });
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const calls = [];
  const scope = { window: {}, document: { getElementById: () => root } };
  vm.runInNewContext(fs.readFileSync('js/developer-tools.js', 'utf8'), scope);
  vm.runInNewContext(fs.readFileSync('js/developer-engagement.js', 'utf8'), scope);
  const client = { async rpc(name, args) { calls.push({ name, args }); return { data }; } };
  return { ...scope.window.GraceExperienceTools, root, calls, client };
}

test('reminders apply only to previously prompted unanswered members', () => {
  const f = fixture({});
  for (const response of [null, true, false]) {
    for (const last_prompted_at of [null, '2026-10-02']) {
      for (const resend_requested_at of [null, '2026-10-03']) {
        assert.equal(f.canResend({ response, last_prompted_at, resend_requested_at }),
          response === null && !!last_prompted_at && !resend_requested_at);
      }
    }
  }
  assert.equal(f.usage(7201), '2h 0m');
  assert.equal(f.usage(-10), '0h 0m');
});

test('feedback renders escaped member names and never infers a submitted review', async () => {
  const f = fixture({ entries: [{ user_id: 'member', display_name: '<script>bad()</script>',
    response: false, active_seconds: 9000, last_prompted_at: '2026-10-02',
    last_store_opened_at: '2026-10-02', prompt_count: 1 }], total: 1 });
  await f.loadRatings(f.client, { developer_role: 'support_developer' });
  assert.match(f.root.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(f.root.innerHTML, /<script>|data-ios-config|data-survey-resend=/);
  assert.match(f.root.innerHTML, /Not verifiable/);
  assert.match(f.root.innerHTML, /Answered — no repeat/);
  assert.match(f.root.innerHTML, /2h 30m/);
  assert.equal(f.calls[0].name, 'developer_app_experience');
  assert.equal(f.calls[0].args.p_limit, 50);
});

test('only the owner is offered the iPhone listing configuration', async () => {
  for (const role of ['super_developer', 'support_developer', 'security_admin']) {
    const f = fixture({ entries: [], total: 0, configuration: {} });
    await f.loadRatings(f.client, { developer_role: role });
    assert.equal(f.root.innerHTML.includes('data-ios-config'), role === 'super_developer');
  }
});

test('monthly status displays escaped failures and viewing never queues AI work', async () => {
  const f = fixture({ days: [{ content_date: '2026-10-03', status: 'failed',
    stage: 'quiz', attempts: 3, last_error: '<img src=x onerror=bad()>' }] });
  await f.loadPreparation(f.client, {}, '2026-10');
  assert.match(f.root.innerHTML, /&lt;img/);
  assert.doesNotMatch(f.root.innerHTML, /<img/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'developer_content_batch');
  assert.equal(f.calls[0].args.p_action, 'status');
  assert.equal(f.calls[0].args.p_month, '2026-10-01');
});
