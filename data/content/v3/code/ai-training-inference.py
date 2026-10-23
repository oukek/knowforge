w, x, y, rate = 0.0, 2.0, 4.0, 0.1
before=(w*x-y)**2
gradient=2*x*(w*x-y)
w-=rate*gradient
after=(w*x-y)**2
print({'before':round(before,2),'gradient':round(gradient,2)})
print({'weight':round(w,2),'after':round(after,2)})
bad_weight=0-1*gradient
print(round((bad_weight*x-y)**2,2))
