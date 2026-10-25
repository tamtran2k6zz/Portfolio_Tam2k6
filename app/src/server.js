import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createApplication } from './app.js';
import { createRepository, MysqlSessionStore } from './repository.js';
import { createLogger } from './logger.js';

const log = createLogger(process.env.LOG_DIR || '/app/logs');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql', port: 3306, user: 'portfolio_app',
  password: process.env.APP_DB_PASSWORD, database: 'portfolio',
  connectionLimit: 5, charset: 'utf8mb4', timezone: 'Z'
});
const repo = createRepository(pool);
await repo.ping();
await repo.seedAdmin(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_INITIAL_PASSWORD);
const app = createApplication({
  repo, sessionStore: new MysqlSessionStore(pool), log,
  config: {sessionSecret: process.env.SESSION_SECRET, secure: process.env.COOKIE_SECURE === 'true', invalidateSessions: () => pool.execute('DELETE FROM sessions')}
});
const server = app.listen(3000, '0.0.0.0', () => log('application_started', {port: 3000}));
const cleanup = setInterval(() => pool.execute('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => log('session_cleanup_failed', {level: 'ERROR'})), 60000);
cleanup.unref();
process.on('SIGTERM', () => {
  clearInterval(cleanup);
  server.close(async () => { await pool.end(); process.exit(0); });
});
