import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { DATA_DIR } from './db.js';
import { fail } from './paper.js';
const root=path.join(DATA_DIR,'paper-images');
const valid=id=>/^[0-9a-f-]{36}$/.test(id||'');
export async function imageOwner(id){
 if(!valid(id))return null;
 return fs.readFile(path.join(root,id+'.json'),'utf8').then(JSON.parse).then(x=>x.owner).catch(()=>null);
}
export function imagePath(id){return path.join(root,id+'.webp');}
export async function storeImage(owner,buffer){
 if(!Buffer.isBuffer(buffer)||!buffer.length)fail('请选择 JPG、PNG 或 WebP 图片');
 await fs.mkdir(root,{recursive:true});
 const entries=await fs.readdir(root);let count=0;
 for(const name of entries.filter(x=>x.endsWith('.json')))if(await imageOwner(name.slice(0,-5))===owner)count++;
 if(count>=100)fail('已达到 100 张明信片图片的保存上限');
 let output;
 try{
  const image=sharp(buffer,{limitInputPixels:20000000,animated:false});
  const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))fail('仅支持 JPG、PNG、WebP 图片');
  output=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
 }catch{fail('图片无法读取，请上传 JPG、PNG 或 WebP，最多 2000 万像素');}
 const id=crypto.randomUUID();await fs.writeFile(imagePath(id),output,{flag:'wx'});
 try{await fs.writeFile(path.join(root,id+'.json'),JSON.stringify({owner}),{flag:'wx'});}catch(e){await fs.unlink(imagePath(id));throw e;}
 return id;
}
