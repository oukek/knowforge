import json
records={'a':{'ticket-7':'缓存失效'},'b':{'ticket-8':'支付回调'}}
def read(tenant,ticket): return records.get(tenant,{}).get(ticket,'not_found')
print(json.dumps([read('a','ticket-7'),read('a','ticket-8')],ensure_ascii=False))
print(json.dumps({'caller':'a','tool_args':{'ticket_id':'ticket-8'}},separators=(',',':')))
