// Approximate city-centre matching, never a street-address reverse geocoder.
export function validPoint(point){return Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;}
export function pointDistance(a,b){
 const rad=n=>n*Math.PI/180,lat=rad(b[0]-a[0]),lng=rad(b[1]-a[1]);
 const h=Math.sin(lat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(lng/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function nearbyCities(options,point,{limit=5,maxKm=150}={}){
 if(!validPoint(point))return [];
 return options.filter(c=>validPoint(c.coordinates)).map(city=>({city,km:pointDistance(point,city.coordinates)})).filter(x=>x.km<=maxKm)
 .sort((a,b)=>a.km-b.km||a.city.value.length-b.city.value.length).slice(0,limit).map(x=>x.city);
}
