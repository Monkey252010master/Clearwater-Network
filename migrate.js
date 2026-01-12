const db = require('./db');

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      staff_discord_id TEXT NOT NULL,
      staff_name TEXT,
      target_discord_id TEXT,
      target_name TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      actor_discord_id TEXT,
      actor_name TEXT,
      type TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Migration complete");
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});