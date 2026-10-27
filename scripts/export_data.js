const fs=require("fs"),vm=require("vm");const root=process.argv[2];
const ctx={document:{addEventListener(){},querySelector(){return null}},console};ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
for(const f of ["config","data","bot-mind-knowledge"]){try{vm.runInContext(fs.readFileSync(root+"/js/"+f+".js","utf8"),ctx)}catch(e){console.error(f,e.message)}}
fs.writeFileSync(process.argv[3],JSON.stringify({C:ctx.FODO,D:ctx.FODO_DATA,T:(ctx.FODO_MIND_KB||{}).topics}));
