"""Integration checks against the running Compose stack (no mocks)."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, urllib.request, urllib.parse, urllib.error, http.cookiejar, re, time, base64, subprocess, sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
output=Path(args.output).resolve()
if output==ROOT or ROOT in output.parents: raise SystemExit('Output must be outside repository')
output.parent.mkdir(parents=True,exist_ok=True)
env=dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if line and not line.startswith('#'))
base='http://127.0.0.1:'+env['WEB_PORT'];prom='http://127.0.0.1:'+env['PROMETHEUS_PORT'];graf='http://127.0.0.1:'+env['GRAFANA_PORT']
checks={};opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,form=None):
    try:
        response=opener.open(base+path,urllib.parse.urlencode(form).encode() if form is not None else None,timeout=20)
        return response.status,response.read().decode(),dict(response.headers)
    except urllib.error.HTTPError as e:return e.code,e.read().decode(),dict(e.headers)
def token(html):return re.search(r'name="_csrf" value="([^"]+)"',html).group(1)
def api(url,auth=False):
    headers={}
    if auth:headers['Authorization']='Basic '+base64.b64encode(('admin:'+env['GRAFANA_ADMIN_PASSWORD']).encode()).decode()
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:return json.load(r)
def metric(expr):return api(prom+'/api/v1/query?'+urllib.parse.urlencode({'query':expr}))['data']['result']
def record(name,value=True):checks[name]=value;print('PASS',name)
status,body,headers=request('/');assert status==200 and 'Trần Đặng Công Tâm' in body
assert body.count('class="project-item ')==5
for h,value in [('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY')]:assert headers.get(h)==value
assert 'default-src' in headers['Content-Security-Policy'];record('homepage_five_projects_headers')
assert json.loads(request('/health')[1])['database']=='CONNECTED';record('mysql_health')
assert request('/admin')[0]==403 and request('/login',{'username':'admin','password':'invalid'})[0]==403;record('anonymous_admin_and_csrf_denied')
page=request('/login')[1]
assert request('/login',{'_csrf':token(page),'username':env['ADMIN_USERNAME'],'password':'invalid-login-for-log-only'})[0]==401
page=request('/login')[1]
assert request('/login',{'_csrf':token(page),'username':env['ADMIN_USERNAME'],'password':env['ADMIN_INITIAL_PASSWORD']})[0]==200
assert 'Quản trị Portfolio' in request('/admin')[1];record('admin_login_real_mysql')
page=request('/admin')[1];title='VERIFY temporary '+str(int(time.time()))
assert request('/admin/projects',{'_csrf':token(page),'title':title,'description':'Integration check','stack':'Node.js','link':''})[0]==200
page=request('/admin')[1]
id=re.search(r'<tr><td>(\d+)</td><td>'+re.escape(title),page).group(1)
assert title in request('/projects/'+id)[1]
assert request('/admin/projects/'+id+'/edit',{'_csrf':token(page),'title':title+' edited','description':'Persisted in MySQL','stack':'Express','link':'https://github.com/tamtran2k6zz/Portfolio_Tam2k6'})[0]==200
assert title+' edited' in request('/projects/'+id)[1]
page=request('/admin')[1]
assert request('/admin/projects/'+id+'/delete',{'_csrf':token(page)})[0]==200
assert request('/projects/'+id)[0]==404;record('real_crud_and_cleanup')
for i in range(25):assert request('/')[0]==200
for i in range(3):assert request('/verify-not-found-'+str(i))[0]==404
page=request('/admin')[1];assert request('/logout',{'_csrf':token(page)})[0]==200
assert request('/admin')[0]==403;record('logout_revokes_access')
targets=api(prom+'/api/v1/targets')['data']['activeTargets']
assert len(targets)==4 and all(t['health']=='up' for t in targets)
record('four_prometheus_targets_up',[{'job':t['labels']['job'],'health':t['health']} for t in targets])
for expr in ['nginx_up','mysql_up']:
    rows=metric(expr);assert rows and rows[0]['value'][1]=='1'
record('nginx_and_mysql_service_metrics')
rows=metric('count(container_memory_working_set_bytes{container_label_com_docker_compose_project="portfolio-tam2k6",image!=""})');assert rows and float(rows[0]['value'][1])>=9
record('container_metrics_count',float(rows[0]['value'][1]))
assert api(graf+'/api/dashboards/uid/portfolio',True)['dashboard']['uid']=='portfolio'
assert api(graf+'/api/datasources/uid/loki/health',True)['status']=='OK';record('grafana_dashboard_and_loki_health')
queries=['{job="nginx"}','{job="nginx"} | json | status >= 400','{job="app"} | json | event="login_failed"']
for query in queries:
    count=0
    for attempt in range(8):
        end=time.time_ns();params=urllib.parse.urlencode({'query':query,'start':end-15*60*10**9,'end':end,'limit':100})
        data=api(graf+'/api/datasources/proxy/uid/loki/loki/api/v1/query_range?'+params,True)
        count=sum(len(s['values']) for s in data['data']['result'])
        if count:break
        time.sleep(3)
    assert count>0,query
    record('LogQL '+query,count)
ids=subprocess.check_output(['docker','compose','ps','-q'],cwd=ROOT).decode().split()
containers=json.loads(subprocess.check_output(['docker','inspect',*ids],cwd=ROOT))
state=[{'name':c['Name'].lstrip('/'),'user':c['Config']['User'] or 'root(default)','read_only':c['HostConfig']['ReadonlyRootfs'],'privileged':c['HostConfig']['Privileged'],'cap_drop':c['HostConfig']['CapDrop'],'security_opt':c['HostConfig']['SecurityOpt'],'networks':list(c['NetworkSettings']['Networks']),'published':c['HostConfig']['PortBindings']} for c in containers]
assert next(c for c in state if c['name'].endswith('-app-1'))['read_only']
assert not next(c for c in state if c['name'].endswith('-mysql-1'))['published']
record('hardening_inspected',state)
checks['completed_at']=datetime.now(timezone.utc).isoformat();output.write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print('Integration checks saved outside repository.')
