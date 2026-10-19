// A postal day follows the product's China time, regardless of the server timezone.
const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export const postalDay=value=>calendar.format(new Date(value));
export function mailAllowance(s,who,now=Date.now()) {
 const today=postalDay(now);
 const received=s.routes.filter(r=>r.initiator!==who&&r.members.includes(who)).flatMap(r=>{
  const initial=s.letters.find(l=>l.id===r.initial_letter_id)||s.letters.filter(l=>l.route_id===r.id&&l.from===r.initiator&&l.to===who).sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at))[0];
  const at=initial?.received_at||r.created_at||initial?.sent_at;
  return initial&&at&&Number.isFinite(Date.parse(at))&&postalDay(at)===today?[{letter:initial,at}]:[];
 }).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const count=received.length;
 const replied=count>0&&s.letters.some(l=>l.route_id===received[0].letter.route_id&&l.from===who);
 const allowed=count===0||(count===1&&replied);
 return {day:today,timezone:'Asia/Shanghai',received:count,limit:2,allowed,needs_reply:count===1&&!replied,
  reason:count>=2?'今天已经领取两封匿名信，明天再来相逢吧。':count===1&&!replied?'回复今天领取的第一封匿名信后，才能再领取第二封。':''};
}
