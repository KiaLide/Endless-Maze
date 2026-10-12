"""把 web/ 整理成 Artifact 發布用的頁面（.artifact/index.html），並輸出附檔對照表"""
import os, json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
WEB = os.path.join(ROOT, 'web'); OUT = os.path.join(ROOT, '.artifact')
os.makedirs(OUT, exist_ok=True)
s = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
body = s[s.index('<body>') + 6:s.index('</body>')]
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(
    '<title>Endless Maze</title>\n<meta name="theme-color" content="#0d0b14">\n<link rel="stylesheet" href="style.css">\n' + body)
files = {}
for root, _, fs in os.walk(WEB):
    for f in fs:
        rel = os.path.relpath(os.path.join(root, f), WEB)
        if rel != 'index.html': files[rel] = os.path.abspath(os.path.join(root, f))
print(json.dumps(files, ensure_ascii=False))
