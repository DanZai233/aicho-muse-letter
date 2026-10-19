import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_OPTIONS,CITIES} from '../src/cities.js';
import {distance,travelHours} from '../src/paper.js';
import {searchCities} from '../../web/src/city-search.js';
test('nationwide city and county data has unique choices and supports Chinese, pinyin and initials',()=>{
 assert.ok(CITY_OPTIONS.length>3300);
 assert.equal(new Set(CITY_OPTIONS.map(c=>c.value)).size,CITY_OPTIONS.length);
 for(const name of ['苏州','泉州','大理白族自治州','天津','澳门','台北','东京'])assert.ok(CITY_OPTIONS.some(c=>c.value===name),name);
 assert.ok(searchCities(CITY_OPTIONS,'苏州').some(c=>c.value==='苏州'));
 assert.ok(searchCities(CITY_OPTIONS,'suzhou').some(c=>c.value==='苏州'));
 assert.ok(searchCities(CITY_OPTIONS,'sz').some(c=>c.value==='苏州'));
 const nanshan=searchCities(CITY_OPTIONS,'南山区');assert.ok(nanshan.some(c=>c.label.includes('深圳市')));assert.ok(nanshan.every(c=>c.label.includes('/')));
 assert.ok(searchCities(CITY_OPTIONS,'广东深圳南山').some(c=>c.label==='广东省 / 深圳市 / 南山区'));
 assert.equal(searchCities(CITY_OPTIONS,'zzzz不存在').length,0);assert.equal(searchCities(CITY_OPTIONS,'').length,40);
 for(const xy of Object.values(CITIES)){assert.ok(Math.abs(xy[0])<=90);assert.ok(Math.abs(xy[1])<=180);}
 assert.ok(distance('苏州','上海')<150);assert.equal(travelHours(distance('苏州','上海')),8);
 assert.equal(distance('苏州市','上海'),distance('苏州','上海'));
 assert.equal(distance('未知城市','上海'),null);
 assert.ok(distance('广东省 / 深圳市 / 南山区','北京')>1500);
});
