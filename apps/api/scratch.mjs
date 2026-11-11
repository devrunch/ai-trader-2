import { PineTS, Indicator } from 'pinets';
const N=10, STEP=60000, t0=1700000000000;
const bars=Array.from({length:N},(_,i)=>({openTime:t0+i*STEP,closeTime:t0+(i+1)*STEP-1,open:100+i,high:105+i,low:95,close:100+i,volume:10}));
const provider={configure(){},async getSymbolInfo(t){return{ticker:t,tickerid:t,prefix:'NSE',currency:'INR',timezone:'Asia/Kolkata',mintick:.05,type:'stock',session:'24x7'}},async getMarketData(t){ if(t.includes('NONE')) return []; return bars}};
const run=async(src)=>{ try{ const ctx=await new PineTS(provider,'NSE:X','1',N).run(new Indicator(src,{})); return ctx;}catch(e){console.log('ERR',e.constructor.name,JSON.stringify(e.message),e.line,Object.keys(e));return null} };
let ctx=await run(`//@version=5
indicator("t")
plot(close,"L")
plot(close,"H",style=plot.style_histogram)
plot(close,"A",style=plot.style_area)
plot(close,"S",style=plot.style_stepline)
plot(close,"C",style=plot.style_circles)
plot(close)
hline(70,"U")
plotshape(close>100,"sh")
bgcolor(color.red)
`);
for (const [k,v] of Object.entries(ctx.plots)) console.log(k, v.title, JSON.stringify(v.options), v.data?.length, JSON.stringify(v.data?.[0]));
ctx = await run(`//@version=5
indicator("t")
x = request.security("NSE:NONE","D",close)
plot(x,"x")
plot(close,"c")
`);
if(ctx) console.log(ctx.plots.x.data.map(d=>d.value), ctx.warnings);
await run(`//@version=5
indicator("t")
a = 1
b = foo(close)
plot(b)
`);
await run(`//@version=5
indicator("t"
plot(close)
`);
await run(`//@version=4
study("t")
plot(close)
`);
await run(`//@version=5
indicator("t")
x = ta.bogus(close, 3)
plot(x)
`);
process.exit(0)
