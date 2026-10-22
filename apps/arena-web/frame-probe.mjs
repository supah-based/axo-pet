// Local bounded paint/JS timing only. No identity, network, telemetry or gameplay fields.
export class FrameProbe{
 constructor(){this.intervals=new Float32Array(360);this.costs=new Float32Array(360);this.reset();}
 reset(){this.last=null;this.count=0;this.index=0;}
 observe(time,cost){if(!Number.isFinite(time)||!Number.isFinite(cost)||cost<0)return;if(this.last!==null){const interval=time-this.last;if(interval>1000||interval<=0){this.reset();}else{this.intervals[this.index]=interval;this.costs[this.index]=cost;this.index=(this.index+1)%360;this.count=Math.min(360,this.count+1);}}this.last=time;}
 report(){if(!this.count)return null;const durations=Array.from(this.intervals.slice(0,this.count)).sort((a,b)=>a-b),costs=Array.from(this.costs.slice(0,this.count)).sort((a,b)=>a-b),percentile=(array,p)=>Math.round(array[Math.min(array.length-1,Math.floor((array.length-1)*p))]*100)/100,mean=durations.reduce((a,b)=>a+b,0)/durations.length;return{samples:this.count,paintHz:Math.round(1000/mean),paintP50:percentile(durations,.5),paintP95:percentile(durations,.95),paintP99:percentile(durations,.99),jsP95:percentile(costs,.95)};}
}
