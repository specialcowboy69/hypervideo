import assert from 'node:assert/strict';
import { checkChatRenderIssue, successMarker } from './check-chat-render-issue.mjs';

const sha = 'a'.repeat(40);
const issue = { user: { login: 'specialcowboy69' }, body: `slug: nuevo-video\nsha: ${sha}` };
assert.deepEqual(checkChatRenderIssue(issue, [], 'specialcowboy69', sha), { slug: 'nuevo-video', sha, skip: false });
assert.throws(() => checkChatRenderIssue({ ...issue, user: { login: 'stranger' } }, [], 'specialcowboy69', sha), /owner/);
assert.throws(() => checkChatRenderIssue(issue, [], 'specialcowboy69', 'b'.repeat(40)), /current main/);
assert.deepEqual(checkChatRenderIssue(issue, [{ user: { login: 'github-actions[bot]' }, body: `${successMarker('nuevo-video', sha)}\nreview URL` }], 'specialcowboy69', sha).skip, true);
assert.equal(checkChatRenderIssue(issue, [{ user: { login: 'stranger' }, body: successMarker('nuevo-video', sha) }], 'specialcowboy69', sha).skip, false);
assert.equal(checkChatRenderIssue(issue, [{ user: { login: 'github-actions[bot]' }, body: successMarker('another-video', sha) }], 'specialcowboy69', sha).skip, false);
console.log('check-chat-render-issue tests passed');
