var fs=require("fs"),cp=require("child_process");
var src=["index.html"].concat(fs.readdirSync("js").filter(f=>/\.js$/.test(f)).map(f=>"js/"+f)).map(f=>fs.readFileSync(f,"utf8")).join("\n");
var set={};
(src.match(/<(button|a|div|span|label)[^>]*class="[^"]*"[^>]*>/g)||[]).forEach(function(tag){
  if(!/<button|onclick|role="(radio|tab|button|switch)"/.test(tag)) return;
  var c=tag.match(/class="([^"]*)"/)[1];
  if(/['+]/.test(c)){ c=c.split(/\s+/).filter(x=>x&&!/['+]/.test(x)).join(" "); }
  if(c.trim()) set[c.trim()]=1;
});
var classes=Object.keys(set);
var states=["","active","on","selected","sel"];
var items=[]; classes.forEach(function(c){ states.forEach(function(s){ var base=c.split(" ")[0]; items.push({c:c+(s?" "+s:""),base:c,s:s}); }); });
var html='<!doctype html><meta charset=utf-8><link rel=stylesheet href="file://'+process.cwd()+'/css/styles.css"><body><div id=hostC class=card style="padding:10px"></div><div id=hostB style="padding:10px"></div><script>'+
`var ITEMS=${JSON.stringify(items)};
function parse(c){var m=c.match(/[\\d.]+/g).map(Number);return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1};}
function over(f,b){var a=f.a;return {r:f.r*a+b.r*(1-a),g:f.g*a+b.g*(1-a),b:f.b*a+b.b*(1-a),a:1};}
function lum(c){function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
function cr(a,b){var x=lum(a),y=lum(b);if(x<y){var t=x;x=y;y=t;}return (x+0.05)/(y+0.05);}
function bgOf(el){var stack=[];for(var e=el;e;e=e.parentElement){stack.push(getComputedStyle(e).backgroundColor);}var c={r:255,g:255,b:255,a:1};for(var i=stack.length-1;i>=0;i--){c=over(parse(stack[i]),c);}return c;}
var out=[];
var combos=[["",""],["light",""],["light","lilac"],["light","sky"],["light","paper"],["light","sunrise"],["dark","violet"],["dark","court"],["dark","clean"],["dark","midnight"],["dark","halloween"],["dark","christmas"],["dark","cny"],["dark","arcade"]];
var hosts=[document.getElementById("hostC"),document.getElementById("hostB")];
combos.forEach(function(cb){
 document.body.removeAttribute("data-theme");document.body.removeAttribute("data-palette");document.body.removeAttribute("data-lpalette");document.body.removeAttribute("data-special");
 document.documentElement.removeAttribute("data-theme");
 if(cb[0]==="light"){document.body.setAttribute("data-theme","light");if(cb[1])document.body.setAttribute("data-lpalette",cb[1]);}
 else if(["halloween","christmas","cny","arcade"].indexOf(cb[1])>=0) document.body.setAttribute("data-special",cb[1]); else if(cb[1]) document.body.setAttribute("data-palette",cb[1]);
 document.body.style.background="var(--bg)";
 ITEMS.forEach(function(it){
  var best=null;
  hosts.forEach(function(host){
  host.innerHTML='<button class="'+it.c+'">Label</button>';
  var el=host.firstChild;
  var cs=getComputedStyle(el); if(cs.display==="none")return;
  var parent=bgOf(host); var bgc=parse(cs.backgroundColor);
  if(cs.backgroundImage&&cs.backgroundImage!=="none"){var gm=cs.backgroundImage.match(/rgba?\([^)]*\)/);if(gm){bgc=parse(gm[0]);}}
  var bg=over(bgc,parent);
  var fg=over(parse(cs.color),bg);
  var bw=parseFloat(cs.borderTopWidth)||0, bs=cs.borderTopStyle, border=null;
  if(bw>0&&bs!=="none"){border=over(parse(cs.borderTopColor),parent);}
  var edge=Math.max(cr(bg,parent), border?cr(border,parent):1);
  var rec={text:+cr(fg,bg).toFixed(2),edge:+edge.toFixed(2),transparent:bgc.a<0.05&&!(cs.backgroundImage&&cs.backgroundImage!=="none"),op:+cs.opacity,bg:[bg.r|0,bg.g|0,bg.b|0].join(","),fg:[fg.r|0,fg.g|0,fg.b|0].join(",")};
  if(!best) best=rec; else { if(rec.edge>best.edge) best.edge=rec.edge; if(rec.text>best.text){best.text=rec.text;} }
  });
  if(!best) return;
  var cs=best, r0=best;
  out.push({combo:cb.join("/")||"dark",cls:it.c,base:it.base,state:it.s,text:best.text,edge:best.edge,transparent:best.transparent,op:best.op,bg:best.bg,fg:best.fg});
 });
});
document.title="DONE";
var pre=document.createElement("pre");pre.id="res";pre.textContent=JSON.stringify(out);document.body.appendChild(pre);
</script>`;
fs.writeFileSync(process.argv[2]+"/audit.html",html);
var r=cp.spawnSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",["--headless=new","--disable-gpu","--allow-file-access-from-files","--virtual-time-budget=20000","--dump-dom","file://"+process.argv[2]+"/audit.html"],{maxBuffer:1e9});
var dom=r.stdout.toString(); var m=dom.match(/<pre id="res">([\s\S]*?)<\/pre>/);
if(!m){console.log("no result",dom.slice(0,300));process.exit(1);}
var res=JSON.parse(m[1].replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"));
fs.writeFileSync(process.argv[2]+"/audit.json",JSON.stringify(res));
console.log(classes.length+" classes, "+res.length+" samples");
