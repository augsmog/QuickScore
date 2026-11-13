const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
function scan(source, file) {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), calls=[], web=[];
  const keys = object => object && ts.isObjectLiteralExpression(object)
    ? object.properties.map(p=>p.name && (ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)) ? p.name.text : null).filter(Boolean) : [];
  const visit = node => {
    if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method=node.expression.name.text, receiver=node.expression.expression.getText(ast), first=node.arguments[0];
      let event, props;
      if(method==='capture' && first && ts.isStringLiteralLike(first)) {event=first.text;props=keys(node.arguments[1]);}
      if(receiver==='posthogAppLogger') {event=`posthogAppLogger.${method}`;props=keys(first);}
      if(receiver==='posthog?.logger' && method==='info' && first && ts.isStringLiteralLike(first)) {event=first.text;props=keys(node.arguments[1]);}
      if(event) calls.push({event,file,props,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1});
    }
    if(ts.isVariableDeclaration(node) && node.name.getText(ast)==='PROPERTY_KEYS' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for(const p of node.initializer.properties) if(ts.isPropertyAssignment(p) && ts.isArrayLiteralExpression(p.initializer))
        web.push({event:p.name.text,props:p.initializer.elements.filter(ts.isStringLiteral).map(n=>n.text)});
    }
    ts.forEachChild(node,visit);
  };
  visit(ast);return {calls,web};
}
function inventory(root) {
  const result={calls:[],web:[]};
  const walk = dir => {for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    if(['__tests__','tests','fixtures'].includes(entry.name))continue;
    const file=`${dir}/${entry.name}`;
    if(entry.isDirectory())walk(file);
    else if(/\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\./.test(file)){
      const found=scan(fs.readFileSync(path.join(root,file),'utf8'),file);
      result.calls.push(...found.calls);result.web.push(...found.web);
    }
  }};
  walk('app');walk('src');return result;
}
function validate(contract,{calls,web}) {
  const errors=[];
  for(const call of calls){
    const entry=contract[call.event];
    if(!entry){errors.push(`missing:${call.event}`);continue;}
    if(!entry.files.includes(call.file))errors.push(`file:${call.event}:${call.file}`);
    for(const prop of call.props)if(!entry.allowedProps.includes(prop))errors.push(`property:${call.event}:${prop}`);
  }
  for(const [event,entry] of Object.entries(contract)){
    if(!calls.some(c=>c.event===event))errors.push(`stale:${event}`);
    for(const file of entry.files)if(!calls.some(c=>c.event===event&&c.file===file))errors.push(`stale-file:${event}:${file}`);
  }
  for(const item of web){
    if(!contract[item.event])errors.push(`web-missing:${item.event}`);
    else for(const prop of item.props)if(!contract[item.event].allowedProps.includes(prop))errors.push(`web-property:${item.event}:${prop}`);
  }
  return errors;
}
module.exports={scan,inventory,validate};
