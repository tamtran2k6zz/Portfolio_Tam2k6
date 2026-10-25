import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import {createApplication} from '../src/app.js';
import {hashPassword} from '../src/security.js';

async function fixture(t) {
  const password='Demo-password-long-123';
  const events=[];
  let projects=[{id:1,title:'First',description:'Description',stack:'Node',link:''}];
  const repo={
    ping:async()=>{}, findUser:async name=>name==='admin'?{id:1,username:'admin',password_hash:hash}:null,
    profile:async()=>({full_name:'Student',headline:'Security',bio:'Bio',email:'a@example.com',github_url:''}),
    projects:async()=>projects,skills:async()=>[],project:async id=>projects.find(p=>p.id===id),
    createProject:async value=>{const id=projects.length+1;projects.push({id,...value});return {insertId:id};},
    updateProject:async(id,value)=>{projects=projects.map(p=>p.id===id?{id,...value}:p);},
    deleteProject:async id=>{projects=projects.filter(p=>p.id!==id);}
  };
  const hash=hashPassword(password);
  // This test-only store/repository isolates HTTP controls. Production uses MySQL.
  const store=new session.MemoryStore();
  const app=createApplication({repo,sessionStore:store,config:{sessionSecret:'a'.repeat(64),secure:false,loginLimit:5},log:(event,fields)=>events.push({event,...fields})});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  async function request(path,values) {
    const headers={}; if(cookie)headers.cookie=cookie;
    if(values)headers['Content-Type']='application/x-www-form-urlencoded';
    const response=await fetch(base+path,{method:values?'POST':'GET',headers,body:values?new URLSearchParams(values):undefined,redirect:'manual'});
    const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    return {status:response.status,body:await response.text(),headers:response.headers};
  }
  const token=response=>response.body.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  async function login(){const page=await request('/login');return request('/login',{_csrf:token(page),username:'admin',password});}
  return {request,token,login,events,password};
}

test('anonymous admin access, headers, missing route and CSRF rejection',async t=>{
  const f=await fixture(t);
  const home=await f.request('/');assert.equal(home.status,200);
  assert.equal(home.headers.get('x-content-type-options'),'nosniff');
  assert.match(home.headers.get('content-security-policy'),/default-src 'self'/);
  assert.equal((await f.request('/admin')).status,403);
  assert.equal((await f.request('/missing')).status,404);
  assert.equal((await f.request('/login',{username:'admin',password:f.password})).status,403);
  assert.ok(f.events.some(e=>e.event==='csrf_denied'));
});
test('authenticated CRUD persists through repository and escapes stored XSS',async t=>{
  const f=await fixture(t);assert.equal((await f.login()).status,302);
  let page=await f.request('/admin');
  const payload='<script>alert(1)</script>';
  assert.equal((await f.request('/admin/projects',{_csrf:f.token(page),title:payload,description:payload,stack:'Node',link:''})).status,302);
  const home=await f.request('/');assert.match(home.body,/&lt;script&gt;/);assert.ok(!home.body.includes(payload));
  page=await f.request('/admin');
  assert.equal((await f.request('/admin/projects/2/edit',{_csrf:f.token(page),title:'Updated',description:'Changed',stack:'MySQL',link:'https://example.com'})).status,302);
  assert.match((await f.request('/projects/2')).body,/Updated/);
  assert.equal((await f.request('/admin/projects/2/delete',{_csrf:f.token(page)})).status,302);
  assert.equal((await f.request('/projects/2')).status,404);
});
test('bad URL/empty fields rejected and login failure threshold enforced',async t=>{
  const f=await fixture(t);
  const first=await f.request('/login');const csrf=f.token(first);
  for(let i=0;i<5;i++) assert.equal((await f.request('/login',{_csrf:csrf,username:'admin',password:'wrong'})).status,401);
  assert.equal((await f.request('/login',{_csrf:csrf,username:'admin',password:'wrong'})).status,429);
  assert.ok(f.events.some(e=>e.event==='login_rate_limited'));
});
test('validation and session invalidation after logout',async t=>{
  const f=await fixture(t);await f.login();const page=await f.request('/admin');const csrf=f.token(page);
  assert.equal((await f.request('/admin/projects',{_csrf:csrf,title:'Title',description:'Desc',stack:'Node',link:'javascript:alert(1)'})).status,400);
  assert.equal((await f.request('/admin/projects',{_csrf:csrf,title:'',description:'Desc',stack:'Node',link:''})).status,400);
  assert.equal((await f.request('/logout',{_csrf:csrf})).status,302);
  assert.equal((await f.request('/admin')).status,403);
});
