function encode(ip, port) {
  const parts = ip.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (s) =>
        !/^(0|[1-9]\d{0,2})$/.test(s) ||
        String(Number(s)) !== s ||
        Number(s) > 255,
    )
  )
    throw Error("invalid IPv4");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("invalid port");
  const address = parts.reduce((n, s) => (n << 8n) | BigInt(s), 0n);
  return (address << 16n) | BigInt(port);
}
function decode(value) {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << 48n)
    throw Error("invalid packed value");
  const address = value >> 16n;
  const ip = [24n, 16n, 8n, 0n]
    .map((shift) => String((address >> shift) & 255n))
    .join(".");
  return { ip, port: Number(value & 65535n) };
}
console.log(decode(encode("127.0.0.1", 8080)));
console.log(encode("255.255.255.255", 65535).toString());
console.log({ numberShift: (2 ** 32) << 1, numberMultiply: 2 ** 32 * 2 });
