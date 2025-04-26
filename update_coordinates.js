const axios = require('axios');
const { Client } = require('pg');

const API_KEY = 'AIzaSyCAc-okFQvSXrVpjAndBQPupteDCEiVuRc';
const client = new Client({
    connectionString: 'postgresql://traffic_analysis_db_user:EGxIn5idzWGG95hMsoN4LuIF4Tlq1rKG@dpg-d06flbc9c44c73fgnodg-a.frankfurt-postgres.render.com/traffic_analysis_db',
    ssl: {
      rejectUnauthorized: false,
    },
  });
  

async function updateCoordinates() {
    await client.connect();
    
    const res = await client.query("SELECT accidents_id, location, city FROM accidents WHERE latitude IS NULL OR longitude IS NULL");
    
    console.log(`Frissítendő rekordok száma: ${res.rows.length}`);

    for (let row of res.rows) {
        // Ha van city, akkor belefoglaljuk a címbe
        const address = encodeURIComponent(`${row.location}, ${row.city}, ${row.postal_code}, Hungary`);

            
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${API_KEY}`;
        
        try {
            const response = await axios.get(url);
            console.log("🔍 API válasz:", JSON.stringify(response.data, null, 2)); // API válasz kiírása
            if (response.data.results.length > 0) {
                const { lat, lng } = response.data.results[0].geometry.location;
                await client.query("UPDATE Accidents SET latitude = $1, longitude = $2 WHERE accidents_ID = $3", [lat, lng, row.accidents_id]);
                console.log(`✅ Frissítve: ${row.location}, ${row.city} -> ${lat}, ${lng}`);
            } else {
                console.log(`⚠️ Nincs találat: ${row.location}, ${row.city}`);
            }
        } catch (error) {
            console.error(`❌ Hiba történt: ${row.location}, ${row.city}`, error);
        }
        
    }
    
    await client.end();
}

updateCoordinates();
