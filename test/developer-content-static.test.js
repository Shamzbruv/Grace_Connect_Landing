const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const portalSource = fs.readFileSync(
    path.join(projectRoot, 'js', 'developer-portal.js'),
    'utf8'
);
const portalHtml = fs.readFileSync(
    path.join(projectRoot, 'developer', 'index.html'),
    'utf8'
);

const scheduledContentBlock = portalSource.slice(
    portalSource.indexOf('const loadScheduledContent'),
    portalSource.indexOf('const renderChurchDetail')
);

test('scheduled quiz answers remain absent from the developer renderer', () => {
    assert.ok(scheduledContentBlock.length > 0, 'scheduled content renderer is missing');
    assert.doesNotMatch(
        scheduledContentBlock,
        /correct_answer|correct_option_index|explanation/,
        'the developer renderer must never consume answer-key fields'
    );
    assert.match(portalHtml, /id="view-content"/);
});

test('only mutation-capable roles see question replacement', () => {
    assert.match(
        portalSource,
        /scheduledContentManagerRoles\s*=\s*new Set\(\[\s*'super_developer',\s*'support_developer',\s*'content_moderator',\s*'security_admin'\s*\]\)/
    );
    assert.match(
        scheduledContentBlock,
        /const canRefresh = canManageScheduledContent\(\)[\s\S]*status[\s\S]*scheduled[\s\S]*isUpcoming/
    );
    assert.match(scheduledContentBlock, /data-action="regenerate-scheduled-quiz"/);
    assert.match(
        portalSource,
        /if \(action === 'regenerate-scheduled-quiz'\) \{\s*if \(!canManageScheduledContent\(\)\)/
    );
});

test('replacement eligibility expires at the unchanged release instant', () => {
    assert.match(scheduledContentBlock, /const releaseAt = new Date\(quiz\.release_at\)/);
    assert.match(scheduledContentBlock, /releaseAt > new Date\(\)/);
    assert.match(scheduledContentBlock, /Release slot remains unchanged/);
});
