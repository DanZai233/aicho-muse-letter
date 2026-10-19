import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {searchCities} from '../city-search.js';
import './city-picker.css';
export default function CityPicker({value,onChange,options=[]}){
 const id=useId(),[query,setQuery]=useState(value||''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),list=useRef(null);
 useEffect(()=>{setQuery(value||'');},[value]);
 const results=useMemo(()=>searchCities(options,query,40),[options,query]);
 const selected=options.find(c=>c.value===value);
 function choose(city){onChange(city.value);setQuery(city.value);setOpen(false);setActive(-1);}
 useEffect(()=>{if(active>=0)list.current?.children[active]?.scrollIntoView({block:'nearest'});},[active]);
 function keydown(e){
  if(e.key==='Escape'){setOpen(false);setActive(-1);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))));}
  if(e.key==='Enter'&&open){e.preventDefault();if(results[active])choose(results[active]);else{setOpen(false);setActive(-1);}}
 }
 return <div className="city-picker"><label htmlFor={id}>寄信城市</label><div className="city-picker-input"><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-options'} aria-activedescendant={open&&active>=0&&results[active]?id+'-'+active:undefined} aria-describedby={id+'-hint'} autoComplete="off" maxLength={60} value={query} placeholder="搜索城市 / 区县、拼音或首字母" onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={keydown} onChange={e=>{setQuery(e.target.value);onChange(e.target.value);setActive(-1);setOpen(true);}}/>{value&&<button type="button" aria-label="清空寄信城市" onClick={()=>{onChange('');setQuery('');setOpen(false);}}>×</button>}</div>
 {open&&<div className="city-picker-popover"><p role="status">{query?'搜索结果':'常用城市 · 输入名称可搜索全国区县'}{results.length===40?'（显示前 40 项，请继续输入）':''}</p><div id={id+'-options'} role="listbox" aria-label="城市搜索结果" ref={list}>{results.map((city,i)=><button id={id+'-'+i} key={city.value} type="button" role="option" tabIndex={-1} aria-selected={active===i} className={active===i?'is-highlighted':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(city)}>{city.label}{city.value===value&&<span aria-hidden="true"> ✓</span>}</button>)}</div>{!results.length&&<p>没有找到？可直接保留手动输入的地点，使用默认邮程。</p>}</div>}
 <p id={id+'-hint'} className="paper-muted">{selected?selected.label+' · '+(selected.has_coordinates?'按约数距离计算邮程':'默认 24 小时邮程'):value?'手动填写的地点 · 默认 24 小时邮程':'可留空，默认 24 小时邮程。支持中文、拼音、首字母；可手动填写海外城市。'}</p></div>;
}
