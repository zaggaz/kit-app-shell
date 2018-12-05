const { assert } = require('chai');
const { createScript, createScriptWithContent } = require('./util');

function randomString() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

suite('parse5/util.js', () => {
    test('createScript', () => {
        const src = randomString();
        const script = createScript(src);
        assert.equal(script.attrs[0].value, src);
    });
    test('createScriptWithContent', () => {
        const content = randomString();
        const script = createScriptWithContent(content);
        assert.equal(script.childNodes[0].value, content);
    });
});