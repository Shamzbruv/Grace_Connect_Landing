const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const blueprint = fs.readFileSync(path.join(projectRoot, 'render.yaml'), 'utf8');

function blueprintValue(name) {
    const match = blueprint.match(new RegExp(`^\\s*${name}:\\s*([^#\\n]+)`, 'm'));
    assert.ok(match, `${name} must be declared in render.yaml`);
    return match[1].trim().replace(/^['"]|['"]$/g, '');
}

test('Render publishes the root-level static site instead of a nonexistent Flutter build', () => {
    assert.equal(blueprintValue('runtime'), 'static');
    assert.equal(blueprintValue('staticPublishPath'), './');
    assert.doesNotMatch(blueprint, /staticPublishPath:\s*(?:\.\/)?build\/web/);
    assert.doesNotMatch(blueprintValue('buildCommand'), /flutter\s+build/i);

    const publishDirectory = path.resolve(projectRoot, blueprintValue('staticPublishPath'));
    assert.equal(publishDirectory, projectRoot);
    for (const relativePath of ['index.html', 'css/style.css', 'js/main.js', 'assets/logo.png']) {
        assert.ok(
            fs.existsSync(path.join(publishDirectory, relativePath)),
            `${relativePath} must exist beneath Render's static publish directory`
        );
    }
});

test('the published entry page references assets that live under the publish directory', () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
    assert.match(indexHtml, /href="css\/style\.css(?:\?[^"\s]+)?"/);
    assert.match(indexHtml, /src="js\/main\.js(?:\?[^"\s]+)?"/);
});
