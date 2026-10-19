export const normalizeCityQuery=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s/·'’-]/g,'');
export function searchCities(options,query,limit=40){
 const q=normalizeCityQuery(query);if(!q)return options.slice(0,limit);
 return options.map((city,index)=>{
  const name=normalizeCityQuery(city.value),label=normalizeCityQuery(city.label),search=city.search||'';
  const score=name===q||city.romanized===q||city.initials===q?0:name.startsWith(q)?1:label.includes(q)?2:search.includes(q)?3:-1;
  return {city,index,score};
 }).filter(x=>x.score>=0).sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,limit).map(x=>x.city);
}
