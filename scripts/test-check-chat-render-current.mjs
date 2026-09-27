import assert from 'node:assert/strict';
import { checkCurrent } from './check-chat-render-current.mjs';

assert.deepEqual(checkCurrent({ status: 'pending' }), { proceed: true, reason: 'ready' });
assert.deepEqual(checkCurrent({ status: 'blocked' }), { proceed: true, reason: 'retry' });
assert.deepEqual(checkCurrent({ status: 'needs_revision' }), { proceed: true, reason: 'retry' });
assert.deepEqual(checkCurrent({ status: 'needs_review' }), { proceed: false, reason: 'already_rendered' });
assert.deepEqual(checkCurrent({ status: 'in_progress', outputs: { render_job_id: 'hfb-nuevo-video-1' } }), { proceed: false, reason: 'active:hfb-nuevo-video-1' });
console.log('check-chat-render-current tests passed');
