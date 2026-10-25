import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectVisual } from './project-visual.js';
import { text, webUrl, positiveId, safeEqual, verifyPassword, hashPassword } from './security.js';

const dummyHash = hashPassword(randomBytes(32).toString('hex'));
const fail = (status, message) => Object.assign(new Error(message), {status});

export function createApplication({repo, sessionStore, config, log}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Only Nginx publishes the website port.
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../views/', import.meta.url)));
  app.locals.projectVisual = projectVisual;
  app.use((req, res, next) => { res.locals.user = null; res.locals.csrf = ''; res.locals.isPortfolio = false; next(); });
  app.use(helmet({
    strictTransportSecurity: config.secure ? {maxAge: 86400} : false,
    contentSecurityPolicy: {directives: {'upgrade-insecure-requests': config.secure ? [] : null}}
  }));
  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => log('http_request', {method: req.method, path: req.path.slice(0,180), status: res.statusCode, duration_ms: Math.round(performance.now() - started), ip: req.ip}));
    next();
  });
  app.use('/static', express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.get('/health', async (req, res) => {
    try { await repo.ping(); res.json({status: 'UP', database: 'CONNECTED'}); }
    catch { res.status(503).json({status: 'DOWN', database: 'UNAVAILABLE'}); }
  });
  app.use(express.urlencoded({extended: false, limit: '16kb'}));
  app.use(session({
    name: 'portfolio.sid', secret: config.sessionSecret, store: sessionStore,
    resave: false, saveUninitialized: false,
    cookie: {httpOnly: true, sameSite: 'lax', secure: config.secure, maxAge: 3600000}
  }));
  app.use((req, res, next) => {
    req.session.csrf ||= randomBytes(32).toString('hex');
    res.locals.csrf = req.session.csrf;
    res.locals.user = req.session.user || null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !safeEqual(req.session.csrf, req.body?._csrf)) {
      log('csrf_denied', {status: 403, path: req.path, ip: req.ip});
      return next(fail(403, 'CSRF token không hợp lệ. Mở lại biểu mẫu và thử lại.'));
    }
    next();
  });
  function requireAdmin(req, res, next) {
    if (!req.session.user) {
      log('auth_denied', {status: 403, path: req.path, ip: req.ip});
      return next(fail(403, 'Bạn cần đăng nhập để truy cập trang quản trị.'));
    }
    next();
  }
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: config.loginLimit || 5,
    standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true,
    handler: (req, res) => {
      log('login_rate_limited', {status: 429, ip: req.ip});
      res.status(429).render('error', {message: 'Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.', status: 429});
    }
  });
  app.get('/', async (req, res) => {
    const [profile, projects, skills] = await Promise.all([repo.profile(), repo.projects(), repo.skills()]);
    res.render('index', {profile, projects, skills, isPortfolio: true});
  });
  app.get('/projects/:id', async (req, res) => {
    const project = await repo.project(positiveId(req.params.id));
    if (!project) throw fail(404, 'Không tìm thấy dự án.');
    res.render('project', {project});
  });
  app.get('/login', (req, res) => res.render('login', {error: null}));
  app.post('/login', loginLimiter, async (req, res) => {
    const username = text(req.body.username, 80);
    const password = text(req.body.password, 128);
    const user = await repo.findUser(username);
    const valid = verifyPassword(password, user?.password_hash || dummyHash);
    if (!user || !valid) {
      log('login_failed', {status: 401, ip: req.ip});
      return res.status(401).render('login', {error: 'Thông tin đăng nhập không đúng.'});
    }
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = {id: user.id, username: user.username};
    req.session.csrf = randomBytes(32).toString('hex');
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    log('login_success', {user_id: user.id, ip: req.ip});
    res.redirect('/admin');
  });
  app.post('/logout', (req, res, next) => {
    const userId = req.session.user?.id;
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('portfolio.sid', {path: '/'});
      log('logout', {user_id: userId, ip: req.ip});
      res.redirect('/');
    });
  });
  app.use('/admin', requireAdmin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/admin', async (req, res) => {
    const [profile, projects, skills] = await Promise.all([repo.profile(), repo.projects(), repo.skills()]);
    res.render('admin', {profile, projects, skills});
  });
  app.post('/admin/profile', async (req, res) => {
    const value = {full_name: text(req.body.full_name,100), headline: text(req.body.headline,150), bio: text(req.body.bio,2000), email: text(req.body.email,150), github_url: webUrl(req.body.github_url)};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw fail(400, 'Email không hợp lệ.');
    await repo.saveProfile(value);
    log('profile_updated', {user_id: req.session.user.id});
    res.redirect('/admin');
  });
  app.get('/admin/projects/new', (req, res) => res.render('project-form', {project: null}));
  app.get('/admin/projects/:id/edit', async (req, res) => {
    const project = await repo.project(positiveId(req.params.id));
    if (!project) throw fail(404, 'Không tìm thấy dự án.');
    res.render('project-form', {project});
  });
  function projectInput(body) {
    return {title: text(body.title,120), description: text(body.description,3000), stack: text(body.stack,200), link: webUrl(body.link)};
  }
  app.post('/admin/projects', async (req, res) => {
    const result = await repo.createProject(projectInput(req.body));
    log('project_created', {user_id: req.session.user.id, project_id: result.insertId});
    res.redirect('/admin');
  });
  app.post('/admin/projects/:id/edit', async (req, res) => {
    const id = positiveId(req.params.id);
    if (!await repo.project(id)) throw fail(404, 'Không tìm thấy dự án.');
    await repo.updateProject(id, projectInput(req.body));
    log('project_updated', {user_id: req.session.user.id, project_id: id});
    res.redirect('/admin');
  });
  app.post('/admin/projects/:id/delete', async (req, res) => {
    const id = positiveId(req.params.id);
    await repo.deleteProject(id);
    log('project_deleted', {user_id: req.session.user.id, project_id: id});
    res.redirect('/admin');
  });
  app.post('/admin/skills', async (req, res) => {
    await repo.createSkill({name: text(req.body.name,80), level: text(req.body.level,80)});
    log('skill_created', {user_id: req.session.user.id});
    res.redirect('/admin');
  });
  app.post('/admin/skills/:id/delete', async (req, res) => {
    await repo.deleteSkill(positiveId(req.params.id));
    log('skill_deleted', {user_id: req.session.user.id});
    res.redirect('/admin');
  });
  app.post('/admin/password', async (req, res) => {
    const current = text(req.body.current_password,128);
    const next = text(req.body.new_password,128);
    const user = await repo.findUser(req.session.user.username);
    if (!verifyPassword(current, user.password_hash)) throw fail(400, 'Mật khẩu hiện tại không đúng.');
    if (next.length < 16) throw fail(400, 'Mật khẩu mới cần ít nhất 16 ký tự.');
    await repo.changePassword(user.id, next);
    log('password_changed', {user_id: user.id});
    // Single-admin system: invalidate all persisted sessions after password change.
    if (config.invalidateSessions) await config.invalidateSessions();
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('portfolio.sid', {path: '/'});
    res.redirect('/login');
  });
  app.use((req, res, next) => next(fail(404, 'Không tìm thấy trang.')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) log('application_error', {level: 'ERROR', status: 500, code: error.code || 'UNEXPECTED'});
    res.status(status).render('error', {status, message: status === 500 ? 'Có lỗi hệ thống. Kiểm tra log để xử lý.' : error.message});
  });
  return app;
}
