import assert from 'node:assert/strict';
export async function containOffline(context,base,onBlocked=()=>{}) {
 const origin=new URL(base);assert(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname),'Loopback HTTP only');
 await context.routeWebSocket('**/*',socket=>{onBlocked('websocket');socket.close();});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin.origin&&u.protocol==='http:')return route.continue();onBlocked('http');return route.abort();});
}
