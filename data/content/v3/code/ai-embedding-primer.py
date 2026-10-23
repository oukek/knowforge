import math

def cosine(a,b):
    if len(a)!=len(b) or not a:
        raise ValueError('dimension mismatch')
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b))
    if not na or not nb:
        raise ValueError('zero vector')
    return sum(x*y for x,y in zip(a,b))/(na*nb)

print(cosine([1,0],[2,0]))
print(cosine([1,0],[0,1]))
v=[3,4]; n=math.sqrt(sum(x*x for x in v))
print([x/n for x in v])
try: cosine([0,0],[1,0])
except ValueError as e: print(str(e))
