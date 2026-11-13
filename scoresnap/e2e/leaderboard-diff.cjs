const {PNG}=require(process.argv[2]+'/pngjs');const fs=require('fs');
const [a,b,out]=process.argv.slice(3);const A=PNG.sync.read(fs.readFileSync(a)),B=PNG.sync.read(fs.readFileSync(b));
let n=0,minY=1e9,maxY=-1;const D=new PNG({width:A.width,height:A.height});
for(let y=0;y<A.height;y++)for(let x=0;x<A.width;x++){const i=(y*A.width+x)*4;const d=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
const diff=d>0;if(diff){n++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
D.data[i]=diff?255:A.data[i]>>2;D.data[i+1]=diff?0:A.data[i+1]>>2;D.data[i+2]=diff?0:A.data[i+2]>>2;D.data[i+3]=255;}
fs.writeFileSync(out,PNG.sync.write(D));console.log(`${A.width}x${A.height} vs ${B.width}x${B.height} diffPixels=${n} rows=${minY}-${maxY}`);
