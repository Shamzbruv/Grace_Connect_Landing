const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const portalSource = fs.readFileSync(path.join(projectRoot, 'js', 'developer-portal.js'), 'utf8');
const portalHtml = fs.readFileSync(path.join(projectRoot, 'developer', 'index.html'), 'utf8');
const landingHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'css', 'style.css'), 'utf8');

test('financial operations are visible only to the three billing-capable developer roles', () => {
    assert.match(
        portalSource,
        /financialManagerRoles\s*=\s*new Set\(\[\s*'super_developer',\s*'billing_support',\s*'security_admin'\s*\]\)/
    );
    assert.match(portalHtml, /id="developerFinanceNav"[\s\S]*data-view="finance" hidden/);
    assert.match(portalSource, /financeNav\.hidden = !canManageFinancials\(\)/);
    assert.match(portalSource, /view === 'finance' && !canManageFinancials\(\)/);
});

test('financial dashboard uses production RPC contracts and bento chart renderers', () => {
    for (const rpcName of [
        'developer_get_financial_dashboard',
        'developer_list_subscription_requests',
        'developer_update_subscription_request',
        'developer_record_subscription_event'
    ]) {
        assert.match(portalSource, new RegExp(rpcName));
    }
    assert.match(portalHtml, /class="finance-bento-grid"/);
    assert.match(portalSource, /renderRevenueChart/);
    assert.match(portalSource, /renderStatusChart/);
    assert.match(portalSource, /renderTierChart/);
    assert.match(portalSource, /renderActivityChart/);
    assert.match(styles, /\.finance-line-chart/);
    assert.match(styles, /\.finance-donut/);
    assert.match(styles, /\.finance-grouped-chart/);
});

test('subscription request workflow and billing events are fully actionable', () => {
    assert.match(portalSource, /pending: \['in_review', 'rejected', 'cancelled'\]/);
    assert.match(portalSource, /in_review: \['quoted', 'approved', 'rejected', 'closed'\]/);
    for (const eventType of [
        'activated',
        'renewed',
        'payment_received',
        'trial_started',
        'marked_past_due',
        'cancelled',
        'note'
    ]) {
        assert.match(portalSource, new RegExp(`value="${eventType}"`));
    }
    assert.match(portalSource, /p_request_id: context\.requestId \|\| null/);
    assert.match(portalSource, /Enterprise activation, renewal, and payment events require/);
    assert.match(portalSource, /renderEnterpriseQuoteForm/);
    assert.match(portalSource, /p_status: 'quoted',[\s\S]*p_monthly_usd: monthlyUsd,[\s\S]*p_monthly_jmd: monthlyJmd/);
});

test('legacy direct subscription mutations and controls are absent', () => {
    assert.doesNotMatch(portalSource, /developer_set_church_subscription/);
    assert.doesNotMatch(portalSource, /developer_clear_church_subscription/);
    assert.doesNotMatch(portalSource, /data-action="grant-subscription"/);
    assert.doesNotMatch(portalSource, /data-action="clear-subscription"/);
});

test('every fixed tier preserves USD and approximate bracketed JMD pricing', () => {
    const expected = [
        ['17', '2,689'], ['34', '5,377'], ['51', '8,066'], ['68', '10,755'],
        ['85', '13,444'], ['102', '16,132'], ['119', '18,821'], ['136', '21,510'],
        ['153', '24,199'], ['170', '26,887']
    ];
    for (const [usd, jmd] of expected) {
        assert.match(landingHtml, new RegExp(`US\\$${usd}</strong> <span>\\(J\\$${jmd}\\)</span>`));
    }
    const pricingBody = landingHtml.match(/<table class="pricing-table">[\s\S]*?<\/table>/)?.[0] || '';
    assert.equal((pricingBody.match(/<tr(?:\s|>)/g) || []).length, 12, 'one header plus exactly 11 pricing tiers');
    assert.match(landingHtml, /Approximate Jamaican-dollar reference equivalents/i);
    assert.match(landingHtml, /Plan assessments use your active-member count/i);
    assert.doesNotMatch(landingHtml, /Pricing automatically matches church size/i);
    assert.match(landingHtml, /1,001\+/);
    assert.match(landingHtml, /Enterprise \/ Custom/);
});

test('landing page is a white neomorphic royal-blue and gold experience', () => {
    assert.match(styles, /--neo-surface: #f3f6fb/);
    assert.match(styles, /--neo-blue: #214fba/);
    assert.match(styles, /--neo-gold: #d3a927/);
    assert.match(styles, /box-shadow:[^;]*var\(--neo-shadow-dark\)[^;]*var\(--neo-shadow-light\)/);
    assert.match(styles, /\.home-page \.hero-live \{/);
    assert.match(styles, /\.home-page \.pricing-bento \{/);
    assert.match(styles, /\.home-page \.navbar \.nav-actions \.primary-btn[\s\S]*color: #fff !important/);
    assert.match(landingHtml, /css\/style\.css\?v=20260811-neomorphic-pricing/);
    assert.match(landingHtml, /js\/main\.js\?v=20260811-neomorphic-navigation/);
    assert.match(portalHtml, /\.\.\/css\/style\.css\?v=20260811-finance-bento/);
});

test('pricing states the current billing, access, cancellation, and trial behaviour directly', () => {
    assert.match(landingHtml, /Submitting a subscription or quote request does not charge your church or enrol it in a paid plan/i);
    assert.match(landingHtml, /subscriptions do not renew automatically/i);
    assert.match(landingHtml, /What a paid workspace unlocks/);
    assert.match(landingHtml, /What remains available/);
    assert.match(landingHtml, /Only paid church-workspace tools are paused/);
    assert.match(landingHtml, /submit a cancellation request in the app/i);
    assert.match(landingHtml, /Trials end on their recorded date and never convert automatically to a paid plan/i);
    assert.match(styles, /\.home-page \.pricing-transparency-grid/);
});
