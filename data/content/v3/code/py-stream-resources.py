import itertools

def rows():
    try:
        for i in range(1000000):
            yield i
    finally:
        print('closed')

stream=rows()
print(list(itertools.islice(stream,3)))
stream.close()
