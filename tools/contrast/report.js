var res=JSON.parse(require("fs").readFileSync(process.argv[2]+"/audit.json"));
var by={}; res.forEach(r=>{by[r.combo+"|"+r.cls]=r;});
function L(s){var a=s.split(",").map(Number);function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}return 0.2126*f(a[0])+0.7152*f(a[1])+0.0722*f(a[2]);}
function C(a,b){var x=L(a),y=L(b);if(x<y){var t=x;x=y;y=t;}return (x+0.05)/(y+0.05);}
var T={},E={},S2={};
res.forEach(r=>{
  if(r.state===""){
    if(r.text<4.5){var k=r.base; if(!T[k]||r.text<T[k].v) T[k]={v:r.text,at:r.combo,n:0}; T[k].n=(T[k].n||0)+1;}
    if(!r.transparent && r.edge<1.5){var k=r.base; if(!E[k]||r.edge<E[k].v) E[k]={v:r.edge,at:r.combo}; E[k].n=(E[k].n||0)+1;}
  } else {
    var rest=by[r.combo+"|"+r.base]; if(!rest) return;
    if(rest.bg===r.bg&&rest.fg===r.fg&&Math.abs(rest.edge-r.edge)<0.05) return;
    var d=Math.max(C(rest.bg,r.bg),C(rest.fg,r.fg),Math.abs(rest.edge-r.edge)+1);
    var key=r.base+" ["+r.state+"]";
    if(r.text<4.5){ S2[key]=S2[key]||{}; if(!S2[key].t||r.text<S2[key].t){S2[key].t=r.text;S2[key].tat=r.combo;} }
    if(d<1.4){ S2[key]=S2[key]||{}; if(!S2[key].d||d<S2[key].d){S2[key].d=d;S2[key].dat=r.combo;} }
  }
});
function show(o,label){var k=Object.keys(o).sort((a,b)=>o[a].v-o[b].v);console.log("\n== "+label+" ("+k.length+")");k.forEach(x=>console.log(x+": min "+o[x].v+" @"+o[x].at+" ("+o[x].n+"/10 themes)"));}
show(T,"RESTING text contrast < 4.5");
show(E,"FILLED but weak edge < 1.5 (looks flat)");
console.log("\n== SELECTED state problems");
Object.keys(S2).forEach(k=>console.log(k+": "+(S2[k].t?"text "+S2[k].t+" @"+S2[k].tat+"; ":"")+(S2[k].d?"barely differs x"+S2[k].d.toFixed(2)+" @"+S2[k].dat:"")));
