// 在独立 Worker 中执行学习代码。HTTP CSP 禁止网络、导入脚本与子 Worker。
// 浏览器宿主负责截止时间和 terminate；这里不接触 Node 或学习数据库。
const nativeTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
const nativeInterval = globalThis.setInterval?.bind(globalThis);
const nativeClearInterval = globalThis.clearInterval?.bind(globalThis);
const nativeMicrotask = globalThis.queueMicrotask.bind(globalThis);
self.onmessage = async ({data}) => {
  let finished=false, logs=[],overflow=false;
  const start=performance.now(),timers=new Set(),intervals=new Set();
  let pendingCallbacks=0,rejectFailure;
  const failure=new Promise((_,reject)=>rejectFailure=reject);
  // 防止执行脚本尚未进入 Promise.race 前发生未处理拒绝。
  failure.catch(()=>{});
  function format(value){
    if(typeof value==='string')return value;
    if(value===undefined)return 'undefined';
    if(typeof value==='bigint')return value+'n';
    if(typeof value==='function')return '[Function '+(value.name||'anonymous')+']';
    if(typeof value==='symbol')return String(value);
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    if(value instanceof Error)return value.name+': '+value.message;
    const seen=new WeakSet();
    try{return JSON.stringify(value,(_,item)=>{
      if(typeof item==='bigint')return item+'n';
      if(item===undefined)return 'undefined';
      if(typeof item==='object'&&item!==null){if(seen.has(item))return '[Circular]';seen.add(item);}
      return item;
    })??String(value);}catch{return String(value);}
  }
  function emit(level,args){
    if(finished)return;
    if(logs.length>=200){overflow=true;return;}
    const entry={level,text:args.map(format).join(' ').slice(0,3000)};
    logs.push(entry);if(data.stream||data.mode==='snippet')self.postMessage({type:'console',entry});
  }
  const captured={};
  for(const level of ['log','info','warn','error','debug','table'])captured[level]=(...args)=>emit(level,args);
  captured.assert=(condition,...args)=>{if(!condition)emit('error',['Assertion failed',...args]);};
  captured.clear=()=>{logs=[];if(data.stream||data.mode==='snippet')self.postMessage({type:'clear'});};
  const clock=new Map();
  captured.time=(label='default')=>clock.set(label,performance.now());
  captured.timeEnd=(label='default')=>{emit('log',[label+': '+(performance.now()-(clock.get(label)??performance.now())).toFixed(2)+'ms']);clock.delete(label);};
  const fail=error=>rejectFailure(error instanceof Error?error:new Error(String(error)));
  function invoke(callback,args){
    try{
      const value=callback(...args);
      if(value&&typeof value.then==='function'){
        pendingCallbacks++;
        Promise.resolve(value).catch(fail).finally(()=>pendingCallbacks--);
      }
    }catch(error){fail(error);}
  }
  const setTimer=(callback,delay=0,...args)=>{
    if(typeof callback!=='function')throw new TypeError('setTimeout 需要函数回调');
    const id=nativeTimeout(()=>{timers.delete(id);invoke(callback,args);},delay);
    timers.add(id);return id;
  };
  const clearTimer=id=>{timers.delete(id);nativeClearTimeout(id);};
  const setRepeater=(callback,delay=0,...args)=>{
    if(typeof callback!=='function')throw new TypeError('setInterval 需要函数回调');
    const id=nativeInterval(()=>invoke(callback,args),delay);intervals.add(id);return id;
  };
  const clearRepeater=id=>{intervals.delete(id);nativeClearInterval(id);};
  const microtask=callback=>nativeMicrotask(()=>invoke(callback,[]));
  const delay=ms=>new Promise(resolve=>nativeTimeout(resolve,ms));
  const assert=(condition,message='断言失败')=>{if(!condition)throw new Error(message);};
  const same=(a,b)=>{
    if(Object.is(a,b))return true;
    if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)!==Array.isArray(b))return false;
    if(Array.isArray(a)&&a.length!==b.length)return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
  };
  const equal=(actual,expected)=>{if(!same(actual,expected))throw new Error('预期 '+format(expected)+'，实际 '+format(actual));};
  const onRejection=event=>{event.preventDefault?.();fail(event.reason);};
  self.addEventListener?.('unhandledrejection',onRejection);
  try{
    if(data.mode==='snippet'){
      const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
      const execute=new AsyncFunction('console','setTimeout','clearTimeout','setInterval','clearInterval','queueMicrotask','"use strict";\n'+data.code);
      const work=(async()=>{
        const returned=await execute(captured,setTimer,clearTimer,setRepeater,clearRepeater,microtask);
        do{await delay(0);if(timers.size||intervals.size||pendingCallbacks)await delay(5);}while(timers.size||intervals.size||pendingCallbacks);
        return returned;
      })();
      const returned=await Promise.race([work,failure]);
      finished=true;
      self.postMessage({type:'done',logs,overflow,durationMs:Math.round(performance.now()-start),returned:returned===undefined?null:format(returned)});
    }else{
      const name=data.signature.match(/function\s+(\w+)/)?.[1];
      if(!name)throw new Error('无效函数签名');
      const fn=new Function('console','setTimeout','clearTimeout','setInterval','clearInterval','queueMicrotask','"use strict";\n'+data.code+'\nreturn '+name+';')(captured,setTimer,clearTimer,setRepeater,clearRepeater,microtask);
      if(typeof fn!=='function')throw new Error('请保留函数名称 '+name);
      const results=[];
      for(const test of data.tests){
        const at=performance.now();
        try{
          await Promise.race([new Function('fn','assert','equal','delay','return (async()=>{'+test.code+'})()')(fn,assert,equal,delay),failure]);
          results.push({name:test.name,passed:true,ms:Math.round(performance.now()-at)});
        }catch(error){results.push({name:test.name,passed:false,error:String(error?.message||error),ms:Math.round(performance.now()-at)});}
      }
      finished=true;
      self.postMessage({type:'done',results,logs,overflow,durationMs:Math.round(performance.now()-start)});
    }
  }catch(error){
    finished=true;
    self.postMessage({type:'done',error:String(error?.name?error.name+': '+error.message:error),logs,overflow,durationMs:Math.round(performance.now()-start)});
  }finally{
    for(const id of timers)nativeClearTimeout(id);
    for(const id of intervals)nativeClearInterval?.(id);
    self.removeEventListener?.('unhandledrejection',onRejection);
  }
};
