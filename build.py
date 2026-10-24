import subprocess,sys
b=subprocess.run(['npx','esbuild','src/app.js','--bundle','--format=iife','--minify','--legal-comments=none','--target=es2020'],capture_output=True,text=True,cwd='/workspace/hypercar')
if b.returncode: print(b.stderr); raise SystemExit(1)
js=b.stdout
assert '</script' not in js.lower(), 'script tag in bundle'
t=open('/workspace/hypercar/src/template.html').read()
for k in ['style.css','hud.html']:
    pass
t=t.replace('__BUNDLE__',js)
open('/workspace/hypercar/hypercar.html','w').write(t)
print('ok',len(t))
