import math

def sequence_stats(probabilities):
    if not probabilities or any(not 0 < p <= 1 for p in probabilities):
        raise ValueError('probabilities must be in (0,1]')
    return round(math.prod(probabilities), 4), round(-sum(math.log(p) for p in probabilities), 4)

print(sequence_stats([0.5,0.5]))
print(sequence_stats([0.5,0.5,0.5,0.5]))
print('token probability is not factual correctness')
