require('dotenv').config();
const express = require('express');
const pool = require('./db');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const jwt = require('jsonwebtoken');  // importálni kell a jwt modult
const { verifyToken, isAdmin } = require('./auth');  // importáljuk a middleware-eket

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const authRoutes = require('./auth');
app.use('/api', authRoutes); // ✅



async function getCoordinates(address) {
  try {
      const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json`, {
          params: {
              address: address,
              key: GOOGLE_API_KEY
          }
      });
      if (response.data.results.length > 0) {
          const location = response.data.results[0].geometry.location;
          return { lat: location.lat, lng: location.lng };
      } else {
          return { lat: null, lng: null };
      }
  } catch (error) {
      console.error("Hiba a Google Geocoding API lekérésekor:", error);
      return { lat: null, lng: null };
  }
}




// Frissíti a balesetekhez tartozó koordinátákatapp.get('/update-coordinates', async (req, res) => {
   // Frissíti a balesetekhez tartozó koordinátákat
// Csak azokhoz rendel koordinátát, ahol még nincs
app.get('/update-coordinates', async (req, res) => {
  try {
    const accidents = await pool.query(`
      SELECT accidents_ID, location, city 
      FROM Accidents 
      WHERE latitude IS NULL OR longitude IS NULL
    `);

    for (let accident of accidents.rows) {
      const fullAddress = `${accident.location}, ${accident.city}`;
      const coords = await getCoordinates(fullAddress);

      if (coords.lat && coords.lng) {
        await pool.query(
          'UPDATE Accidents SET latitude = $1, longitude = $2 WHERE accidents_ID = $3',
          [coords.lat, coords.lng, accident.accidents_id]
        );
      }
    }

    res.send('✅ Csak hiányzó koordináták frissítve!');
  } catch (error) {
    console.error("❌ Koordináta frissítési hiba:", error);
    res.status(500).send('❌ Hiba a koordináták frissítésekor.');
  }
});







app.get('/accidents', async (req, res) => {
    const { city, date, accident_type } = req.query;

    let query = "SELECT * FROM Accidents WHERE 1=1";
    let values = [];

    if (city) {
        query += " AND city = $1";
        values.push(city);
    }
    if (date) {
        query += values.length ? " AND DATE(date) = $" + (values.length + 1) : " AND DATE(date) = $1";
        values.push(date);
    }
    if (accident_type && accident_type !== "Összes") {
        query += values.length ? " AND accident_type = $" + (values.length + 1) : " AND accident_type = $1";
        values.push(accident_type);
    }

    try {
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error("Hiba az adatok lekérésekor:", error);
        res.status(500).json({ error: "Hiba történt" });
    }
});
app.get('/statistics/filtered', async (req, res) => {
    const { from, to, types } = req.query;

    let query = `
        SELECT accident_type, COUNT(*) AS count
        FROM accidents
        WHERE 1=1
    `;
    const values = [];
    let index = 1;

    if (from) {
        query += ` AND date >= $${index++}`;
        values.push(from);
    }

    if (to) {
        query += ` AND date <= $${index++}`;
        values.push(to);
    }

    if (types && types.trim() !== '') {
        const typesList = types.split(',').map(t => t.trim()).filter(t => t !== '');
        if (typesList.length > 0) {
            const placeholders = typesList.map((_, i) => `$${index + i}`).join(',');
            query += ` AND accident_type IN (${placeholders})`;
            values.push(...typesList);
            index += typesList.length;
        }
    }

    query += ` GROUP BY accident_type`;

    try {
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error("❌ Hiba a szűrt statisztikáknál:", error);
        res.status(500).json({ error: "Hiba történt a statisztikai adatok lekérésekor." });
    }
});



app.get('/statistics/city-count', async (req, res) => {
    const { from, to, types } = req.query;
  
    let query = `
      SELECT city, COUNT(*) AS count
      FROM accidents
      WHERE 1=1
    `;
    const values = [];
    let index = 1;
  
    if (from) {
      query += ` AND date >= $${index++}`;
      values.push(from);
    }
  
    if (to) {
      query += ` AND date <= $${index++}`;
      values.push(to);
    }
  
    if (types) {
      const typeList = types.split(',');
      const placeholders = typeList.map((_, i) => `$${index + i}`).join(',');
      query += ` AND accident_type IN (${placeholders})`;
      values.push(...typeList);
      index += typeList.length;
    }
  
    query += ` GROUP BY city ORDER BY count DESC`;
  
    try {
      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Városonkénti statisztikai hiba:", error);
      res.status(500).json({ error: "Hiba történt a városi statisztikai adatok lekérésekor." });
    }
  });
  

  app.get('/statistics/by-hour', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT EXTRACT(HOUR FROM time) AS hour, COUNT(*) AS count
        FROM accidents
        WHERE time IS NOT NULL
        GROUP BY hour
        ORDER BY hour
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Hiba az óránkénti statisztikánál:", error);
      res.status(500).json({ error: "Hiba az óránkénti statisztika lekérésekor" });
    }
  });
   
// server.js vagy statistics route része
app.get('/statistics/top-days', async (req, res) => {
    try {
      const result = await pool.query(`
       SELECT DATE(date) AS day, COUNT(*) AS count
        FROM accidents
        GROUP BY day
        ORDER BY count DESC
        LIMIT 5;
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("❌ Hiba a top napok lekérdezésénél:", error);
      res.status(500).json({ error: "Hiba a lekérdezés során." });
    }
  });
  
  app.get('/statistics/weather-impact', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT w.weather_type, COUNT(*) AS balesetek_szama
        FROM accidents a
        JOIN weather w ON a.weather_id = w.weather_id
        GROUP BY w.weather_type
        ORDER BY balesetek_szama DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("Hiba az időjárás stat lekérdezésekor:", err);
      res.status(500).json({ error: 'Szerver hiba' });
    }
  });
  

