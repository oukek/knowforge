function authorize(call, session) {
  if (call.name !== 'readOrder') return 'unknown_tool';
  if (!Number.isInteger(call.args.id)) return 'invalid_args';
  if (call.args.tenant !== session.tenant) return 'forbidden';
  return 'allowed';
}
console.log(authorize({name:'readOrder',args:{id:1,tenant:'A'}},{tenant:'A'}));
console.log(authorize({name:'readOrder',args:{id:1,tenant:'B'}},{tenant:'A'}));
console.log(authorize({name:'refund',args:{id:1,tenant:'A'}},{tenant:'A'}));
