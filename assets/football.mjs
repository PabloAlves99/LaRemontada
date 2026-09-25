export const criteria=['Físico','Ataque','Defesa','Habilidade','Toque'];
export const descriptions=['Fôlego e intensidade durante o jogo.','Finalização e posicionamento ofensivo.','Marcação e recuperação da bola.','Domínio, drible e controle em espaços curtos.','Passe, tabelas e circulação da bola.'];
export const grades=['Muito ruim','Ruim','Regular','Bom','Muito bom'];
export const positions=['Fixo (zagueiro)','Ala','Meio','Pivô'];
export const mean=a=>a?.length?a.reduce((s,n)=>s+n,0)/a.length:null;
export function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function nextTuesday(){const d=new Date();d.setDate(d.getDate()+(2-d.getDay()+7)%7);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function strength(t){return mean(t.filter(p=>p.scores).map(p=>mean(p.scores)));}
export function normalizeRules(r={}){
 return {distribution:'balanced',weak:2,history:6,useRating:true,useCriteria:true,usePosition:r.separatePivot??true,separateWeak:true,useHistory:true,avoidSameTeam:true,...r};
}
export function warnings(teams,settings){
 const r=normalizeRules(settings),out=[];
 if(r.distribution==='random')return ['Sorteio aleatório: as preferências de equilíbrio e histórico não foram aplicadas.'];
 teams.forEach((t,i)=>{
  const rated=t.filter(p=>p.scores);
  if(r.separateWeak&&rated.filter(p=>mean(p.scores)<=r.weak).length>1)out.push('Time '+(i+1)+': mais de um jogador na faixa até '+r.weak+'.');
 });
 if(r.usePosition)for(const pos of positions){
  const counts=teams.map(t=>t.filter(p=>p.scores&&p.position===pos).length);
  if(Math.max(...counts)-Math.min(...counts)>1)out.push(pos+': distribuição desigual entre os times.');
 }
 if(teams.flat().some(p=>!p.scores))out.push('Equilíbrio parcial: jogadores sem nota entraram aleatoriamente.');
 return out;
}
export function draw(players,history=[],settings={}){
 const rules=normalizeRules(settings);
 if(players.length>18)throw Error('Selecione no máximo 18 jogadores.');
 if(new Set(players.map(p=>p.id)).size!==players.length)throw Error('Há jogadores duplicados.');
 const all=players.map(p=>({...p}));
 for(let i=players.length;i<18;i++)all.push({id:crypto.randomUUID(),name:'Convidado '+(i-players.length+1),position:'',guest:true,scores:null,count:0});
 if(rules.distribution==='random'){const list=shuffle(all);return [list.slice(0,6),list.slice(6,12),list.slice(12,18)];}
 const unknown=shuffle(all.filter(p=>!p.scores)),rated=all.filter(p=>p.scores);
 const slots=shuffle(Array.from({length:18},(_,i)=>Math.floor(i/6))),fixed=[[],[],[]];
 unknown.forEach((p,i)=>fixed[slots[i]].push(p));
 const pairs=new Map(),recent=history.slice(0,rules.history),oldTeams=new Set();
 const signature=t=>t.map(p=>p.id).sort().join(':');
 recent.forEach((r,k)=>r.teams.forEach(t=>{
  if(t.every(p=>!p.guest))oldTeams.add(signature(t));
  for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++){
   if(t[i].guest||t[j].guest)continue;
   const key=[t[i].id,t[j].id].sort().join(':');pairs.set(key,(pairs.get(key)||0)+(rules.history-k)/rules.history);
  }
 }));
 const mixed=rules.distribution==='mixed';
 function cost(teams){
  let value=0;
  if(rules.useRating){const ss=teams.map(strength).filter(n=>n!==null);if(ss.length)value+=(Math.max(...ss)-Math.min(...ss))*(mixed?8:18);}
  if(rules.useCriteria)for(let c=0;c<5;c++){const av=teams.map(t=>mean(t.filter(p=>p.scores).map(p=>p.scores[c]))).filter(n=>n!==null);if(av.length)value+=(Math.max(...av)-Math.min(...av))*(mixed?.6:1.5);}
  if(rules.usePosition)for(const pos of positions){const counts=teams.map(t=>t.filter(p=>p.scores&&p.position===pos).length);value+=(Math.max(...counts)-Math.min(...counts))*7;}
  teams.forEach(t=>{
   const r=t.filter(p=>p.scores);
   if(rules.separateWeak){const weak=r.filter(p=>mean(p.scores)<=rules.weak).length;value+=Math.max(0,weak-1)**2*25;}
   if(rules.avoidSameTeam&&r.length===6&&oldTeams.has(signature(t)))value+=80;
   if(rules.useHistory)for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)value+=(pairs.get([r[i].id,r[j].id].sort().join(':'))||0)*(mixed?7:2);
  });
  return value;
 }
 let pool=[];
 for(let a=0;a<2500;a++){
  const teams=fixed.map(t=>[...t]),open=shuffle(teams.flatMap((t,i)=>Array(6-t.length).fill(i)));
  shuffle(rated).forEach((p,i)=>teams[open[i]].push(p));
  pool.push({teams,cost:cost(teams)});if(pool.length>24)pool.sort((a,b)=>a.cost-b.cost).splice(12);
 }
 pool.sort((a,b)=>a.cost-b.cost);
 return shuffle(pool.filter(x=>x.cost<=pool[0].cost+2))[0].teams;
}
export function teamsText(round){
 const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
 const parts=String(round.date??'').split('-');
 const date=parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:'';
 return ['⚽ LA REMONTADA',date,...round.teams.map((team,i)=>[
  'TIME '+(i+1),
  ...(clean(round.keepers?.[i])?['Goleiro: '+clean(round.keepers[i])]:[]),
  ...team.map((p,n)=>(n+1)+'. '+clean(p.name))
 ].join('\n'))].filter(Boolean).join('\n\n');
}
