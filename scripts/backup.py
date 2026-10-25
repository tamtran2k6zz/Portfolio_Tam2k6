"""Back up the current DB, optionally verify restore in a NEW separate DB."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, subprocess, json, sys
if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, help='Backup folder outside the repository')
parser.add_argument('--verify-restore', action='store_true')
args = parser.parse_args()
folder = Path(args.output).resolve()
if folder == ROOT or ROOT in folder.parents:
    raise SystemExit('Choose an output folder outside the repository')
folder.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = folder / ('portfolio_' + stamp + '.sql')
base = ['docker','compose','exec','-T','mysql','sh','-c']
with backup.open('wb') as stream:
    subprocess.run(base + ['MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 portfolio'], cwd=ROOT, stdout=stream, check=True)
print('Backup:', backup)
if args.verify_restore:
    name = 'portfolio_restore_' + stamp
    def sql(query):
        return subprocess.check_output(base + ['MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N --default-character-set=utf8mb4 -e "$1"','sh',query], cwd=ROOT).decode('utf-8').strip()
    sql('CREATE DATABASE ' + name + ' CHARACTER SET utf8mb4;')
    with backup.open('rb') as stream:
        subprocess.run(base + ['MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 ' + name], cwd=ROOT, stdin=stream, check=True)
    result = {}
    for table in ['profiles','projects','skills','users']:
        source = sql('CHECKSUM TABLE portfolio.' + table).split('\t')[-1]
        restored = sql('CHECKSUM TABLE ' + name + '.' + table).split('\t')[-1]
        assert source == restored and source not in ('NULL',''), table + ' checksum mismatch'
        result[table] = {'source':source,'restore':restored,'match':True}
    (folder / ('restore_' + stamp + '.json')).write_text(json.dumps({'database':name,'checksums':result},indent=2),encoding='utf-8')
    print('Restore verified in separate database:', name)
