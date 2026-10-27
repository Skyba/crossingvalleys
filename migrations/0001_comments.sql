-- Comments written on the static site (the WordPress ones are in content/*/comments.json).
-- parent is the id of the comment replied to as it appears in the page: a WordPress id ("1086") or "n" + a row id here ("n5").
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  parent TEXT,
  author TEXT NOT NULL,
  url TEXT,
  body TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ip TEXT
);
CREATE INDEX comments_page ON comments (page, created);
CREATE INDEX comments_ip ON comments (ip, created);
