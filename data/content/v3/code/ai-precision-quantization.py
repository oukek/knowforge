values=[0.12,0.26,-0.31]
scale=0.1
quantized=[max(-128,min(127,round(x/scale))) for x in values]
restored=[round(q*scale,2) for q in quantized]
errors=[round(abs(x-y),2) for x,y in zip(values,restored)]
print(quantized)
print(restored)
print(errors)
