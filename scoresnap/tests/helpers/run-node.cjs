// File-backed stdio also works in sandboxes that prohibit anonymous pipe sockets.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
module.exports = function runNode(args, options = {}) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapscore-test-'));
 const output = path.join(dir,'output');
 const fd = fs.openSync(output,'w');
 try {
  execFileSync(process.execPath,args,{...options,stdio:['ignore',fd,fd]});
  return fs.readFileSync(output,'utf8');
 } catch(error) {
  error.message += '\n' + fs.readFileSync(output,'utf8');
  throw error;
 } finally { fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true}); }
};
