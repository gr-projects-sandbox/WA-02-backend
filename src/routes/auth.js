const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { db } = require("../lib/db");

const router = Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email i haslo sa wymagane" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Haslo musi miec min. 6 znakow" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      args: [email, hash],
    });

    const id = Number(result.lastInsertRowid);
    const role = "user";
    const token = jwt.sign({ id, email, role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ token, user: { id, email, role } });
  } catch (err) {
    if (err.message?.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "Email juz zarejestrowany" });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Blad rejestracji" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email i haslo sa wymagane" });
  }

  try {
    const result = await db.execute({
      sql: "SELECT id, email, password_hash, role FROM users WHERE email = ?",
      args: [email],
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Nieprawidlowy email lub haslo" });
    }

    const user = result.rows[0];
    if (user.password_hash === "GOOGLE_OAUTH") {
      return res.status(401).json({ error: "To konto uzywa logowania Google" });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Nieprawidlowy email lub haslo" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Blad logowania" });
  }
});

router.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "Brak credential" });
  }

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email } = ticket.getPayload();

    let row = await db.execute({
      sql: "SELECT id, email, role FROM users WHERE email = ?",
      args: [email],
    });

    let id, role;
    if (row.rows.length > 0) {
      id = row.rows[0].id;
      role = row.rows[0].role;
    } else {
      const result = await db.execute({
        sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        args: [email, "GOOGLE_OAUTH"],
      });
      id = Number(result.lastInsertRowid);
      role = "user";
    }

    const token = jwt.sign({ id, email, role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, user: { id, email, role } });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Nieprawidlowy token Google" });
  }
});

module.exports = router;
