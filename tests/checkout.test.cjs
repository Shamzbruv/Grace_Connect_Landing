const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function load(context) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      disabled: false, textContent: '', checked: true, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      querySelector() { return { value: 'USD' }; },
    });
    return elements.get(id);
  };
  const calls = [];
  const scope = {
    document: { getElementById: element, addEventListener: (_, cb) => cb() },
    window: { gcSupabase: {
      auth: { getSession: async () => ({data:{session:{}}}) },
      functions: { invoke: async (_, {body}) => {
        calls.push(body.action);
        return {data: {context, checkoutUrl:'https://example.invalid/pay'}};
      } },
    }, location: { origin:'https://graceconnect.love', assign() {} } },
  };
  vm.runInNewContext(fs.readFileSync('js/subscribe.js','utf8'), scope);
  await new Promise(setImmediate);
  return { element, calls };
}

test('unconfigured payment stays disabled after loading and cannot submit', async () => {
  const page = await load({ checkoutReady:false, calculatedTier:{tierCode:'tier_0_50'} });
  assert.equal(page.element('subscribePayButton').disabled,true);
  assert.match(page.element('subscribeMessage').textContent,/not available yet/);
  await page.element('subscribeForm').listeners.submit({preventDefault(){}});
  assert.deepEqual(page.calls,['context']);
});

test('enterprise plans stay disabled even when payments are configured', async () => {
  const page = await load({ checkoutReady:true, calculatedTier:{customQuote:true} });
  assert.equal(page.element('subscribePayButton').disabled,true);
  assert.match(page.element('subscribeMessage').textContent,/enterprise quote/);
});

test('configured published plan can open secure checkout', async () => {
  const page = await load({ checkoutReady:true, calculatedTier:{tierCode:'tier_0_50'} });
  assert.equal(page.element('subscribePayButton').disabled,false);
  await page.element('subscribeForm').listeners.submit({preventDefault(){}});
  assert.deepEqual(page.calls,['context','checkout']);
});
