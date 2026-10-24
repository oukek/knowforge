// Deterministic practice data, shared by the actual submit flow and regression tests.
// Random expected answers use independent small-input oracles, never the reference solution.
export const ACM_JUDGE_VERSION = 1;
export const ACM_RANDOM_CASES = 24;
const MOD = 1000000007;
const str = (x) => String(x);
const line = (xs) => xs.join(" ");
const numeric = (a, b) => a - b;
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
function rng(id) {
  let seed = 20261024;
  for (const c of id) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  return (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
}
const array = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
function permutations(xs, fn, prefix = []) {
  if (!xs.length) {
    fn(prefix);
    return;
  }
  for (let i = 0; i < xs.length; i++)
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)], fn, [
      ...prefix,
      xs[i],
    ]);
}
function floyd(g) {
  for (let k = 0; k < g.length; k++)
    for (let i = 0; i < g.length; i++)
      for (let j = 0; j < g.length; j++)
        g[i][j] = Math.min(g[i][j], g[i][k] + g[k][j]);
  return g;
}
function randomCase(id, R) {
  const n = 1 + R(8),
    a = array(n, () => R(15) - 5);
  switch (id) {
    case "range-sum": {
      const q = 1 + R(8),
        queries = array(q, () => {
          const l = R(n),
            r = l + R(n - l);
          return [l + 1, r + 1];
        });
      return [
        `${n} ${q}\n${line(a)}\n${queries.map(line).join("\n")}`,
        queries.map(([l, r]) => sum(a.slice(l - 1, r))).join("\n"),
      ];
    }
    case "lower-bound": {
      a.sort(numeric);
      const q = 8,
        xs = array(q, () => R(20) - 8);
      return [
        `${n} ${q}\n${line(a)}\n${xs.join("\n")}`,
        xs
          .map((x) => {
            const i = a.findIndex((v) => v >= x);
            return i < 0 ? n + 1 : i + 1;
          })
          .join("\n"),
      ];
    }
    case "grid-bfs": {
      const rows = 2 + R(4),
        cols = 2 + R(4),
        g = array(rows, () => array(cols, () => (R(4) ? "." : "#")));
      g[0][0] = "S";
      g[rows - 1][cols - 1] = "T";
      const d = new Array(rows * cols).fill(Infinity);
      d[0] = 0;
      for (let pass = 0; pass < rows * cols; pass++)
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            if (g[r][c] !== "#")
              for (const [dr, dc] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const nr = r + dr,
                  nc = c + dc;
                if (g[nr]?.[nc] && g[nr][nc] !== "#")
                  d[nr * cols + nc] = Math.min(
                    d[nr * cols + nc],
                    d[r * cols + c] + 1,
                  );
              }
      return [
        `${rows} ${cols}\n${g.map((row) => row.join("")).join("\n")}`,
        Number.isFinite(d.at(-1)) ? d.at(-1) : -1,
      ];
    }
    case "knapsack": {
      const cap = 1 + R(18),
        items = array(n, () => [1 + R(cap), R(20)]);
      let best = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        let w = 0,
          v = 0;
        items.forEach(([x, y], i) => {
          if (mask & (1 << i)) {
            w += x;
            v += y;
          }
        });
        if (w <= cap) best = Math.max(best, v);
      }
      return [`${n} ${cap}\n${items.map(line).join("\n")}`, best];
    }
    case "lcs": {
      const x = array(n, () => String.fromCharCode(97 + R(3))).join(""),
        y = array(1 + R(8), () => String.fromCharCode(97 + R(3))).join("");
      let best = 0;
      for (let mask = 0; mask < 1 << x.length; mask++) {
        let j = 0,
          len = 0,
          valid = true;
        for (let i = 0; i < x.length; i++)
          if (mask & (1 << i)) {
            while (j < y.length && y[j] !== x[i]) j++;
            if (j === y.length) {
              valid = false;
              break;
            }
            j++;
            len++;
          }
        if (valid) best = Math.max(best, len);
      }
      return [x + "\n" + y, best];
    }
    case "window-max": {
      const k = 1 + R(n);
      return [
        `${n} ${k}\n${line(a)}`,
        array(n - k + 1, (i) => Math.max(...a.slice(i, i + k))).join(" "),
      ];
    }
    case "histogram": {
      const h = a.map(Math.abs);
      let best = 0;
      for (let i = 0; i < n; i++)
        for (let j = i; j < n; j++)
          best = Math.max(best, Math.min(...h.slice(i, j + 1)) * (j - i + 1));
      return [`${n}\n${line(h)}`, best];
    }
    case "connectivity": {
      const g = array(n, () => array(n, () => false)),
        ops = [],
        out = [];
      for (let k = 0; k < 20; k++) {
        const u = R(n),
          v = R(n),
          op = R(2) ? "U" : "Q";
        ops.push(`${op} ${u + 1} ${v + 1}`);
        if (op === "U") g[u][v] = g[v][u] = true;
        else {
          const seen = new Set([u]),
            q = [u];
          for (let h = 0; h < q.length; h++)
            for (let j = 0; j < n; j++)
              if (g[q[h]][j] && !seen.has(j)) {
                seen.add(j);
                q.push(j);
              }
          out.push(seen.has(v) ? "YES" : "NO");
        }
      }
      return [`${n} ${ops.length}\n${ops.join("\n")}`, out.join("\n")];
    }
    case "dijkstra": {
      const size = 1 + R(6),
        g = array(size, (i) => array(size, (j) => (i === j ? 0 : Infinity))),
        edges = array(R(15), () => [R(size) + 1, R(size) + 1, R(10)]);
      for (const [u, v, w] of edges)
        g[u - 1][v - 1] = Math.min(g[u - 1][v - 1], w);
      floyd(g);
      return [
        `${size} ${edges.length} 1\n${edges.map(line).join("\n")}`,
        g[0].map((x) => (Number.isFinite(x) ? x : -1)).join(" "),
      ];
    }
    case "mst": {
      const size = 1 + R(5),
        edges = array(R(9), () => [R(size), R(size), R(10)]);
      let best = Infinity;
      for (let mask = 0; mask < 1 << edges.length; mask++) {
        if (mask.toString(2).replaceAll("0", "").length !== size - 1) continue;
        const g = array(size, () => []);
        let cost = 0;
        edges.forEach(([u, v, w], i) => {
          if (mask & (1 << i)) {
            g[u].push(v);
            g[v].push(u);
            cost += w;
          }
        });
        const seen = new Set([0]),
          q = [0];
        for (let h = 0; h < q.length; h++)
          for (const v of g[q[h]])
            if (!seen.has(v)) {
              seen.add(v);
              q.push(v);
            }
        if (seen.size === size) best = Math.min(best, cost);
      }
      return [
        `${size} ${edges.length}\n${edges.map(([u, v, w]) => `${u + 1} ${v + 1} ${w}`).join("\n")}`,
        Number.isFinite(best) ? best : -1,
      ];
    }
    case "fenwick": {
      const current = [...a],
        ops = [],
        out = [];
      for (let i = 0; i < 20; i++) {
        if (R(2)) {
          const pos = R(n),
            delta = R(11) - 5;
          ops.push(`A ${pos + 1} ${delta}`);
          current[pos] += delta;
        } else {
          const l = R(n),
            r = l + R(n - l);
          ops.push(`S ${l + 1} ${r + 1}`);
          out.push(sum(current.slice(l, r + 1)));
        }
      }
      return [
        `${n} ${ops.length}\n${line(a)}\n${ops.join("\n")}`,
        out.join("\n"),
      ];
    }
    case "kmp": {
      const text = array(1 + R(25), () => String.fromCharCode(97 + R(3))).join(
          "",
        ),
        pattern = array(1 + R(7), () => String.fromCharCode(97 + R(3))).join(
          "",
        ),
        out = [];
      for (let i = 0; i + pattern.length <= text.length; i++)
        if (text.slice(i, i + pattern.length) === pattern) out.push(i + 1);
      return [text + "\n" + pattern, out.length ? line(out) : -1];
    }
    case "meeting-rooms": {
      const intervals = array(n, () => {
        const s = R(12);
        return [s, s + 1 + R(6)];
      });
      return [
        `${n}\n${intervals.map(line).join("\n")}`,
        Math.max(
          ...intervals.map(
            ([t]) => intervals.filter(([s, e]) => s <= t && t < e).length,
          ),
        ),
      ];
    }
    case "capacity": {
      const w = a.map((x) => Math.abs(x) + 1),
        days = 1 + R(n);
      let best = Infinity;
      for (let mask = 0; mask < 1 << (n - 1); mask++) {
        let used = 1,
          load = w[0],
          max = 0;
        for (let i = 1; i < n; i++) {
          if (mask & (1 << (i - 1))) {
            used++;
            max = Math.max(max, load);
            load = 0;
          }
          load += w[i];
        }
        if (used <= days) best = Math.min(best, Math.max(max, load));
      }
      return [`${n} ${days}\n${line(w)}`, best];
    }
    case "dag-paths": {
      const g = array(n, () => []),
        edges = [];
      for (let u = 0; u < n; u++)
        for (let v = u + 1; v < n; v++)
          if (R(3) === 0) {
            g[u].push(v);
            edges.push([u + 1, v + 1]);
          }
      function paths(u) {
        return u === n - 1 ? 1 : sum(g[u].map(paths));
      }
      return [`${n} ${edges.length}\n${edges.map(line).join("\n")}`, paths(0)];
    }
    case "tree-diameter": {
      const edges = array(n - 1, (i) => [i + 1, R(i + 1)]),
        g = array(n, (i) => array(n, (j) => (i === j ? 0 : Infinity)));
      for (const [u, v] of edges) g[u][v] = g[v][u] = 1;
      floyd(g);
      return [
        `${n}\n${edges.map(([u, v]) => `${u + 1} ${v + 1}`).join("\n")}`,
        Math.max(...g.flat()),
      ];
    }
    case "tsp": {
      const size = 1 + R(7),
        g = array(size, (i) => array(size, (j) => (i === j ? 0 : R(20))));
      let best = Infinity;
      permutations(
        array(size - 1, (i) => i + 1),
        (path) => {
          const full = [0, ...path, 0];
          let cost = 0;
          for (let i = 1; i < full.length; i++) cost += g[full[i - 1]][full[i]];
          best = Math.min(best, cost);
        },
      );
      return [`${size}\n${g.map(line).join("\n")}`, best];
    }
    case "fast-fibonacci": {
      const index = R(300);
      let a = 0n,
        b = 1n;
      for (let i = 0; i < index; i++) [a, b] = [b, (a + b) % 1000000007n];
      return [str(index), str(a)];
    }
    case "activity": {
      const intervals = array(n, () => {
        const s = R(10);
        return [s, s + 1 + R(6)];
      });
      let best = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        const selected = intervals
          .filter((_, i) => mask & (1 << i))
          .sort((a, b) => a[0] - b[0]);
        if (selected.every((v, i) => !i || selected[i - 1][1] <= v[0]))
          best = Math.max(best, selected.length);
      }
      return [`${n}\n${intervals.map(line).join("\n")}`, best];
    }
    case "arrows": {
      const intervals = array(n, () => {
          const s = R(10) - 3;
          return [s, s + R(6)];
        }),
        ends = intervals.map((x) => x[1]);
      let best = n;
      for (let mask = 0; mask < 1 << n; mask++) {
        const chosen = ends.filter((_, i) => mask & (1 << i));
        if (intervals.every(([l, r]) => chosen.some((x) => l <= x && x <= r)))
          best = Math.min(best, chosen.length);
      }
      return [`${n}\n${intervals.map(line).join("\n")}`, best];
    }
    case "jumps": {
      const xs = array(n, () => R(n + 1)),
        dist = new Array(n).fill(Infinity);
      dist[0] = 0;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n && j <= i + xs[i]; j++)
          dist[j] = Math.min(dist[j], dist[i] + 1);
      return [
        `${n}\n${line(xs)}`,
        Number.isFinite(dist[n - 1]) ? dist[n - 1] : -1,
      ];
    }
    case "cookies": {
      const size = 1 + R(6),
        m = 1 + R(6),
        g = array(size, () => 1 + R(8)),
        cookies = array(m, () => 1 + R(8));
      function match(i, mask) {
        if (i === size) return 0;
        let best = match(i + 1, mask);
        for (let j = 0; j < m; j++)
          if (!(mask & (1 << j)) && cookies[j] >= g[i])
            best = Math.max(best, 1 + match(i + 1, mask | (1 << j)));
        return best;
      }
      return [`${size} ${m}\n${line(g)}\n${line(cookies)}`, match(0, 0)];
    }
    case "merge-cost": {
      const xs = array(1 + R(6), () => 1 + R(10)),
        memo = new Map();
      function cost(values) {
        if (values.length < 2) return 0;
        const key = [...values].sort(numeric).join(",");
        if (memo.has(key)) return memo.get(key);
        let best = Infinity;
        for (let i = 0; i < values.length; i++)
          for (let j = i + 1; j < values.length; j++) {
            const merged = values[i] + values[j],
              rest = values.filter((_, k) => k !== i && k !== j);
            best = Math.min(best, merged + cost([...rest, merged]));
          }
        memo.set(key, best);
        return best;
      }
      return [`${xs.length}\n${line(xs)}`, cost(xs)];
    }
    case "candy": {
      const ratings = array(n, () => R(6)),
        c = new Array(n).fill(1);
      for (let pass = 0; pass < n; pass++)
        for (let i = 0; i < n; i++)
          for (const j of [i - 1, i + 1])
            if (j >= 0 && j < n && ratings[i] > ratings[j])
              c[i] = Math.max(c[i], c[j] + 1);
      return [`${n}\n${line(ratings)}`, sum(c)];
    }
    case "remove-digits": {
      const digits = str(1 + R(9)) + array(n - 1, () => str(R(10))).join(""),
        k = R(n + 1);
      let best = null;
      for (let mask = 0; mask < 1 << n; mask++) {
        const chars = [...digits].filter((_, i) => mask & (1 << i));
        if (chars.length !== n - k) continue;
        const x = chars.join("").replace(/^0+/, "") || "0";
        if (
          best === null ||
          x.length < best.length ||
          (x.length === best.length && x < best)
        )
          best = x;
      }
      return [digits + "\n" + k, best];
    }
    case "boats": {
      const limit = 1 + R(12),
        weights = array(n, () => 1 + R(limit)),
        memo = new Map();
      function boats(mask) {
        if (!mask) return 0;
        if (memo.has(mask)) return memo.get(mask);
        let i = 0;
        while (!(mask & (1 << i))) i++;
        const rest = mask ^ (1 << i);
        let best = 1 + boats(rest);
        for (let j = i + 1; j < n; j++)
          if (rest & (1 << j) && weights[i] + weights[j] <= limit)
            best = Math.min(best, 1 + boats(rest ^ (1 << j)));
        memo.set(mask, best);
        return best;
      }
      return [`${n} ${limit}\n${line(weights)}`, boats((1 << n) - 1)];
    }
    case "stairs": {
      const k = R(16);
      function ways(left) {
        return left === 0 ? 1 : left < 0 ? 0 : ways(left - 1) + ways(left - 2);
      }
      return [str(k), ways(k)];
    }
    case "house-robber": {
      const xs = a.map(Math.abs);
      let best = 0;
      for (let mask = 0; mask < 1 << n; mask++)
        if (!(mask & (mask << 1)))
          best = Math.max(best, sum(xs.filter((_, i) => mask & (1 << i))));
      return [`${n}\n${line(xs)}`, best];
    }
    case "grid-paths": {
      const rows = 1 + R(5),
        cols = 1 + R(5),
        g = array(rows, () => array(cols, () => (R(4) === 0 ? 1 : 0)));
      function ways(r, c) {
        if (r >= rows || c >= cols || g[r][c]) return 0;
        if (r === rows - 1 && c === cols - 1) return 1;
        return ways(r + 1, c) + ways(r, c + 1);
      }
      return [`${rows} ${cols}\n${g.map(line).join("\n")}`, ways(0, 0)];
    }
    case "max-subarray": {
      let best = -Infinity;
      for (let i = 0; i < n; i++)
        for (let j = i; j < n; j++)
          best = Math.max(best, sum(a.slice(i, j + 1)));
      return [`${n}\n${line(a)}`, best];
    }
    case "partition": {
      const xs = a.map(Math.abs),
        total = sum(xs);
      let found = false;
      for (let mask = 0; mask < 1 << n; mask++)
        if (sum(xs.filter((_, i) => mask & (1 << i))) * 2 === total)
          found = true;
      return [`${n}\n${line(xs)}`, found ? "YES" : "NO"];
    }
    case "palindrome-subsequence": {
      const text = array(n, () => String.fromCharCode(97 + R(3))).join("");
      let best = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        const selected = [...text].filter((_, i) => mask & (1 << i)).join("");
        if (selected === [...selected].reverse().join(""))
          best = Math.max(best, selected.length);
      }
      return [text, best];
    }
    case "stock-fee": {
      const prices = a.map(Math.abs),
        fee = R(6),
        memo = new Map();
      function profit(day, holding) {
        if (day === n) return holding ? -Infinity : 0;
        const key = day + ":" + holding;
        if (memo.has(key)) return memo.get(key);
        const best = Math.max(
          profit(day + 1, holding),
          holding
            ? prices[day] - fee + profit(day + 1, false)
            : -prices[day] + profit(day + 1, true),
        );
        memo.set(key, best);
        return best;
      }
      return [`${n} ${fee}\n${line(prices)}`, profit(0, false)];
    }
    case "coin-combinations": {
      const coins = [...new Set(array(1 + R(5), () => 1 + R(10)))],
        target = R(22);
      function ways(i, remaining) {
        if (i === coins.length) return remaining === 0 ? 1 : 0;
        let count = 0;
        for (let used = 0; used * coins[i] <= remaining; used++)
          count += ways(i + 1, remaining - used * coins[i]);
        return count;
      }
      return [`${coins.length} ${target}\n${line(coins)}`, ways(0, target)];
    }
    case "merge-sort":
      return [`${n}\n${line(a)}`, line([...a].sort(numeric))];
    case "stable-records": {
      const rows = a.map((score, i) => ({ score, name: "p" + i, index: i }));
      return [
        `${n}\n${rows.map((r) => r.score + " " + r.name).join("\n")}`,
        rows
          .sort((a, b) => a.score - b.score || a.index - b.index)
          .map((r) => r.name)
          .join(" "),
      ];
    }
    case "inversions": {
      let count = 0;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) if (a[i] > a[j]) count++;
      return [`${n}\n${line(a)}`, count];
    }
    case "sort-colors": {
      const xs = array(n, () => R(3));
      return [`${n}\n${line(xs)}`, line([...xs].sort(numeric))];
    }
    case "relative-sort": {
      const xs = array(n, () => R(7)),
        priority = [...new Set(xs)].filter(() => R(2));
      if (!priority.length) priority.push(xs[0]);
      const rank = new Map(priority.map((x, i) => [x, i]));
      const output = [...xs].sort(
        (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a - b,
      );
      return [
        `${n} ${priority.length}\n${line(xs)}\n${line(priority)}`,
        line(output),
      ];
    }
    case "largest-concat": {
      const xs = array(1 + R(6), () => str(R(130)));
      let best = "";
      permutations(xs, (items) => {
        const x = items.join("");
        if (x > best) best = x;
      });
      return [`${xs.length}\n${line(xs)}`, best.replace(/^0+/, "") || "0"];
    }
    case "merge-sorted": {
      const x = [...a].sort(numeric),
        y = array(R(9), () => R(15) - 5).sort(numeric);
      return [
        `${x.length} ${y.length}\n${line(x)}\n${line(y)}`,
        line([...x, ...y].sort(numeric)),
      ];
    }
    case "quickselect": {
      const k = 1 + R(n);
      return [`${n} ${k}\n${line(a)}`, [...a].sort(numeric)[k - 1]];
    }
    default:
      throw new Error("缺少独立算法测试生成器：" + id);
  }
}
function fibMatrix(n) {
  const mod = 1000000007n;
  let r = [1n, 0n, 0n, 1n],
    a = [1n, 1n, 1n, 0n],
    k = BigInt(n);
  const mul = (x, y) => [
    (x[0] * y[0] + x[1] * y[2]) % mod,
    (x[0] * y[1] + x[1] * y[3]) % mod,
    (x[2] * y[0] + x[3] * y[2]) % mod,
    (x[2] * y[1] + x[3] * y[3]) % mod,
  ];
  while (k) {
    if (k & 1n) r = mul(r, a);
    a = mul(a, a);
    k >>= 1n;
  }
  return str(r[1]);
}
function stressCase(id) {
  const n = 200000;
  switch (id) {
    case "range-sum": {
      const size = 100000;
      return [
        `${size} ${size}\n${line(array(size, () => 1))}\n${array(size, () => `1 ${size}`).join("\n")}`,
        array(size, () => str(size)).join("\n"),
      ];
    }
    case "lower-bound": {
      const size = 100000;
      return [
        `${size} ${size}\n${line(array(size, () => 5))}\n${array(size, (i) => 4 + (i % 3)).join("\n")}`,
        array(size, (i) => (i % 3 === 2 ? size + 1 : 1)).join("\n"),
      ];
    }
    case "grid-bfs": {
      const rows = 400,
        cols = 500,
        g = array(rows, () => ".".repeat(cols));
      g[0] = "S" + g[0].slice(1);
      g[rows - 1] = g.at(-1).slice(0, -1) + "T";
      return [`${rows} ${cols}\n${g.join("\n")}`, rows + cols - 2];
    }
    case "knapsack":
      return ["200 10000\n" + array(200, () => "1 1").join("\n"), 200];
    case "lcs":
      return ["a".repeat(1500) + "\n" + "a".repeat(1500), 1500];
    case "window-max": {
      const k = 100000;
      return [
        `${n} ${k}\n${line(array(n, (i) => i))}`,
        line(array(n - k + 1, (i) => i + k - 1)),
      ];
    }
    case "histogram":
      return [`${n}\n${line(array(n, () => 1000000000))}`, n * 1000000000];
    case "connectivity":
      return [
        `${n} ${n}\n${array(n - 1, (i) => `U ${i + 1} ${i + 2}`).join("\n")}\nQ 1 ${n}`,
        "YES",
      ];
    case "dijkstra": {
      const size = 50000,
        m = 100000,
        edges = [
          ...array(size - 1, (i) => `${i + 1} ${i + 2} 1000000000`),
          ...array(
            m - size + 1,
            (i) => `${(i % size) + 1} ${(i % size) + 1} 0`,
          ),
        ];
      return [
        `${size} ${m} 1\n${edges.join("\n")}`,
        line(array(size, (i) => i * 1000000000)),
      ];
    }
    case "mst": {
      const size = 50000,
        m = 100000,
        edges = [
          ...array(size - 1, (i) => `${i + 1} ${i + 2} 1000000000`),
          ...array(
            m - size + 1,
            (i) => `${(i % size) + 1} ${(i % size) + 1} 0`,
          ),
        ];
      return [`${size} ${m}\n${edges.join("\n")}`, (size - 1) * 1000000000];
    }
    case "fenwick": {
      const size = 100000,
        ops = array(size, (i) => (i % 2 ? `S 1 ${size}` : "A 1 1"));
      return [
        `${size} ${size}\n${line(array(size, () => 0))}\n${ops.join("\n")}`,
        array(size / 2, (i) => i + 1).join("\n"),
      ];
    }
    case "kmp":
      return [
        "a".repeat(n) + "\n" + "a".repeat(100000),
        line(array(100001, (i) => i + 1)),
      ];
    case "meeting-rooms":
      return ["100000\n" + array(100000, (i) => `${i} ${i + 1}`).join("\n"), 1];
    case "capacity":
      return ["100000 1\n" + line(array(100000, () => 1000000)), 100000000000];
    case "dag-paths": {
      const size = 100000,
        edges = [
          ...array(size - 1, (i) => [i + 1, i + 2]),
          ...array(size - 2, (i) => [i + 1, i + 3]),
          [1, 4],
          [2, 5],
          [3, 6],
        ],
        ways = [0, 1];
      for (let i = 2; i <= size; i++)
        ways[i] =
          (((ways[i - 1] + (ways[i - 2] || 0)) % MOD) +
            (i >= 4 && i <= 6 ? ways[i - 3] : 0)) %
          MOD;
      return [
        `${size} ${edges.length}\n${edges.map(line).join("\n")}`,
        ways[size],
      ];
    }
    case "tree-diameter":
      return [
        `${n}\n${array(n - 1, (i) => `${i + 1} ${i + 2}`).join("\n")}`,
        n - 1,
      ];
    case "tsp":
      return [
        "15\n" +
          array(15, (i) => line(array(15, (j) => (i === j ? 0 : 1)))).join(
            "\n",
          ),
        15,
      ];
    case "fast-fibonacci":
      return ["1000000000000000000", "209783453"];
    case "activity":
      return [
        "100000\n" + array(100000, (i) => `${i} ${i + 1}`).join("\n"),
        100000,
      ];
    case "arrows":
      return [
        "100000\n" + array(100000, (i) => `${i * 2} ${i * 2}`).join("\n"),
        100000,
      ];
    case "jumps":
      return [`${n}\n${line(array(n, () => 1))}`, n - 1];
    case "cookies":
      return [
        "100000 100000\n" +
          line(array(100000, () => 2)) +
          "\n" +
          line(array(100000, () => 1)),
        0,
      ];
    case "merge-cost": {
      const size = 100000,
        h = Math.ceil(Math.log2(size));
      return [
        size + "\n" + line(array(size, () => 1)),
        size * h - (2 ** h - size),
      ];
    }
    case "candy":
      return [`${n}\n${line(array(n, (i) => i))}`, (n * (n + 1)) / 2];
    case "remove-digits":
      return [
        "9".repeat(100000) + "1".repeat(100000) + "\n100000",
        "1".repeat(100000),
      ];
    case "boats":
      return [
        "100000 1000000000\n" + line(array(100000, () => 1000000000)),
        100000,
      ];
    case "stairs":
      return ["1000000", fibMatrix(1000001)];
    case "house-robber":
      return [
        `${n}\n${line(array(n, () => 1000000000))}`,
        (n / 2) * 1000000000,
      ];
    case "grid-paths": {
      const rows = 400,
        cols = 500;
      let choose = 1n;
      for (let i = 1; i <= rows - 1; i++)
        choose = (choose * BigInt(rows + cols - 2 - i + 1)) / BigInt(i);
      return [
        `${rows} ${cols}\n${array(rows, () => line(array(cols, () => 0))).join("\n")}`,
        str(choose % 1000000007n),
      ];
    }
    case "max-subarray":
      return [`${n}\n${line(array(n, () => 1000000000))}`, n * 1000000000];
    case "partition":
      return ["200\n" + line(array(200, () => 100)), "YES"];
    case "palindrome-subsequence":
      return ["a".repeat(1000), 1000];
    case "stock-fee":
      return [
        "100000 1\n" + line(array(100000, (i) => (i % 2 ? 1000000 : 1))),
        50000 * (1000000 - 1 - 1),
      ];
    case "coin-combinations":
      // Exact integer coefficient of product(1-x^k)^-1, k=1..50, at x^10000; reduced only after exact offline counting.
      return ["50 10000\n" + line(array(50, (i) => i + 1)), 783279696];
    case "merge-sort":
      return [
        `${n}\n${line(array(n, (i) => n - i))}`,
        line(array(n, (i) => i + 1)),
      ];
    case "stable-records": {
      const size = 100000;
      return [
        size + "\n" + array(size, (i) => `${i % 3} p${i}`).join("\n"),
        array(3, (k) =>
          array(size, (i) => i)
            .filter((i) => i % 3 === k)
            .map((i) => "p" + i)
            .join(" "),
        ).join(" "),
      ];
    }
    case "inversions":
      return [`${n}\n${line(array(n, (i) => n - i))}`, (n * (n - 1)) / 2];
    case "sort-colors": {
      const xs = array(n, (i) => 2 - (i % 3));
      return [`${n}\n${line(xs)}`, line([...xs].sort(numeric))];
    }
    case "relative-sort": {
      const xs = array(n, (i) => i % 1001),
        priority = array(1001, (i) => 1000 - i);
      return [
        `${n} 1001\n${line(xs)}\n${line(priority)}`,
        line([...xs].sort((a, b) => b - a)),
      ];
    }
    case "largest-concat":
      return [
        "10000\n" + line(array(10000, () => "9999999999")),
        "9".repeat(100000),
      ];
    case "merge-sorted":
      return [
        "100000 100000\n" +
          line(array(100000, (i) => 2 * i)) +
          "\n" +
          line(array(100000, (i) => 2 * i + 1)),
        line(array(n, (i) => i)),
      ];
    case "quickselect":
      return [`${n} 100000\n${line(array(n, () => 7))}`, 7];
    default:
      throw new Error("缺少大规模数据：" + id);
  }
}
export function generatedAcmCases(labId) {
  const id = labId.replace(/^acm-/, ""),
    R = rng(id),
    rows = [];
  for (let i = 0; i < ACM_RANDOM_CASES; i++) {
    const [input, output] = randomCase(id, R);
    rows.push({
      name: `随机对照 ${i + 1} · 固定种子`,
      kind: "random",
      input,
      output: str(output),
    });
  }
  const [input, output] = stressCase(id);
  rows.push({
    name: "约束上限 · 规模与数值边界",
    kind: "stress",
    input,
    output: str(output),
  });
  return rows;
}
export function acmJudgeCount(lab) {
  return lab.tests.length + (lab.mode === "stdin" ? ACM_RANDOM_CASES + 1 : 0);
}
