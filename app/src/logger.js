import { mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

export function createLogger(directory) {
  mkdirSync(directory, {recursive: true});
  const stream = createWriteStream(join(directory, 'app.log'), {flags: 'a', mode: 0o644});
  stream.on('error', error => { console.error('Log stream failed:', error.code); process.exitCode = 1; });
  return (event, fields = {}) => {
    // Callers pass only explicit fields; never log body, cookies, passwords or session IDs.
    const entry = JSON.stringify({timestamp: new Date().toISOString(), event, ...fields});
    stream.write(`${entry}\n`);
    console.log(entry);
  };
}
