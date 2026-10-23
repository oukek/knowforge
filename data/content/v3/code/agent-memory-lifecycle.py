def resolve(records, tenant, key, now):
    candidates = [r for r in records if r['tenant']==tenant and r['key']==key
        and r['confirmed'] and not r['revoked'] and now<r['expires_at']]
    values = sorted({r['value'] for r in candidates})
    if not values:
        return {'status':'missing'}
    if len(values)>1:
        return {'status':'conflict','values':values}
    return {'status':'resolved','value':values[0]}

base = dict(tenant='a', key='language', confirmed=True, revoked=False, expires_at=100)
rows = [{**base,'value':'zh'}, {**base,'value':'en'}]
print(resolve(rows,'a','language',50))
print(resolve(rows[:1]+[{**base,'value':'en','confirmed':False}],'a','language',50))
print(resolve(rows,'a','language',100))
