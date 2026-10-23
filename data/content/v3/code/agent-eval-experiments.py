import random
pairs = [(True,True),(False,True),(True,False),(False,True)]
deltas = [int(b)-int(a) for a,b in pairs]
print(sum(deltas)/len(deltas))
print({'b_only':sum(not a and b for a,b in pairs),'a_only':sum(a and not b for a,b in pairs)})
rng=random.Random(7)
means=[sum(rng.choice(deltas) for _ in deltas)/len(deltas) for _ in range(1000)]
print([min(means),max(means)])
