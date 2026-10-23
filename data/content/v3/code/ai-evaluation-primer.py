def metrics(tp,fp,fn,tn):
    def divide(a,b):return a/b if b else None
    p=divide(tp,tp+fp);r=divide(tp,tp+fn)
    f1=divide(2*tp,2*tp+fp+fn)
    return {'accuracy':divide(tp+tn,tp+fp+fn+tn),'precision':p,'recall':r,'f1':f1}

print({k:round(v,4) if v is not None else None for k,v in metrics(2,1,2,5).items()})
print(metrics(0,0,1,9)['precision'])
