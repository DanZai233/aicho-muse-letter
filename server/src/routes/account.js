import { Router } from 'express';
import { museAccount } from '../muse.js';
const router=Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.post('/exchange',wrap(async(req,res)=>{const {code,verifier,target}=req.body||{};if(!['paper','letter'].includes(target))return res.status(400).json({code:40001,message:'目标无效'});res.set('Cache-Control','no-store').json({code:0,data:await museAccount('/bridge/exchange',{body:{code,verifier,target}})});}));
router.post('/bridge',wrap(async(req,res)=>{res.set('Cache-Control','no-store').json({code:0,data:await museAccount('/bridge',{token:String(req.headers.authorization||'').replace(/^Bearer /,''),body:{target:'muse',challenge:req.body?.challenge}})});}));
router.get('/me',wrap(async(req,res)=>res.set('Cache-Control','no-store').json({code:0,data:await museAccount('/me',{token:String(req.headers.authorization||'').replace(/^Bearer /,'')})})));
export default router;
