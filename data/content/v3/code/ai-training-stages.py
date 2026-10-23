def valid_pair(row):
    keys=('prompt','chosen','rejected')
    return all(isinstance(row.get(k),str) and row[k].strip() for k in keys) and row['chosen']!=row['rejected']

rows=[dict(prompt='问题',chosen='有依据',rejected='编造'),
      dict(prompt='问题',chosen='同一句',rejected='同一句'),
      dict(prompt='',chosen='A',rejected='B')]
print([bool(valid_pair(r)) for r in rows])
print('LoRA = parameterization; SFT = objective/data')
