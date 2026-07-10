DROP TABLE IF EXISTS verification_codes;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  filesize INTEGER NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  r2_path TEXT NOT NULL,
  expires_at DATETIME,
  sender_ip TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  downloads INTEGER DEFAULT 0,
  max_downloads INTEGER DEFAULT 0,
  is_text INTEGER DEFAULT 0,
  text_content TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0
);

CREATE INDEX idx_files_code ON files(code);
CREATE INDEX idx_files_key ON files(key);
CREATE INDEX idx_files_expires ON files(expires_at);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_vc_email ON verification_codes(email);
