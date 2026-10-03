"""Pinned, attributed artwork only. No third-party application code is imported."""
import json, hashlib, urllib.request, pathlib, xml.etree.ElementTree as ET
REV='aac599224bb9780305239607ef98540b7e0ce389'
BASE=f'https://raw.githubusercontent.com/bryllim/workout-guide/{REV}/'
MAPPING={'sentadilla-con-barra':'squat','press-de-banca-con-barra':'bench-press','press-inclinado-con-barra':'incline-bench-press','press-de-banca-con-mancuernas':'dumbbell-bench-press','peso-muerto-rumano':'romanian-deadlift','remo-con-barra':'barbell-row','jalon-al-pecho':'lat-pulldown','hip-thrust-con-barra':'hip-thrust','curl-con-barra':'bicep-curl','elevaciones-laterales':'lateral-raise','plancha-frontal':'plank','flexiones-de-brazos':'push-up'}
manifest=json.load(urllib.request.urlopen(BASE+'packages/workout-guide/manifest.json'))
out=pathlib.Path('apps/web/public/exercise-art');out.mkdir(parents=True,exist_ok=True)
credits=[]
allowed={'svg','g','path','defs','clipPath','rect','circle','ellipse','line','polyline','polygon','title','desc'}
for local,slug in MAPPING.items():
    source=next(e for e in manifest if e['slug']==slug)
    entry={'exerciseId':local,'sourceRevision':REV,'sourceUrl':f'https://github.com/bryllim/workout-guide/tree/{REV}/packages/workout-guide/assets/{slug}','frames':[],'attribution':source['attribution'],'modifications':'None. Original SVG frames displayed as images with optional frame playback.'}
    for frame in source['frames']:
        url=BASE+'packages/workout-guide/'+frame['path'];data=urllib.request.urlopen(url).read()
        if len(data)>2_000_000:raise ValueError('Asset too large')
        root=ET.fromstring(data)
        for node in root.iter():
            if node.tag.split('}')[-1] not in allowed:raise ValueError('Unsupported SVG element '+node.tag)
            for name,value in node.attrib.items():
                if name.lower().startswith('on') or name.split('}')[-1] in ('href','src') or 'javascript:' in value.lower() or ('url(' in value.lower() and 'url(#' not in value.lower()):raise ValueError('Unsafe SVG attribute')
        filename=f'{local}-{frame["index"]}.svg';(out/filename).write_bytes(data)
        entry['frames'].append({'path':'/exercise-art/'+filename,'sha256':hashlib.sha256(data).hexdigest(),'sourceUrl':url,'attribution':frame['attribution'],'width':frame['width'],'height':frame['height']})
    credits.append(entry)
for file in ['LICENSE-ASSETS','ATTRIBUTION.md','LICENSES.md']:
    (out/(file+'.txt')).write_bytes(urllib.request.urlopen(BASE+file).read())
pathlib.Path('packages/domain/src/exercise-art.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2),encoding='utf8')
(out/'credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2),encoding='utf8')
print(f'Imported {len(credits)} exercise illustrations with source, per-frame attribution and SHA256; no remote hotlinks.')
