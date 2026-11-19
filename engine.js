export function ipv4ToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || +x > 255))
    throw Error('Invalid IPv4 address');
  return p.reduce((n, x) => ((n << 8) | +x) >>> 0, 0) >>> 0;
}
export function intToIPv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}
export function parseCIDR(value) {
  const m = String(value).trim().match(/^([\d.]+)\/(\d|[12]\d|3[0-2])$/);
  if (!m)
    throw Error('Enter a valid IPv4 CIDR, such as 192.168.1.0/24');
  const ip = ipv4ToInt(m[1]), prefix = +m[2], mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0, network = (ip & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
  return {
    ip, prefix, mask, network, broadcast, size: 2 ** (32 - prefix), first: prefix >= 31 ? network : network + 1, last: prefix >= 31 ? broadcast : broadcast - 1, usable: prefix >= 31 ? 2 ** (32 - prefix) : Math.max(0, 2 ** (32 - prefix) - 2)
  };
}
export function allocateVLSM(parent, requests) {
  const p = parseCIDR(parent);
  if (!Array.isArray(requests))
    throw Error('Subnet requests must be a list');
  const normalized = requests.map((r, i) => {
    const hosts = Number(r.hosts);
    if (!Number.isSafeInteger(hosts) || hosts < 1)
      throw Error(`Host requirement for ${r.name || `Network ${i + 1}`} must be a positive whole number.`);
    return {
      ...r, _i: i, hosts, name: String(r.name || `Network ${i + 1}`)
    };
  });
  const sorted = normalized.sort((a, b) => b.hosts - a.hosts);
  let cursor = p.network;
  const out = [];
  for (const r of sorted) {
    const needed = r.hosts + 2;
    const bits = Math.ceil(Math.log2(Math.max(4, needed)));
    const prefix = 32 - bits, size = 2 ** bits;
    cursor = Math.ceil(cursor / size) * size;
    if (prefix < p.prefix || cursor + size - 1 > p.broadcast)
      throw Error(`Address space exhausted while allocating “${r.name}” (${r.hosts} hosts). Increase the parent network or reduce host requirements.`);
    const network = cursor, broadcast = cursor + size - 1;
    out.push({
      ...r, prefix, network, broadcast, size, first: network + 1, last: broadcast - 1, usable: size - 2, mask: intToIPv4((0xffffffff << (32 - prefix)) >>> 0)
    });
    cursor = broadcast + 1;
  }
  return out.sort((a, b) => a._i - b._i);
}
export function findRoute(source, destination, devices, links) {
  const src = devices.find(d => d.id === source), dst = devices.find(d => d.id === destination);
  if (!src || !dst)
    return { ok: false, reason: 'Source or destination device no longer exists', path: [] };
  if (!src.ip || !dst.ip)
    return { ok: false, reason: 'Source or destination has no IPv4 address configured', path: [] };
  const adjacency = new Map(devices.map(d => [d.id, []]));
  for (const l of links) {
    if (l.down)
      continue;
    const a = devices.find(d => d.id === l.a), b = devices.find(d => d.id === l.b);
    if (!a || !b || a.adminDown || b.adminDown)
      continue;
    adjacency.get(a.id).push(b.id);
    adjacency.get(b.id).push(a.id);
  }
  const queue = [[src.id]], seen = new Set([src.id]);
  while (queue.length) {
    const path = queue.shift(), last = path[path.length - 1];
    if (last === dst.id)
      return { ok: true, path, reason: 'Destination reached' };
    for (const n of adjacency.get(last) || []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return { ok: false, path: [src.id], reason: 'No operational Layer 2/3 path found. Check cables, interfaces and routing.' };
}
