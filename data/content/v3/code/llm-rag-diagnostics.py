def recall_at_k(relevant, ranked, k):
    if not relevant:
        return None
    return len(set(ranked[:k]) & relevant) / len(relevant)

def reciprocal_rank(relevant, ranked):
    return next((1 / i for i, doc in enumerate(ranked, 1) if doc in relevant), 0)

print(recall_at_k({'a','b'}, ['a','a','b'], 2))
print(recall_at_k({'a','b'}, ['a','a','b'], 3))
print(reciprocal_rank({'c'}, ['x','c']))
print(recall_at_k(set(), ['x'], 1))
candidate, context, required = {'a','b','x'}, {'a','x'}, {'a','b'}
print(sorted((candidate & required) - context))
