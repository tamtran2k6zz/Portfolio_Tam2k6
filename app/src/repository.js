import session from 'express-session';
import { hashPassword } from './security.js';

export function createRepository(pool) {
  const rows = async (sql, args = []) => (await pool.execute(sql, args))[0];
  return {
    ping: () => rows('SELECT 1'),
    findUser: async username => (await rows('SELECT id, username, password_hash FROM users WHERE username = ?', [username]))[0],
    profile: async () => (await rows('SELECT * FROM profiles WHERE id = 1'))[0],
    projects: () => rows('SELECT * FROM projects ORDER BY id ASC'),
    skills: () => rows('SELECT * FROM skills ORDER BY id'),
    project: async id => (await rows('SELECT * FROM projects WHERE id = ?', [id]))[0],
    saveProfile: value => rows('UPDATE profiles SET full_name=?, headline=?, bio=?, email=?, github_url=? WHERE id=1', [value.full_name, value.headline, value.bio, value.email, value.github_url]),
    createProject: value => rows('INSERT INTO projects(title, description, stack, link) VALUES(?,?,?,?)', [value.title, value.description, value.stack, value.link]),
    updateProject: (id, value) => rows('UPDATE projects SET title=?, description=?, stack=?, link=? WHERE id=?', [value.title, value.description, value.stack, value.link, id]),
    deleteProject: id => rows('DELETE FROM projects WHERE id=?', [id]),
    createSkill: value => rows('INSERT INTO skills(name, level) VALUES(?,?)', [value.name, value.level]),
    deleteSkill: id => rows('DELETE FROM skills WHERE id=?', [id]),
    changePassword: (id, password) => rows('UPDATE users SET password_hash=? WHERE id=?', [hashPassword(password), id]),
    seedAdmin: async (username, password) => {
      if (!await rows('SELECT id FROM users LIMIT 1').then(r => r.length)) {
        if (!password || password.length < 16) throw new Error('ADMIN_INITIAL_PASSWORD must contain at least 16 characters');
        await rows('INSERT INTO users(username,password_hash) VALUES(?,?)', [username, hashPassword(password)]);
      }
    }
  };
}

export class MysqlSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  get(sid, callback) {
    this.pool.execute('SELECT data FROM sessions WHERE sid=? AND expires_at > NOW()', [sid])
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null)).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const expires = new Date(value.cookie.expires || Date.now() + 3600000);
    this.pool.execute('INSERT INTO sessions(sid,data,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data), expires_at=VALUES(expires_at)', [sid, JSON.stringify(value), expires])
      .then(() => callback()).catch(callback);
  }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
  destroy(sid, callback = () => {}) {
    this.pool.execute('DELETE FROM sessions WHERE sid=?', [sid]).then(() => callback()).catch(callback);
  }
}
