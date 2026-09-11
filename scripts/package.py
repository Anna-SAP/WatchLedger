from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
target=root/'dist'/'WatchLedger-0.1.1.zip'
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file() and p.name != '.watchledger-local.json' and not any(x in p.relative_to(root).parts for x in ('__pycache__','.git','work','dist','node_modules')) and p.suffix not in ('.pyc','.sqlite3'):
            z.write(p,Path('WatchLedger')/p.relative_to(root))
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert 'WatchLedger/neo/manifest.json' in z.namelist()
    assert 'WatchLedger/firefox/manifest.json' in z.namelist()
    print(f'ZIP verified: {len(z.namelist())} files, {target.stat().st_size} bytes')
