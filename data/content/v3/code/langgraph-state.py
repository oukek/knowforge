import json
old=[{'id':'a','text':'A'}]
update=[{'id':'b','text':'B'}]
def merge(left,right):
    by_id={item['id']:item for item in left}
    by_id.update({item['id']:item for item in right})
    return [by_id[key] for key in sorted(by_id)]
print(json.dumps([len(old+update+update),len(merge(merge(old,update),update))]))
print(json.dumps(merge(old,update),separators=(',',':')))
