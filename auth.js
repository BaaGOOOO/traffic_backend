const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');

// 🔐 REGISZTRÁCIÓ
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
      [username, email, hashedPassword, 'user', false]
    );

    res.json({ userId: result.rows[0].user_id });
  } catch (error) {
    console.error("❌ REGISZTRÁCIÓS HIBA:", error.message);
    res.status(500).json({ error: "Hiba a regisztráció során." });
  }
});

// 🔐 BEJELENTKEZÉS
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Hibás felhasználónév vagy jelszó.' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Hibás felhasználónév vagy jelszó.' });
    }

    // ➕ tokenbe belerakjuk a user szerepét
    const token = jwt.sign(
      { userId: user.user_id, role: user.role, username: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      message: 'Sikeres bejelentkezés!',
      token,
      role: user.role,
      username: user.name
    });
  } catch (err) {
    console.error('❌ Bejelentkezési hiba:', err);
    res.status(500).json({ message: 'Hiba a bejelentkezés során.' });
  }
});

// 🔒 Token validálás függvény
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET); // Titkosításhoz használt kulcsot itt használd
  } catch (err) {
    throw new Error('Érvénytelen token');
  }
}

// 🔒 ADMIN jogosultság middleware
function isAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Nincs token megadva.' });

    const token = authHeader.split(' ')[1];  // Az 'Authorization' headerből kinyerjük a token-t
    const decoded = verifyToken(token);  // Használjuk a verifyToken függvényt

    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Nincs jogosultságod az admin felülethez.' });
    }

    next();  // Ha admin, folytatjuk
  } catch (err) {
    return res.status(401).json({ message: 'Érvénytelen token.' });
  }
}

// 🔐 Admin adatlekérés (csak adminoknak)
router.get('/admin/data', isAdmin, async (req, res) => {
  const result = await pool.query('SELECT user_id, name, email, role FROM users');
  res.json(result.rows);
});

// 🔒 Új user hozzáadása admin által
router.post('/admin/user', isAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hashed, role]
    );
    res.json({ message: 'Felhasználó hozzáadva!' });
  } catch (err) {
    console.error('❌ Admin user hozzáadási hiba:', err);
    res.status(500).json({ error: 'Hiba történt a felhasználó hozzáadásakor.' });
  }
});

// 🔄 Szerep módosítása
router.patch('/admin/user/:id/role', isAdmin, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  try {
    await pool.query('UPDATE users SET role = $1 WHERE user_id = $2', [role, userId]);
    res.json({ message: 'Szerep frissítve!' });
  } catch (err) {
    console.error('❌ Szerep frissítési hiba:', err);
    res.status(500).json({ error: 'Hiba a szerep módosítása során.' });
  }
});

// ❌ Törlés
router.delete('/admin/user/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    res.json({ message: 'Felhasználó törölve!' });
  } catch (err) {
    console.error('❌ Törlési hiba:', err);
    res.status(500).json({ error: 'Hiba a törlés során.' });
  }
});

// időkéréses adat (pl. időjárás típusok lekérése) API
router.get('/weather-types', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (weather_type) weather_id, weather_type
      FROM weather
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Hiba az időjárás típusok lekérdezésénél:', err);
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

module.exports = router;
