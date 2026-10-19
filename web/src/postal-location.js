// Network location is a suggestion only; no GPS permission or precise location is requested.
export async function suggestCity(cities,signal) {
 const r=await fetch('https://ipapi.co/json/',{signal,referrerPolicy:'no-referrer'});
 if(!r.ok)throw new Error('网络位置暂时不可用，请手动选择城市。');
 const d=await r.json();if(d.error||!d.city)throw new Error('未能识别当前城市，请手动选择。');
 const aliases={Beijing:'北京',Shanghai:'上海',Guangzhou:'广州',Shenzhen:'深圳',Hangzhou:'杭州',Chengdu:'成都',Chongqing:'重庆',Wuhan:'武汉',Nanjing:'南京',"Xi’an":'西安',"Xi'an":'西安',Xian:'西安',Changsha:'长沙',Xiamen:'厦门',Kunming:'昆明',Harbin:'哈尔滨',Urumqi:'乌鲁木齐',Taipei:'台北','Hong Kong':'香港',Tokyo:'东京',Singapore:'新加坡',London:'伦敦',Paris:'巴黎','New York':'纽约',Sydney:'悉尼','Los Angeles':'洛杉矶'};
 const city=aliases[d.city]||String(d.city).replace(/市$/,'');
 return city.slice(0,60);
}
