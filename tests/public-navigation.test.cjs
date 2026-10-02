const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destinations = ['index.html', 'features.html', 'pricing.html', 'legal.html', 'how-it-works.html', 'faq.html', 'member-signup.html', 'register-church.html'];
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
test('every public page exposes the same dedicated navigation destinations', () => {
    for (const name of pages) {
        const source = fs.readFileSync(path.join(root, name), 'utf8');
        const nav = source.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
        assert.ok(nav, name);
        const links = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
        assert.deepEqual(links, ['index.html', ...destinations], name);
        assert.match(source, /js\/navigation\.js\?v=20261002/, name);
        for (const link of links) assert.ok(fs.existsSync(path.join(root, link)), `${name}: ${link}`);
        if (destinations.includes(name)) {
            assert.equal([...nav.matchAll(/aria-current="page"/g)].length, 1, name);
            assert.match(nav, new RegExp(`href="${name.replace('.', '\\.')}"[^>]*aria-current="page"`), name);
        }
    }
});
test('new pages keep the overview information and offer supporting detail', () => {
    const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const pricing = fs.readFileSync(path.join(root, 'pricing.html'), 'utf8');
    assert.equal(pricing.match(/<table class="pricing-table">[\s\S]*?<\/table>/)[0], home.match(/<table class="pricing-table">[\s\S]*?<\/table>/)[0]);
    for (const [name, section] of [['features.html', 'features'], ['pricing.html', 'pricing'], ['how-it-works.html', 'how-it-works'], ['faq.html', 'faq']]) {
        const source = fs.readFileSync(path.join(root, name), 'utf8');
        assert.match(source, new RegExp(`id="${section}"`));
        assert.match(source, /<main id="main-content">/);
        assert.match(source, /name="description"/);
    }
    assert.match(pricing, /subscriptions do not renew automatically/);
    assert.match(pricing, /href="subscription-request.html"/);
    assert.match(pricing, /href="manage-subscription.html"/);
});