app.get('/cities', async (req, res) => {
    try {
        const result = await pool.query("SELECT DISTINCT city FROM Accidents WHERE city IS NOT NULL ORDER BY city ASC");
        res.json(result.rows.map(row => row.city));
    } catch (error) {
        console.error("Hiba a városok lekérésekor:", error);
        res.status(500).json({ error: "Hiba történt" });
    }
});


// Időjárás típusok lekérése a frontend számára
app.get('/weather', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT weather_type FROM weather');
    res.json(result.rows.map(row => row.weather_type));
  } catch (error) {
    console.error("❌ Hiba az időjárás lekérésekor:", error);
    res.status(500).json({ error: "Hiba történt az időjárás lekérdezésénél." });
  }
});


// GET /api/weather-types – csak egyedi időjárás típusokat ad vissza
app.get('/api/weather-types', async (req, res) => {
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




// POST /api/accidents/add
app.post('/api/accidents/add', async (req, res) => {
  const { location, city, date, time, accident_type, weather_id } = req.body;

  try {
    // 👇 Koordináták lekérése
    const fullAddress = `${location}, ${city}`;
    const coords = await getCoordinates(fullAddress);

    const result = await pool.query(`
      INSERT INTO accidents (location, city, date, time, accident_type, weather_id, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [location, city, date, time, accident_type, weather_id, coords.lat, coords.lng]);

    res.status(201).json({ message: '✅ A baleset sikeresen rögzítve lett!' });
  } catch (error) {
    console.error("❌ Hiba baleset rögzítésekor:", error);
    res.status(500).json({ error: '❌ Hiba a baleset rögzítésekor.' });
  }
});

/////////////////////////////////////////

// Baleset törlése
app.delete('/api/accidents/:id', async (req, res) => {
  const { id } = req.params;
  try {
      await pool.query('DELETE FROM accidents WHERE accidents_ID = $1', [id]);
      res.status(200).json({ message: '✅ Baleset törölve!' });
  } catch (error) {
      console.error('❌ Hiba a baleset törlésénél:', error);
      res.status(500).json({ error: '❌ Hiba történt a baleset törlésekor.' });
  }
});


// Baleset módosítása
app.put('/api/accidents/:id', async (req, res) => {
  const { id } = req.params;
  const { location, city, date, time, accident_type, weather_id } = req.body;
  try {
      const result = await pool.query(
          `UPDATE accidents SET location = $1, city = $2, date = $3, time = $4, accident_type = $5, weather_id = $6
          WHERE accidents_ID = $7`,
          [location, city, date, time, accident_type, weather_id, id]
      );
      res.status(200).json({ message: '✅ Baleset módosítva!' });
  } catch (error) {
      console.error('❌ Hiba a baleset módosításakor:', error);
      res.status(500).json({ error: '❌ Hiba történt a baleset módosítása során.' });
  }
});


// Baleset visszaállítása
app.post('/api/accidents/restore/:id', async (req, res) => {
  const { id } = req.params;
  try {
      // Ha valamilyen rendszerben van "törölt" állapot, akkor visszaállíthatjuk azt.
      const result = await pool.query('UPDATE accidents SET deleted_at = NULL WHERE accidents_ID = $1', [id]);
      res.status(200).json({ message: '✅ Baleset visszaállítva!' });
  } catch (error) {
      console.error('❌ Hiba a baleset visszaállításakor:', error);
      res.status(500).json({ error: '❌ Hiba történt a baleset visszaállítása során.' });
  }
});

// Statikus szűrés
app.get('/api/statistics', async (req, res) => {
  const { from, to, type } = req.query;

  let query = "SELECT * FROM accidents WHERE 1=1";
  let params = [];

  if (from) {
    query += " AND date >= $1";
    params.push(from);
  }

  if (to) {
    query += " AND date <= $2";
    params.push(to);
  }

  if (type) {
    query += " AND accident_type = $3";
    params.push(type);
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Hiba a statisztikai adatok lekérésekor:", err);
    res.status(500).json({ error: '❌ Hiba történt a statisztikák lekérésénél.' });
  }
});

// Rendszerbeállítások módosítása
app.post('/api/settings', async (req, res) => {
  const { weather_type, accident_type } = req.body;
  try {
    await pool.query('INSERT INTO system_settings (weather_type, accident_type) VALUES ($1, $2)', [weather_type, accident_type]);
    res.status(201).json({ message: '✅ Rendszerbeállítások mentve!' });
  } catch (error) {
    console.error('❌ Hiba a beállítások mentésénél:', error);
    res.status(500).json({ error: '❌ Hiba történt a rendszerbeállítások mentésekor.' });
  }
});

// Statikus szűrés
app.get('/api/statistics', async (req, res) => {
  const { from, to, type } = req.query;

  let query = "SELECT * FROM accidents WHERE 1=1";
  let params = [];

  if (from) {
    query += " AND date >= $1";
    params.push(from);
  }

  if (to) {
    query += " AND date <= $2";
    params.push(to);
  }

  if (type) {
    query += " AND accident_type = $3";
    params.push(type);
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Hiba a statisztikai adatok lekérésekor:", err);
    res.status(500).json({ error: '❌ Hiba történt a statisztikák lekérésénél.' });
  }
});


// Rendszerbeállítások módosítása
app.post('/api/settings', async (req, res) => {
  const { weather_type, accident_type } = req.body;
  try {
    await pool.query('INSERT INTO system_settings (weather_type, accident_type) VALUES ($1, $2)', [weather_type, accident_type]);
    res.status(201).json({ message: '✅ Rendszerbeállítások mentve!' });
  } catch (error) {
    console.error('❌ Hiba a beállítások mentésénél:', error);
    res.status(500).json({ error: '❌ Hiba történt a rendszerbeállítások mentésekor.' });
  }
});

// Balesetek lekérése admin felhasználók számára
app.get('/api/admin/accidents', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(403).json({ error: 'Nincs jogosultságod.' });
  }

  // Itt validálhatod a felhasználó szerepét a tokenből (pl. JWT)
  try {
    // Ellenőrzés: Csak adminok számára
    const user = await verifyToken(token);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Csak admin jogosultsággal rendelkező felhasználók férhetnek hozzá.' });
    }

    // Balesetek lekérése
    const result = await pool.query("SELECT * FROM accidents");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ Hiba a balesetek lekérésénél:", error);
    res.status(500).json({ error: "Hiba történt a balesetek lekérésekor." });
  }
});

// Admin jogosultság ellenőrzés
function checkAdminPermission(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(403).json({ message: 'Nincs jogosultságod.' });
  }
  
  const decoded = jwt.decode(token.replace('Bearer ', ''));
  if (!decoded || decoded.role !== 'admin') {
    return res.status(403).json({ message: 'Csak admin jogosultsággal rendelkező felhasználók férhetnek hozzá.' });
  }
  
  next();  // Ha admin, folytatjuk a balesetek lekérését
}

// Balesetek lekérése (admin jogosultság ellenőrzése)
app.get('/api/admin/accidents', checkAdminPermission, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM accidents");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ Hiba a balesetek lekérésénél:", error);
    res.status(500).json({ error: "Hiba történt a balesetek lekérésekor." });
  }
});

// Baleset törlésének engedélyezése (admin jogosultság)
app.delete('/api/admin/accidents/:id', checkAdminPermission, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM accidents WHERE accidents_ID = $1', [id]);
    res.status(200).json({ message: '✅ Baleset törölve!' });
  } catch (error) {
    console.error("❌ Hiba a baleset törlésénél:", error);
    res.status(500).json({ error: '❌ Hiba történt a baleset törlésekor.' });
  }
});



app.listen(PORT, () => {
  console.log(`✅ Szerver fut: http://localhost:${PORT}`);
});
