// Network location is a suggestion only; no GPS permission or precise location is requested.
export async function suggestCity(cities,signal) {
 let d;
 for(const url of ['https://ipwho.is/','https://ipapi.co/json/']){
  try{
   const r=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(3000)]),referrerPolicy:'no-referrer'});
   if(!r.ok)continue;const result=await r.json();
   if(!result.error&&result.success!==false&&result.city){d=result;break;}
  }catch{if(signal?.aborted)break;}
 }
 if(!d)throw new Error('暂时无法识别网络城市，请手动选择；留空使用默认邮程。');
 const aliases={Beijing:'北京',Shanghai:'上海',Guangzhou:'广州',Shenzhen:'深圳',Hangzhou:'杭州',Chengdu:'成都',Chongqing:'重庆',Wuhan:'武汉',Nanjing:'南京',"Xi’an":'西安',"Xi'an":'西安',Xian:'西安',Changsha:'长沙',Xiamen:'厦门',Kunming:'昆明',Harbin:'哈尔滨',Urumqi:'乌鲁木齐',Taipei:'台北','Hong Kong':'香港',Tokyo:'东京',Singapore:'新加坡',London:'伦敦',Paris:'巴黎','New York':'纽约',Sydney:'悉尼','Los Angeles':'洛杉矶'};
 const normalized=String(d.city).normalize('NFD').replace(/[\u0300-\u036f\s’']/g,'').toLowerCase();
 const known=cities.filter(c=>typeof c==='object'&&!c.value.includes('/')&&c.romanized===normalized);
 const city=aliases[d.city]||(known.length===1?known[0].value:String(d.city).replace(/市$/,''));
 return city.slice(0,60);
}
