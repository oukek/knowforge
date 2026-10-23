import json
approval={'operation':'op-1','amount':100,'version':3,'used':False}
def allowed(request):
    return not approval['used'] and all(request[k]==approval[k] for k in ['operation','amount','version'])
print(json.dumps([allowed({'operation':'op-1','amount':100,'version':3}),allowed({'operation':'op-1','amount':1000,'version':3})]))
approval['used']=True
print(json.dumps(allowed({'operation':'op-1','amount':100,'version':3})))
