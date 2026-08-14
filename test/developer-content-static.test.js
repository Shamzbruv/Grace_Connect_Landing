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
    portalSource.indexOf('const financeRequestTransitions')
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
        /const canRefresh = canManageScheduledContent\(\)[\s\S]*status[\s\S]*scheduled[\s\S]*releaseAt\.getTime\(\) > now/
    );
    assert.match(scheduledContentBlock, /data-action="regenerate-scheduled-quiz"/);
    assert.match(scheduledContentBlock, /data-action="regenerate-scheduled-daily-word"/);
    assert.match(
        portalSource,
        /if \(action === 'regenerate-scheduled-quiz'\) \{\s*if \(!canManageScheduledContent\(\)\)/
    );
    assert.match(
        portalSource,
        /if \(action === 'regenerate-scheduled-daily-word'\) \{\s*if \(!canManageScheduledContent\(\)\)/
    );
});

test('replacement eligibility expires at the unchanged release instant', () => {
    assert.match(scheduledContentBlock, /const releaseAt = new Date\(quiz\.release_at\)/);
    assert.match(scheduledContentBlock, /releaseAt\.getTime\(\) > now/);
    assert.match(scheduledContentBlock, /Release slot stays unchanged/);
    assert.match(scheduledContentBlock, /Release slot and study chapter stay unchanged/);
});

test('the schedule only renders future unpublished content and never raw church ids', () => {
    assert.match(scheduledContentBlock, /releaseTime > now/);
    assert.match(scheduledContentBlock, /\['published', 'released', 'completed', 'cancelled'\]\.includes\(status\)/);
    assert.match(scheduledContentBlock, /\.filter\(isUpcoming\)\.sort\(byReleaseTime\)/);
    assert.doesNotMatch(scheduledContentBlock, /quiz\.church_id/);
    assert.match(scheduledContentBlock, /quiz\.church_name/);
});

test('strict quiz uniqueness defaults on and is persisted through its dedicated RPC', () => {
    assert.match(portalHtml, /id="quizUniquenessToggle" checked disabled/);
    assert.match(portalSource, /developer_update_quiz_uniqueness_settings/);
    assert.match(portalSource, /p_guarantee_unique: requested/);
    assert.match(`${portalSource}\n${portalHtml}`, /fails? safely instead of repeating/i);
    assert.match(portalHtml, /for that church audience plus Grace Connect Global/i);
    assert.match(portalHtml, /ever-published/i);
    assert.match(portalHtml, /withdrawn or archived/i);
    assert.match(portalHtml, /Drafts and unrelated churches remain isolated/i);
});

test('Monday Wednesday and Saturday chapter-study linkage is visible without exposing answers', () => {
    assert.match(portalHtml, /Monday, Wednesday, and Saturday/i);
    assert.match(scheduledContentBlock, /word\.has_study_quiz/);
    assert.match(scheduledContentBlock, /study chapter/i);
});
