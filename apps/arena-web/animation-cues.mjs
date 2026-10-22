// Shared presentation timing, not combat damage/energy authority.
export const MOVE_PROFILES=Object.freeze(Object.fromEntries(Object.entries({
 market_order:[190,620,1050,26,0,'jab'],diamond_hands:[260,560,1320,0,0,'barrier'],
 rug_pull:[340,850,1240,-18,8,'ribbon'],reversal:[250,970,1360,-12,0,'counter'],
 wen:[420,780,1300,0,-8,'question'],pepe_breakout:[320,680,1100,42,-54,'candle'],
 touch_grass:[440,880,1400,0,12,'garden'],exit_liquidity:[170,720,1160,46,-5,'slash'],
 lineage_a:[300,790,1200,32,-14,'signature'],lineage_b:[380,900,1430,-6,7,'recovery'],
 epic:[480,1020,1400,22,-24,'epic'],recharge:[520,940,1470,0,4,'charge']
}).map(([k,v])=>[k,Object.freeze({anticipation:v[0],impact:v[1],follow:v[2],reach:v[3],lift:v[4],shape:v[5]})])));
