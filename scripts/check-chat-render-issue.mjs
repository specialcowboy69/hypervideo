import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRequest } from './validate-chat-render-request.mjs';

export function successMarker(slug, sha) {
  return `<!-- hyperframes-render-completed slug=${slug} sha=${sha} -->`;
}

export function checkChatRenderIssue(issue, comments, expectedOwner, expectedSha) {
  if (issue?.user?.login?.toLowerCase() !== expectedOwner.toLowerCase()) throw new Error('Issue must be created by repository owner');
  const { slug, sha } = parseRequest(issue.body);
  if (sha !== expectedSha) throw new Error('Request SHA must equal current main SHA');
  const marker = successMarker(slug, sha);
  const skip = comments.some(comment => comment?.user?.login === 'github-actions[bot]' && comment.body?.includes(marker));
  return { slug, sha, skip };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const comments = JSON.parse(await fs.readFile(process.env.COMMENTS_PATH, 'utf8'));
  const result = checkChatRenderIssue(event.issue, comments, process.env.GITHUB_REPOSITORY_OWNER, process.env.GITHUB_SHA);
  console.log(JSON.stringify(result));
}
