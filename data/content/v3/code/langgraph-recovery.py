import copy, json
checkpoint={'step':'write','operation_id':'op-7','payload':{'title':'follow up'}}
ledger={}
def write(state):
    key=state['operation_id']
    if key not in ledger: ledger[key]={'ticket_id':len(ledger)+1}
    return ledger[key]
first=write(copy.deepcopy(checkpoint))
second=write(copy.deepcopy(checkpoint))
print(json.dumps([first,second],separators=(',',':')))
print(len(ledger))
