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

try {
  console.log("Supabase PostgreSQL bağlantısı test ediliyor...");

  const start = Date.now();

  await client.connect();

  console.log(`Bağlantı süresi: ${Date.now() - start} ms`);

  for (let i = 1; i <= 5; i++) {
    const queryStart = Date.now();

    const result = await client.query(
      "SELECT NOW() AS now"
    );

    console.log(
      `Sorgu ${i}: ${Date.now() - queryStart} ms | ${result.rows[0].now}`
    );
  }

  console.log("✅ TÜM SORGULAR BAŞARILI");
} catch (error) {
  console.error("❌ BAĞLANTI/SORGU BAŞARISIZ");
  console.error("Code:", error.code);
  console.error("Message:", error.message);
} finally {
  await client.end().catch(() => {});
}