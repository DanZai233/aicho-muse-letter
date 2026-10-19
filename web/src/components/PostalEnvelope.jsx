import './postal.css';
export const envelopeNames={linen:'原色亚麻',sage:'山野鼠尾草',rose:'落日玫瑰',midnight:'午夜蓝调'};
export const stampNames={moon:'月亮邮票',leaf:'一片叶子',bird:'飞鸟邮票',star:'星光邮票'};
export const pictureNames={mountains:'山间来信',sea:'海边的慢日子',window:'窗边的一杯茶',flowers:'把春天寄给你'};
export const stampMarks={moon:'☾',leaf:'❧',bird:'♧',star:'✦'};
export const places=['晚风邮局','月亮街七号','云边小站','山海之间','春日巷口','星光码头'];
export function randomAddress(){return {place:places[Math.floor(Math.random()*places.length)],postcode:String(Math.floor(Math.random()*1000000)).padStart(6,'0')};}
export function newWrapping(){return {envelope:'linen',stamp:'moon',picture:'',card:'',...randomAddress()};}
export function PostalEnvelope({wrapping,from='远方的朋友',to='尚未相识的你',sealed=false,opening=false,onOpen,disabled=false}){
 const w=wrapping||{envelope:'linen',stamp:'moon',place:'远方邮局',postcode:'000000'};
 return <div className={'postal-envelope postal-'+w.envelope+(opening?' is-opening':'')+(sealed?' is-sealed':'')}>
  <div className="postal-flap" aria-hidden="true"/>
  <div className="postal-envelope-face"><div className="postal-topline"><span className="postal-code" aria-label={'纪念邮编 '+w.postcode}>{w.postcode}</span><span className="postal-stamp"><span aria-hidden="true">{stampMarks[w.stamp]||'☾'}</span><small>纸上逢</small></span></div>
  <div className="postal-address"><small>{w.place} · 心意寄所</small><strong>致 {to}</strong><span>{from} 寄</span></div><div className="postal-postmark" aria-hidden="true">纸上逢<br/>慢慢抵达</div>
  <p className="postal-fiction">纪念邮编与寄所为虚构装饰，不是实际地址</p>
  {onOpen&&<button className="postal-open" disabled={disabled||opening} onClick={onOpen}>{opening?'正在拆开…':'拆开这封信'}<span aria-hidden="true"> ↗</span></button>}</div>
 </div>;
}
export function PostalKeepsakes({wrapping}){
 if(!wrapping?.card&&!wrapping?.picture)return null;
 return <aside className="postal-keepsakes" aria-label="随信心意">{wrapping.picture&&pictureNames[wrapping.picture]&&<figure><img src={'/postcards/'+wrapping.picture+'.svg'} alt={pictureNames[wrapping.picture]}/><figcaption>{pictureNames[wrapping.picture]} · 随信明信片</figcaption></figure>}{wrapping.card&&<blockquote><span aria-hidden="true">❧</span><p>{wrapping.card}</p><small>夹在信里的一句祝福</small></blockquote>}</aside>;
}
export function PostalPacking({value,onChange,cards=[],name='远方的朋友',to}){
 return <section className="postal-packing"><div className="postal-section-title"><span>02 / 装好心意</span><h3>给这封信，选一件外衣。</h3></div>
 <fieldset><legend>信封样式</legend><div className="postal-choices">{Object.entries(envelopeNames).map(([id,label])=><button type="button" key={id} aria-pressed={value.envelope===id} onClick={()=>onChange({...value,envelope:id})}><i className={'postal-swatch postal-'+id}/>{label}</button>)}</div></fieldset>
 <fieldset><legend>贴一枚邮票</legend><div className="postal-choices">{Object.entries(stampNames).map(([id,label])=><button type="button" key={id} aria-pressed={value.stamp===id} onClick={()=>onChange({...value,stamp:id})}><span aria-hidden="true">{stampMarks[id]}</span> {label}</button>)}</div></fieldset>
 <div className="postal-destination"><div><small>纪念寄所 · 与真实城市无关</small><p>{value.place} / {value.postcode}</p></div><button type="button" onClick={()=>onChange({...value,...randomAddress()})}>↻ 换一个寄所</button></div>
 <fieldset><legend>夹一张祝福卡</legend><select aria-label="祝福卡" value={value.card} onChange={e=>onChange({...value,card:e.target.value})}><option value="">这次只寄文字</option>{cards.filter(Boolean).map(c=><option key={c}>{c}</option>)}</select></fieldset>
 <fieldset><legend>附一张明信片</legend><div className="postal-picture-choices"><button type="button" aria-pressed={!value.picture} onClick={()=>onChange({...value,picture:''})}>不附图片</button>{Object.entries(pictureNames).map(([id,label])=><button type="button" key={id} aria-pressed={value.picture===id} onClick={()=>onChange({...value,picture:id})}><img src={'/postcards/'+id+'.svg'} alt=""/><span>{label}</span></button>)}</div></fieldset>
 <PostalEnvelope wrapping={value} from={name} to={to}/><PostalKeepsakes wrapping={value}/>
 </section>;
}
