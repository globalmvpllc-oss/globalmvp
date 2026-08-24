import pg from "pg";
import "dotenv/config";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DIRECT_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 30000,
});

const url = new URL(process.env.DIRECT_URL);

console.log("USER:", url.username);
console.log("HOST:", url.hostname);
console.log("PORT:", url.port);

try {
  console.log("Supabase PostgreSQL bağlantısı test ediliyor...");

  const start = Date.now();

  await client.connect();

  const connectTime = Date.now() - start;

  console.log(`⏱️ Bağlantı süresi: ${connectTime} ms`);

  const result = await client.query("SELECT NOW() AS now");

  console.log("✅ BAĞLANTI BAŞARILI");
  console.log("Database zamanı:", result.rows[0].now);

  if (connectTime > 5000) {
    console.log("⚠️ Bağlantı 5 saniyeden uzun sürdü.");
  } else {
    console.log("✅ Bağlantı 5 saniyeden kısa sürdü.");
  }
} catch (error) {
  console.error("❌ BAĞLANTI BAŞARISIZ");
  console.error("Code:", error.code);
  console.error("Message:", error.message);
} finally {
  await client.end().catch(() => {});
}