def active(records,subject,now):
    return [r['value'] for r in records if r['subject']==subject and r['confirmed'] and now<r['expires_at']]

rows=[dict(subject='u1',value='zh',confirmed=True,expires_at=10),
      dict(subject='u1',value='en',confirmed=False,expires_at=10),
      dict(subject='u2',value='ja',confirmed=True,expires_at=10)]
print(active(rows,'u1',9))
print(active(rows,'u1',10))
