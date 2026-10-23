import math

def distribution(logits, temperature):
    if temperature <= 0:
        raise ValueError('positive temperature required')
    scaled = [x / temperature for x in logits]
    peak = max(scaled)
    values = [math.exp(x - peak) for x in scaled]
    return [x / sum(values) for x in values]

def nucleus(probs, threshold):
    if not 0 < threshold <= 1:
        raise ValueError('invalid threshold')
    selected, total = [], 0
    for i in sorted(range(len(probs)), key=lambda i: (-probs[i], i)):
        selected.append(i)
        total += probs[i]
        if total >= threshold:
            break
    return selected

print([round(x, 2) for x in distribution([0, math.log(3)], 1)])
print([round(x, 2) for x in distribution([0, math.log(3)], 0.5)])
print(nucleus([0.75, 0.20, 0.05], 0.8))
print(nucleus([0.90, 0.08, 0.02], 0.8))
