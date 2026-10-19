"""Refresh pinned, attributed GitHub city data. No runtime external dependency."""
import json, pathlib, urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
pins=json.loads((root/'scripts/city-sources.json').read_text())
def get(repo,pin,file):
    with urllib.request.urlopen(f'https://raw.githubusercontent.com/{repo}/{pin}/{file}',timeout=30) as response:
        return json.load(response)
admin=get('modood/Administrative-divisions-of-China',pins['administrative'],'dist/pca-code.json')
hmt=get('modood/Administrative-divisions-of-China',pins['administrative'],'dist/HK-MO-TW.json')
geo=get('88250/city-geo',pins['geo'],'data.json')
coordinates={}
for x in geo:
    try: coord=[round(float(x['lat']),5),round(float(x['lng']),5)]
    except (ValueError,TypeError): continue
    if -90<=coord[0]<=90 and -180<=coord[1]<=180:
        coordinates[(x['province'],x['city'],x['area'])]=coord
records=[]
def add(value,label,coord): records.append({'value':value,'label':label,'coordinates':coord})
for province in admin:
    pn=province['name']
    for city in province['children']:
        cn=city['name']
        municipality=province['code'] in ['11','12','31','50']
        direct='直辖县级行政' in cn
        parent=coordinates.get((pn,cn,''))
        if not direct:
            name=pn.removesuffix('市') if municipality else cn.removesuffix('市')
            if not any(r['value']==name for r in records):add(name,pn if municipality else pn+' / '+cn,parent)
        for area in city['children']:
            an=area['name']
            if an in ['市辖区','县']:continue
            label=' / '.join([pn,an] if municipality or direct else [pn,cn,an])
            # Parent coordinates are sufficient for approximate slow-mail distance bands.
            coord=coordinates.get((pn,cn,an)) or parent
            add(label,label,coord)
for province,cities in hmt.items():
    region={'香港特别行政区':'香港','澳门特别行政区':'澳门','台湾省':'台湾'}[province]
    if region!='台湾':add(region,province,{'香港':[22.3,114.2],'澳门':[22.2,113.5]}[region])
    for city,areas in cities.items():
        if region=='台湾':add(city.removesuffix('市'),province+' / '+city,None)
        for area in areas:
            label=' / '.join([region,city,area])
            add(label,label,{'香港':[22.3,114.2],'澳门':[22.2,113.5]}.get(region))
values=[r['value'] for r in records]
assert len(values)==len(set(values)), 'Ambiguous values in source data'
(root/'server/src/city-data.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Wrote {len(records)} locations, {sum(r["coordinates"] is not None for r in records)} with coordinates')
