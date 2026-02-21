require("dotenv").config();
const { db } = require("../lib/db");

async function makeAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node src/scripts/make-admin.js <email>");
    process.exit(1);
  }

  const result = await db.execute({
    sql: "UPDATE users SET role = 'admin' WHERE email = ?",
    args: [email],
  });

  if (result.rowsAffected === 0) {
    console.error(`User "${email}" not found`);
    process.exit(1);
  }

  console.log(`User "${email}" is now admin`);
  process.exit(0);
}

makeAdmin().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
