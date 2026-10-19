import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_OPTIONS} from '../src/cities.js';
import {nearbyCities,pointDistance,validPoint} from '../../web/src/city-map.js';
test('map points resolve to nearby supported cities without inventing remote locations',()=>{
 const suzhou=CITY_OPTIONS.find(c=>c.value==='苏州');
 assert.ok(validPoint(suzhou.coordinates));
 assert.equal(nearbyCities(CITY_OPTIONS,suzhou.coordinates)[0].value,'苏州');
 const nanshan=CITY_OPTIONS.find(c=>c.value==='广东省 / 深圳市 / 南山区');
 assert.ok(nearbyCities(CITY_OPTIONS,nanshan.coordinates).some(c=>c.value===nanshan.value));
 assert.equal(nearbyCities(CITY_OPTIONS,[0,-140]).length,0);
 for(const point of [null,[NaN,0],[91,0],[0,181],['30',120]])assert.deepEqual(nearbyCities(CITY_OPTIONS,point),[]);
 assert.equal(nearbyCities([{value:'unknown',coordinates:null}],[30,120]).length,0);
 assert.ok(pointDistance([0,179.9],[0,-179.9])<25);
 assert.ok(CITY_OPTIONS.filter(c=>c.has_coordinates).every(c=>validPoint(c.coordinates)));
});
