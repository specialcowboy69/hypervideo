import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { successMarker } from './check-chat-render-issue.mjs';

export function resultComment(result, sha) {
  if (result.status === 'in_progress') return `Estado remoto incierto para ${result.slug}. Job: ${result.jobId}. Ejecución: ${result.runUrl}. ${result.error || 'Comprueba n8n antes de reintentar.'}\n`;
  if (result.status !== 'needs_review') return `Render bloqueado para ${result.slug}. ${result.error || 'Revisa el job de GitHub Actions.'} Ejecución: ${result.runUrl || ''}\n`;
  return `${successMarker(result.slug, sha)}\nBorrador de ${result.slug}: needs_review.\nMP4: ${result.downloadUrl}\nJob: ${result.jobId}\nNo se ha programado ni publicado.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  const result = JSON.parse(await fs.readFile(arg('--result'), 'utf8'));
  await fs.writeFile(arg('--output'), resultComment(result, arg('--source-sha')));
}
