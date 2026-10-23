def chunks(items,size,overlap):
    if size<=0 or overlap<0 or overlap>=size:
        raise ValueError('invalid chunk settings')
    result=[]; start=0
    while start<len(items):
        end=min(start+size,len(items))
        result.append({'start':start,'end':end,'items':items[start:end]})
        if end==len(items):break
        start+=size-overlap
    return result

print(chunks(list(range(7)),4,1))
try: chunks([1],2,2)
except ValueError as e:print(str(e))
