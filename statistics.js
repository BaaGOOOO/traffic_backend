// backend/statistics.js
const express = require('express');
const router = express.Router();
const pool = require('./db'); // itt csatlakozol az adatbázishoz

router.get('/statistics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT accident_type, COUNT(*) AS count
      FROM accidents
      GROUP BY accident_type
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Hiba történt' });
  }
});

module.exports = router;
