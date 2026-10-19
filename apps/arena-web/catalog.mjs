export const VERSION='axo-pet-arena-1.2-review';
export const STATS=['STR','DEX','CON','INT','WIS','CHA'];
export const XP=[0,40,100,180,280,400,550,730,940,1200];
export const LINEAGES={
 emerald_sprout:{name:'Emerald Protocol Builder',short:'Builder',color:'#b8ff18',base:[10,10,10,10,10,10],scale:['INT','CON'],tool:'Crystal reactor',branches:['Protocol Forge','Diamond Vault'],special:['Liquidity Lock','Compound Copium'],epic:'Proof of HODL',condition:'Block damage in 2 exchanges',passive:'First 2 successful blocks restore 1 energy.',joke:'Dev is building. Your shield is the deliverable.'},
 sapphire_tide:{name:'Sapphire Chain Courier',short:'Courier',color:'#37d8ff',base:[10,10,10,10,10,10],scale:['DEX','WIS'],tool:'Routing rings',branches:['Route Runner','Liquidity Buffer'],special:['MEV Sidestep','Bridge Back'],epic:'Finality Express',condition:'Use 3 different equipped moves',passive:'Every third attack bypasses 2 shield.',joke:'Bridged in. Still waiting for emotional finality.'},
 amethyst_dream:{name:'Amethyst Ghost Crew',short:'Ghost',color:'#ac8aff',base:[10,10,10,10,10,10],scale:['INT','CHA'],tool:'Hologram projector',branches:['Ghost Mempool','Candle Oracle'],special:['Ghost Candle','Priced In'],epic:'Shadow Fork',condition:'Deal damage in 3 exchanges',passive:'First 3 attacks into a non-attacking rival deal +2 damage.',joke:'Wallet anonymous. Candle trauma public.'},
 solar_peach:{name:'Solar Momentum Racer',short:'Racer',color:'#ffb855',base:[10,10,10,10,10,10],scale:['STR','DEX'],tool:'Momentum scanner',branches:['Breakout Chaser','Reversal Rider'],special:['FOMO Candle','Dead Cat Bounce'],epic:'Send It',condition:'Attack in 2 consecutive exchanges',passive:'Second and later consecutive attacks gain +1 damage.',joke:'Bought the top. Now owns the penthouse.'},
 rose_bloom:{name:'Rose Signal Riot',short:'Signal',color:'#ff73b3',base:[10,10,10,10,10,10],scale:['CHA','WIS'],tool:'Signal wand',branches:['Narrative Pump','Crew Rally'],special:['Narrative Pump','WAGMI Wave'],epic:'Cult of the Hoodie',condition:'Heal or block successfully in 2 exchanges',passive:'First 3 successful heals or blocks grant +3 next-attack damage.',joke:'Group chat bullish. Group chat always bullish.'},
 midnight_mint:{name:'Midnight White-Hat Unit',short:'White-Hat',color:'#64f3d3',base:[10,10,10,10,10,10],scale:['INT','DEX'],tool:'Audit tablet',branches:['Receipt Auditor','Counter-Exploit'],special:['Receipt Check','Patch Tuesday'],epic:'Exploit Denied',condition:'Land 2 attacks into an attacking rival',passive:'First 3 attacks into a shield gain +2 damage.',joke:'Source verified. Vibes still pending.'},
};
// Shared, bounded move budgets; lineages change scaling, signature utility and conditions.
const template=[
 ['market_order','Market Order',1,'attack',{power:19,cost:0},'Filled. Emotionally unfilled.'],
 ['diamond_hands','Diamond Hands',1,'defense',{shield:22,cost:0},'The sell button is decorative.'],
 ['rug_pull','Rug Pull',1,'attack',{power:18,purge:10,cost:3,cooldown:2},'Pulls the shield. Not your wallet.'],
 ['reversal','Reversal',1,'defense',{shield:13,counter:12,cost:3,cooldown:2},'You thought it was over. So did my portfolio.'],
 ['wen','Wen?',2,'defense',{shield:10,energy:2,cost:0,cooldown:2},'Wen utility? After this cooldown.'],
 ['pepe_breakout',"Pepe’s Breakout",2,'attack',{power:31,recoil:6,cost:4,cooldown:2},'Resistance is temporary. Screenshots are forever.'],
 ['touch_grass','Touch Grass',4,'defense',{heal:23,cleanse:true,cost:3,cooldown:3},'Outside has surprisingly low gas fees.'],
 ['exit_liquidity','Exit Liquidity',4,'attack',{power:22,pierce:.5,cost:3,cooldown:2},'Politely declines to hold the bag.'],
 ['lineage_a','Signature',6,'attack',{power:24,cost:3,cooldown:2},'Tools out. Thesis in.'],
 ['lineage_b','Recovery',8,'defense',{shield:13,heal:10,cost:3,cooldown:3},'Still here. Still building.'],
];
export function catalog(id){
 const l=LINEAGES[id];if(!Object.hasOwn(LINEAGES,id))throw Error('Unknown lineage');
 const moves=Object.fromEntries(template.map(([key,name,level,branch,data,joke])=>[key,{key,name,level,branch,cost:0,cooldown:0,power:0,shield:0,heal:0,...data,joke,scale:data.power?l.scale:['CON','WIS']} ]));
 moves.lineage_a.name=l.special[0];moves.lineage_b.name=l.special[1];
 if(id==='emerald_sprout'){moves.lineage_a.power=20;moves.lineage_a.shield=5;}
 if(id==='sapphire_tide'){moves.lineage_a.power=21;moves.lineage_a.pierce=.3;}
 if(id==='amethyst_dream'){moves.lineage_a.power=20;moves.lineage_a.weak=.10;}
 if(id==='solar_peach'){moves.lineage_a.power=28;moves.lineage_a.recoil=4;}
 if(id==='rose_bloom'){moves.lineage_a.power=21;moves.lineage_a.buff=3;}
 if(id==='midnight_mint'){moves.lineage_a.power=21;moves.lineage_a.purge=6;}
 moves.epic={key:'epic',name:l.epic,level:6,branch:'epic',power:35,shield:8,heal:0,cost:0,cooldown:0,scale:l.scale,joke:l.joke,epic:true};
 moves.recharge={key:'recharge',name:'Gas Station',level:1,branch:'fallback',power:0,shield:0,heal:0,cost:0,cooldown:0,energy:2,scale:['WIS','CON'],joke:'One exchange to refuel. No attack, no shield.'};
 return moves;
}
export function levelForXp(xp){if(!Number.isSafeInteger(xp)||xp<0)throw Error('Invalid Hatchery XP');return XP.filter(n=>xp>=n).length;}
export const statBudget=level=>6+2*(level-1);
export const statCap=level=>14+2*Math.floor((level-1)/3);
export function validateGearStats(gearStats={},level=1){
 if(!gearStats||typeof gearStats!=='object'||Array.isArray(gearStats)||Object.keys(gearStats).some(k=>!STATS.includes(k)))throw Error('Invalid gear stats');
 const out={};let total=0;for(const k of STATS){const n=gearStats[k]??0;if(!Number.isInteger(n)||n<0||n>6)throw Error('Invalid gear stats');out[k]=n;total+=n;}
 if(total>32||total>0&&level<10)throw Error('Level 10 gear required');return out;
}
export function buildPet({lineageId,xp,allocation={},ranks={},loadout=['market_order','diamond_hands','rug_pull','reversal'],gearStats={}}={}){
 if(!Object.hasOwn(LINEAGES,lineageId))throw Error('Unknown lineage');
 const level=levelForXp(xp);
 return buildPetAtLevel({lineageId,xp,allocation,ranks,loadout},level,validateGearStats(gearStats,level));
}
// Pure calculation shared by explicitly versioned rulesets; not an identity/authentication boundary.
export function buildPetAtLevel({lineageId,xp,allocation={},ranks={},loadout=['market_order','diamond_hands','rug_pull','reversal']},level,gear){
 if(!Object.hasOwn(LINEAGES,lineageId))throw Error('Unknown lineage');
 const lineage=LINEAGES[lineageId],baseStats={};let spent=0,skillSpent=0;
 if(!allocation||Array.isArray(allocation)||Object.keys(allocation).some(k=>!STATS.includes(k)))throw Error('Invalid stat allocation');
 for(const [i,k]of STATS.entries()){const n=allocation[k]??0;if(!Number.isInteger(n)||n<0||lineage.base[i]+n>statCap(level))throw Error('Stat cap exceeded');baseStats[k]=lineage.base[i]+n;for(let v=1;v<=n;v++)spent+=lineage.base[i]+v>16?2:1;}
 if(spent>statBudget(level))throw Error('Stat budget exceeded');
 const skills=catalog(lineageId);
 if(!ranks||typeof ranks!=='object'||Array.isArray(ranks))throw Error('Invalid skill ranks');
 for(const [key,rank]of Object.entries(ranks)){
  const m=skills[key];if(!Object.hasOwn(skills,key)||key==='recharge'||!Number.isInteger(rank)||rank<0||rank>2||m.level>level&&rank>0)throw Error('Skill locked');
  if(key==='epic'&&rank===2&&level<10)throw Error('Epic mastery requires level 10');
  skillSpent+=rank===2?3:rank;
  if(m.power)m.power+=rank*2;if(m.shield)m.shield+=rank*2;if(m.heal)m.heal+=rank*2;
 }
 if(skillSpent>level-1)throw Error('Skill point budget exceeded');
 if(!Array.isArray(loadout)||loadout.length!==4||new Set(loadout).size!==4||loadout.some(k=>!Object.hasOwn(skills,k)||['epic','recharge'].includes(k)||skills[k].level>level))throw Error('Equip 4 different unlocked moves');
 const stats=Object.fromEntries(STATS.map(k=>[k,baseStats[k]+gear[k]]));
 return {lineageId,xp,level,allocation:{...allocation},ranks:{...ranks},loadout:[...loadout],baseStats,gearStats:gear,stats,skills,maxHp:Math.round(112+3*(level-1)+1.5*(stats.CON-10)),statPoints:{earned:statBudget(level),spent,available:statBudget(level)-spent},skillPoints:{earned:level-1,spent:skillSpent,available:level-1-skillSpent},epic:!!ranks.epic};
}
export function defaultBuild(lineageId,xp=1200,gearStats={}){
 const level=levelForXp(xp),l=LINEAGES[lineageId],allocation={};let remaining=statBudget(level);
 const order=[...new Set([...l.scale,'CON','WIS','DEX',...STATS])];
 while(remaining){let changed=false;for(const k of order){const value=l.base[STATS.indexOf(k)]+(allocation[k]||0),cost=value+1>16?2:1;if(value<statCap(level)&&remaining>=cost){allocation[k]=(allocation[k]||0)+1;remaining-=cost;changed=true;}}if(!changed)break;}
 const ranks=level>=6?{epic:1}:{};
 return buildPet({lineageId,xp,allocation,ranks,gearStats,loadout:['market_order','diamond_hands',level>=2?'pepe_breakout':'rug_pull',level>=4?'touch_grass':'reversal']});
}
