import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import CityPicker from './CityPicker.jsx';
import {nearbyCities,validPoint} from '../city-map.js';
import './city-map.css';
export default function CityMapPicker({value,options,onClose,onConfirm}){
 const initial=options.find(c=>c.value===value),[query,setQuery]=useState(value||''),[selected,setSelected]=useState(initial||null),[nearby,setNearby]=useState([]),[tileError,setTileError]=useState(false);
 const dialog=useRef(null),container=useRef(null),map=useRef(null),marker=useRef(null),id=useId();
 const callbacks=useRef({options});callbacks.current={options};
 function pin(point){
  if(!validPoint(point)){marker.current?.remove();marker.current=null;return;}
  if(marker.current){marker.current.setLatLng(point);return;}
  marker.current=L.marker(point,{draggable:true,keyboard:true,title:'拖动图钉选择附近地点',icon:L.divIcon({className:'city-map-pin',html:'<span></span>',iconSize:[28,36],iconAnchor:[14,34]})}).addTo(map.current);
  marker.current.on('dragend',()=>{const p=marker.current.getLatLng();pickPoint([p.lat,p.lng]);});
 }
 function pickPoint(point){
  point=[point[0],((point[1]+180)%360+360)%360-180];
  const choices=nearbyCities(callbacks.current.options,point);setNearby(choices);setSelected(choices[0]||null);setQuery(choices[0]?.value||'');pin(point);
 }
 function search(value){
  setQuery(value);const city=options.find(c=>c.value===value);setSelected(city||null);setNearby([]);
  if(city&&validPoint(city.coordinates)){pin(city.coordinates);map.current?.setView(city.coordinates,10);}
  else pin(null);
 }
 useEffect(()=>{
  const node=dialog.current,previous=document.activeElement,overflow=document.body.style.overflow;
  node.showModal();document.body.style.overflow='hidden';
  const start=validPoint(initial?.coordinates)?initial.coordinates:[35,105];
  const m=L.map(container.current,{minZoom:2,maxZoom:16,worldCopyJump:true}).setView(start,validPoint(initial?.coordinates)?10:4);map.current=m;
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(m);
  let failures=0;tiles.on('tileerror',()=>{failures++;if(failures>=3)setTileError(true);});tiles.on('tileload',()=>{failures=0;setTileError(false);});
  m.on('click',e=>pickPoint([e.latlng.lat,((e.latlng.lng+180)%360+360)%360-180]));
  if(validPoint(initial?.coordinates))pin(initial.coordinates);
  const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(container.current);
  return()=>{observer.disconnect();m.remove();map.current=null;marker.current=null;node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[]);
 return createPortal(<dialog className="city-map-dialog" ref={dialog} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}}><header className="city-map-header"><div><span>把寄信的起点，放在地图上</span><h2 id={id}>地图选地点</h2></div><button type="button" autoFocus aria-label="关闭地图" onClick={onClose}>×</button></header>
 <div className="city-map-body"><CityPicker value={query} options={options} allowMap={false} onChange={search}/><p className="city-map-help">搜索城市后定位，或拖动地图、点击选点。图钉也可以拖动。</p>
 <div className="city-map-canvas" ref={container} role="region" aria-label="地点选择地图"/>
 {tileError&&<p className="city-map-warning" role="status">地图底图暂时加载失败，可以继续使用上方城市搜索，或稍后重试。</p>}
 {nearby.length>0&&<div className="city-map-nearby"><p>选点附近的城市 / 区县（按城市中心近似匹配）</p>{nearby.map(c=><button type="button" key={c.value} aria-pressed={selected?.value===c.value} onClick={()=>{setSelected(c);setQuery(c.value);}}>{c.label}</button>)}</div>}
 {!selected&&!query&&<p role="status">点击地图选择附近地点；没有匹配项时，也可以搜索城市。</p>}
 <div className="city-map-selection" role="status"><small>将填写到寄信名片</small><strong>{selected?.label||'尚未选择地点'}</strong></div>
 <p className="city-map-privacy">仅保存所选城市 / 区县名称，不保存点击坐标，也不会请求 GPS 定位。地图底图由 OpenStreetMap 提供。</p></div>
 <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="city-map-confirm" disabled={!selected} onClick={()=>onConfirm(selected)}>使用这个地点</button></footer></dialog>,document.body);
}
