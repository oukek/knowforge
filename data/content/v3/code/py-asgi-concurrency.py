import asyncio
async def main():
    active = 0
    peak = 0
    gate = asyncio.Semaphore(2)
    async def work(value):
        nonlocal active, peak
        async with gate:
            active += 1
            peak = max(peak, active)
            try:
                await asyncio.sleep(0)
                return value * 2
            finally:
                active -= 1
    values = await asyncio.gather(*(work(i) for i in range(5)))
    print(values)
    print(peak)
await main()
