d, k, rank = 4096, 4096, 8
full = d * k
adapter = rank * (d + k)
print(full)
print(adapter)
print(round(adapter / full * 100, 2))
train = [{'entity':'ticket-1','text':'原问题'}, {'entity':'ticket-2','text':'其他问题'}]
test = [{'entity':'ticket-1','text':'原问题的改写'}, {'entity':'ticket-3','text':'新问题'}]
leaks = {r['entity'] for r in train} & {r['entity'] for r in test}
print(sorted(leaks))
