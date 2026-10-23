def decide(m):
    if m['unauthorized'] or m['duplicates']:
        return 'rollback'
    if m['samples'] < 100:
        return 'hold'
    if m['success_rate'] < 0.9 or m['cost_per_success'] > 3:
        return 'rollback'
    return 'expand'

base=dict(samples=120,success_rate=0.95,cost_per_success=2,unauthorized=0,duplicates=0)
print(decide({**base,'samples':20}))
print(decide({**base,'samples':1,'unauthorized':1}))
print(decide(base))
