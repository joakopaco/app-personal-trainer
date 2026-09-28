const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
exports.load=(files,extra={})=>{
  const c=vm.createContext({structuredClone,console,Date,JSON,Math,setTimeout,clearTimeout,...extra});
  for(const file of files)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),c,{filename:file});
  return c;
};
