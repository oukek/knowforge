export const tableColumns = {
  progress: ["id", "status", "updatedAt"],
  notes: ["id", "content", "updatedAt"],
  bookmarks: ["id", "createdAt"],
  attempts: [
    "id",
    "questionId",
    "kind",
    "answer",
    "score",
    "passed",
    "createdAt",
  ],
  reviews: [
    "questionId",
    "dueAt",
    "intervalDays",
    "streak",
    "lastRating",
    "wrong",
    "updatedAt",
  ],
  exams: ["id", "payload"],
  settings: ["key", "value"],
  lesson_attempts: [
    "id",
    "exerciseId",
    "lessonId",
    "type",
    "answer",
    "passed",
    "passedTests",
    "totalTests",
    "createdAt",
  ],
  activity: ["day", "actions"],
};

export function serialSession(execute) {
  let tail = Promise.resolve();
  return async (callback) => {
    const previous = tail;
    let unlock;
    tail = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      return await execute(callback);
    } finally {
      unlock();
    }
  };
}

export function buildUpsert(
  driver,
  table,
  row,
  options = {},
  prefix = "",
  userId,
) {
  const schema = tableColumns[table];
  if (!schema) throw new Error("Unknown study table");
  const columns = Object.keys(row);
  if (
    !columns.length ||
    columns.some((c) => !schema.includes(c)) ||
    !columns.includes(schema[0])
  )
    throw new Error("Invalid study row");
  const quote = (value) => "`" + value + "`";
  const args = columns.map((c) => row[c]);
  const conflict = userId ? `\`userId\`,${quote(schema[0])}` : quote(schema[0]);
  if (userId) {
    columns.unshift("userId");
    args.unshift(userId);
  }
  let sql = `INSERT INTO ${quote(prefix + table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
  if (options.ignore) {
    sql +=
      driver === "mysql"
        ? ` ON DUPLICATE KEY UPDATE ${quote(schema[0])}=${quote(schema[0])}`
        : ` ON CONFLICT(${conflict}) DO NOTHING`;
  } else {
    const updates = columns
      .filter((c) => c !== schema[0] && c !== "userId")
      .map((column) => {
        args.push(row[column]);
        if (options.increment?.includes(column))
          return `${quote(column)}=${quote(column)}+?`;
        if (options.max?.includes(column))
          return `${quote(column)}=${driver === "mysql" ? "GREATEST" : "MAX"}(${quote(column)},?)`;
        return `${quote(column)}=?`;
      });
    if (!updates.length) throw new Error("No study fields to update");
    sql +=
      (driver === "mysql"
        ? " ON DUPLICATE KEY UPDATE "
        : ` ON CONFLICT(${conflict}) DO UPDATE SET `) + updates.join(",");
  }
  return { sql, args };
}

export function studyStore(engine) {
  const store = {
    ...engine,
    upsert(table, row, options) {
      const { sql, args } = buildUpsert(
        engine.driver,
        table,
        row,
        options,
        engine.prefix || "",
        engine.userId,
      );
      return (engine.writeRow || engine.run)(sql, ...args);
    },
    async state() {
      const [
        progress,
        notes,
        bookmarks,
        attempts,
        exerciseAttempts,
        reviews,
        exams,
        settings,
        activity,
      ] = await Promise.all([
        engine.all("SELECT * FROM progress"),
        engine.all("SELECT * FROM notes"),
        engine.all("SELECT id FROM bookmarks"),
        engine.all("SELECT * FROM attempts ORDER BY id DESC LIMIT 5000"),
        engine.all("SELECT * FROM lesson_attempts ORDER BY id DESC LIMIT 5000"),
        engine.all("SELECT * FROM reviews"),
        engine.all("SELECT payload FROM exams"),
        engine.all("SELECT * FROM settings"),
        engine.all("SELECT * FROM activity ORDER BY day"),
      ]);
      return {
        progress: Object.fromEntries(progress.map((x) => [x.id, x])),
        notes: Object.fromEntries(notes.map((x) => [x.id, x])),
        bookmarks: bookmarks.map((x) => x.id),
        attempts: attempts.map((x) => ({
          ...x,
          answer: JSON.parse(x.answer),
          passed: !!x.passed,
        })),
        exerciseAttempts: exerciseAttempts.map((x) => ({
          ...x,
          passed: !!x.passed,
        })),
        reviews,
        exams: exams
          .map((x) => JSON.parse(x.payload))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        settings: Object.fromEntries(
          settings.map((x) => [x.key, JSON.parse(x.value)]),
        ),
        activity,
      };
    },
    touch(now) {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
      return store.upsert(
        "activity",
        { day, actions: 1 },
        { increment: ["actions"] },
      );
    },
    async schedule(questionId, rating, wrong, now = new Date().toISOString()) {
      const old = await engine.get(
        "SELECT * FROM reviews WHERE questionId=?",
        questionId,
      );
      const { intervalDays, streak, dueAt } = scheduleReview(old, rating, now);
      await store.upsert("reviews", {
        questionId,
        dueAt,
        intervalDays,
        streak,
        lastRating: rating,
        wrong: wrong ? 1 : 0,
        updatedAt: now,
      });
    },
  };
  if (!engine.userId) store.forUser = (id) => personalStore(engine, id);
  return store;
}

function personalStore(root, userId) {
  if (!/^[a-f0-9-]{36}$/.test(userId)) throw new Error("Invalid account ID");
  const prefix = (root.prefix || "") + "user_";
  function scoped(sql, args) {
    // Only the app's simple single-table statements are accepted here.
    // Never accept a raw table identifier or condition from a browser.
    const match = sql.match(
      /^(SELECT .+? FROM|DELETE FROM|UPDATE|INSERT INTO) (\w+)/i,
    );
    if (
      !match ||
      !tableColumns[match[2]] ||
      /[;]|\b(JOIN|UNION|OR)\b/i.test(sql)
    )
      throw new Error("Unsupported personal query");
    const table = "`" + prefix + match[2] + "`";
    sql = sql.replace(match[0], match[1] + " " + table);
    if (match[1] === "INSERT INTO") {
      sql = sql
        .replace(table + "(", table + "(userId,")
        .replace("VALUES(", "VALUES(?,");
      args = [userId, ...args];
    } else {
      const boundary = sql.search(/\s+(ORDER BY|LIMIT)\b/i);
      const head = boundary === -1 ? sql : sql.slice(0, boundary);
      const tail = boundary === -1 ? "" : sql.slice(boundary);
      sql =
        head +
        (/\bWHERE\b/i.test(head) ? " AND" : " WHERE") +
        " userId=?" +
        tail;
      args = [...args, userId];
    }
    return { sql, args };
  }
  const query =
    (method) =>
    async (sql, ...args) => {
      const request = scoped(sql, args);
      const result = await root[method](request.sql, ...request.args);
      const strip = (row) => {
        if (!row) return row;
        const { userId: _, ...data } = row;
        return data;
      };
      return method === "all"
        ? result.map(strip)
        : method === "get"
          ? strip(result)
          : result;
    };
  return studyStore({
    driver: root.driver,
    prefix,
    userId,
    all: query("all"),
    get: query("get"),
    run: query("run"),
    writeRow: root.run,
    exec: root.exec,
  });
}

export function scheduleReview(old, rating, now) {
  const prev = old?.intervalDays || 0;
  const intervalDays =
    rating === 0
      ? 10 / 1440
      : rating === 1
        ? 1
        : rating === 2
          ? Math.max(2, Math.round(prev * 1.8))
          : Math.max(4, Math.round(prev * 2.5));
  return {
    intervalDays,
    streak: rating < 2 ? 0 : (old?.streak || 0) + 1,
    dueAt: new Date(Date.parse(now) + intervalDays * 86400000).toISOString(),
  };
}
