const pool = require('./db');

const hourWeights = [
  0.5, 0.5, 0.5, 0.5, 0.5, // 0-4
  1.0, 1.5, 1.5,           // 5-7
  1.2, 1.2, 1.2,           // 8-10
  1.3, 1.3, 1.3,           // 11-13
  2.0, 2.0, 2.0, 2.0,      // 14-17
  1.0, 1.0, 1.0,           // 18-20
  0.8, 0.8                // 21-22
];

const generateTimes = async () => {
  try {
    const { rows } = await pool.query('SELECT accidents_id FROM accidents');
    const ids = rows.map(row => row.accidents_id);

    // Total súly
    const totalWeight = hourWeights.reduce((sum, w) => sum + w, 0);
    const total = ids.length;

    // Arányosítsuk hány baleset jusson egy-egy órára
    const accidentsPerHour = hourWeights.map(w => Math.floor((w / totalWeight) * total));

    // Kicsit korrigálunk (ha kevesebb jött ki mint az összes)
    while (accidentsPerHour.reduce((a, b) => a + b, 0) < total) {
      const i = Math.floor(Math.random() * 24);
      accidentsPerHour[i]++;
    }

    const shuffledIds = ids.sort(() => Math.random() - 0.5);
    let idIndex = 0;

    for (let hour = 0; hour < 24; hour++) {
      for (let i = 0; i < accidentsPerHour[hour]; i++) {
        if (idIndex >= shuffledIds.length) break;

        const id = shuffledIds[idIndex++];
        const minutes = Math.floor(Math.random() * 60);
        const seconds = Math.floor(Math.random() * 60);
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        await pool.query('UPDATE accidents SET time = $1 WHERE accidents_id = $2', [timeStr, id]);
        console.log(`✅ ID ${id} → ${timeStr}`);
      }
    }

    console.log("🎯 Valósághű időpontok generálva.");
    process.exit();
  } catch (err) {
    console.error("❌ Hiba:", err);
    process.exit(1);
  }
};

generateTimes();
