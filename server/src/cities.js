import fs from 'node:fs';
import {pinyin} from 'pinyin-pro';
const LEGACY_CITIES = {
  '北京': [39.9,116.4], '上海': [31.2,121.5], '广州': [23.1,113.3], '深圳': [22.5,114.1],
  '杭州': [30.3,120.2], '成都': [30.6,104.1], '重庆': [29.6,106.6], '武汉': [30.6,114.3],
  '南京': [32.1,118.8], '西安': [34.3,108.9], '长沙': [28.2,112.9], '厦门': [24.5,118.1],
  '昆明': [25,102.7], '哈尔滨': [45.8,126.5], '乌鲁木齐': [43.8,87.6], '台北': [25,121.6],
  '香港': [22.3,114.2], '东京': [35.7,139.7], '新加坡': [1.4,103.8], '伦敦': [51.5,-.1],
  '巴黎': [48.9,2.4], '纽约': [40.7,-74], '悉尼': [-33.9,151.2], '洛杉矶': [34.1,-118.2],
};
const records=JSON.parse(fs.readFileSync(new URL('./city-data.json',import.meta.url),'utf8'));
export const CITIES={...Object.fromEntries(records.filter(c=>c.coordinates).map(c=>[c.value,c.coordinates])),...LEGACY_CITIES};
const legacy=Object.keys(LEGACY_CITIES).map(value=>({value,label:records.find(c=>c.value===value)?.label||value,coordinates:LEGACY_CITIES[value]}));
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s/·'’-]/g,'');
export const CITY_OPTIONS=[...legacy,...records.filter(c=>!Object.hasOwn(LEGACY_CITIES,c.value))].map(c=>({value:c.value,label:c.label,has_coordinates:Object.hasOwn(CITIES,c.value),coordinates:CITIES[c.value]||null,romanized:normalize(pinyin(c.value,{toneType:'none'})),initials:normalize(pinyin(c.value,{pattern:'first',toneType:'none'})),search:normalize(c.label+' '+c.label.replace(/特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市|区|县/g,'')+' '+pinyin(c.label,{toneType:'none'})+' '+pinyin(c.label,{pattern:'first',toneType:'none'}))}));
export const CITY_NAMES=CITY_OPTIONS.map(c=>c.value);
export function resolveCity(name){
 const value=String(name||'').trim();
 if(Object.hasOwn(CITIES,value))return CITIES[value];
 const short=value.replace(/市$/,'');
 return Object.hasOwn(CITIES,short)?CITIES[short]:null;
}
