const db = require('../db');

async function createLog(log) {
  const {
    staffDiscordId,
    staffName,
    targetDiscordId,
    targetName,
    action,
    reason,
    pinned = false
  } = log;

  await db.query(
    `INSERT INTO logs (
      staff_discord_id,
      staff_name,
      target_discord_id,
      target_name,
      action,
      reason,
      pinned
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [staffDiscordId, staffName, targetDiscordId, targetName, action, reason, pinned]
  );
}

async function getRecentLogs(limit = 50) {
  const result = await db.query(
    `SELECT * FROM logs
     ORDER BY pinned DESC, created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function deleteLogById(id) {
  await db.query(`DELETE FROM logs WHERE id = $1`, [id]);
}

module.exports = {
  createLog,
  getRecentLogs,
  deleteLogById
};