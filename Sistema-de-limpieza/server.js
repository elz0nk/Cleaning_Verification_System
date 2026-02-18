const express = require("express");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");
const sharedsession = require("express-socket.io-session");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("chat.db");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const sessionMiddleware = session({
  secret: "clave_secreta",
  resave: false,
  saveUninitialized: false
});

app.use(express.json());
app.use(express.static("public"));
app.use(sessionMiddleware);

io.use(sharedsession(sessionMiddleware, { autoSave: true }));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversacion TEXT,
      de TEXT,
      para TEXT,
      texto TEXT,
      fecha TEXT
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS casas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    nombre TEXT,
    direccion TEXT
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS checklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    casa_id INTEGER,
    texto TEXT,
    completado INTEGER
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS contact_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    reason TEXT,
    message TEXT,
    newsletter INTEGER,
    fecha TEXT
  )
`);

});

module.exports = db;

// REGISTER
app.post("/register", async (req, res) => {
  const { usuario, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO usuarios (usuario, email, password) VALUES (?, ?, ?)",
    [usuario, email, hash],
    err => err ? res.status(400).end() : res.json({ ok: true })
  );
});

// LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    "SELECT * FROM usuarios WHERE email = ?",
    [email],
    async (err, user) => {
      if (!user) return res.status(401).end();

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).end();

      req.session.usuario = user.usuario;
      req.session.plan = user.plan;
      res.json({ ok: true });
    }
  );
});

// Cambiar plan del usuario
app.post("/update-plan", (req, res) => {
  if (!req.session.usuario) return res.status(401).end();
  const { plan } = req.body; // "professional", "enterprise", etc.

  db.run(
    "UPDATE usuarios SET plan = ? WHERE usuario = ?",
    [plan, req.session.usuario],
    (err) => {
      if (err) return res.status(500).json({ error: "DB update failed" });

      // Actualizar plan en sesión
      req.session.plan = plan;
      res.json({ ok: true });
    }
  );
});


// SESSION CHECK
app.get("/me", (req, res) => {
  if (!req.session.usuario) return res.status(401).end();
  res.json({ usuario: req.session.usuario });
});

function requireAdmin(req, res, next) {
  if (!req.session.usuario) return res.status(401).end();
  if (req.session.usuario !== "admin") return res.status(403).end();
  next();
}

app.get("/checklist", (req, res) => {
  if (!req.session.usuario) return res.status(401).end();

  db.all(
    "SELECT * FROM checklist WHERE usuario = ?",
    [req.session.usuario],
    (err, rows) => res.json(rows)
  );
});

app.post("/checklist", (req, res) => {
  const { texto } = req.body;
  const usuario = req.session.usuario;

  db.run(
    "INSERT INTO checklist (usuario, texto, completado) VALUES (?, ?, 0)",
    [usuario, texto],
    function () {
      res.json({ id: this.lastID });
    }
  );
});

app.put("/checklist/:id", (req, res) => {
  db.run(
    "UPDATE checklist SET texto = ? WHERE id = ?",
    [req.body.texto, req.params.id],
    () => res.json({ ok: true })
  );
});

app.put("/checklist/:id/completado", (req, res) => {
  db.run(
    "UPDATE checklist SET completado = ? WHERE id = ?",
    [req.body.completado, req.params.id],
    () => res.json({ ok: true })
  );
});

app.delete("/checklist/:id", (req, res) => {
  db.run(
    "DELETE FROM checklist WHERE id = ?",
    [req.params.id],
    () => res.json({ ok: true })
  );
});


// LOGOUT
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).end();
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// SOCKET.IO
const usuariosOnline = {};

function getConversacion(a, b) {
  return [a, b].sort().join("|");
}

io.on("connection", socket => {
  const usuario = socket.handshake.session.usuario;
  if (!usuario) return socket.disconnect();

  usuariosOnline[usuario] = socket.id;

  socket.on("abrir_conversacion", otro => {
    const conv = getConversacion(usuario, otro);
    db.all(
      "SELECT * FROM mensajes WHERE conversacion = ? ORDER BY fecha",
      [conv],
      (_, rows) => socket.emit("historial", rows)
    );
  });

  socket.on("mensaje", data => {
    const conv = getConversacion(usuario, data.para);

    const mensaje = {
      conversacion: conv,
      de: usuario,
      para: data.para,
      texto: data.texto,
      fecha: new Date().toISOString()
    };

    db.run(
      "INSERT INTO mensajes (conversacion, de, para, texto, fecha) VALUES (?, ?, ?, ?, ?)",
      Object.values(mensaje)
    );

    const destino = usuariosOnline[mensaje.para];
    if (destino) io.to(destino).emit("mensaje", mensaje);
    socket.emit("mensaje", mensaje);
  });

  socket.on("disconnect", () => {
    delete usuariosOnline[usuario];
  });
});


app.post("/contact", (req, res) => {
  if (!req.session.usuario) return res.status(401).end();
  const usuario = req.session.usuario;
  const {
    name,
    email,
    phone,
    reason,
    message,
    newsletter
  } = req.body;

  db.run(
    `INSERT INTO contact_forms
     (usuario, name, email, phone, reason, message, newsletter, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario,
      name,
      email,
      phone,
      reason,
      message,
      newsletter ? 1 : 0,
      new Date().toISOString()
    ],
    err => {
      if (err) {
        console.error("CONTACT INSERT ERROR:", err);
        return res.status(500).json({ error: "DB insert failed" });
      }
      res.json({ ok: true });
    }
  );
});

app.get("/admin/contact", requireAdmin, (req, res) => {
  db.all(
    "SELECT * FROM contact_forms ORDER BY fecha DESC",
    [],
    (err, rows) => res.json(rows)
  );
});

app.get("/admin/contact.html", requireAdmin, (req, res) => {
  res.sendFile(__dirname + "/public/admin/contact.html");
});


app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/home.html");
});

function limiteCasas(plan) {
  if (plan === "trial") return 1;
  if (plan === "professional") return 5;
  if (plan === "enterprise") return Infinity;
}

app.post("/casas", (req, res) => {

  if (!req.session.usuario) return res.status(401).end();

  const usuario = req.session.usuario;
  const plan = req.session.plan;
  const { nombre, direccion } = req.body;

  db.get(
    "SELECT COUNT(*) as total FROM casas WHERE usuario = ?",
    [usuario],
    (err, row) => {

      const limite = limiteCasas(plan);

      if (row.total >= limite)
        return res.status(403).json({ error: "Límite alcanzado" });

      db.run(
        "INSERT INTO casas (usuario, nombre, direccion) VALUES (?, ?, ?)",
        [usuario, nombre, direccion],
        function () {
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

app.get("/casas", (req, res) => {
  if (!req.session.usuario) return res.status(401).end();

  db.all(
    "SELECT * FROM casas WHERE usuario = ?",
    [req.session.usuario],
    (err, rows) => res.json(rows)
  );
});

app.get("/checklist/:casaId", (req, res) => {

  if (!req.session.usuario) return res.status(401).end();

  db.all(
    "SELECT * FROM checklist WHERE usuario = ? AND casa_id = ?",
    [req.session.usuario, req.params.casaId],
    (err, rows) => res.json(rows)
  );
});

app.post("/checklist/:casaId", (req, res) => {

  const { texto } = req.body;

  db.run(
    "INSERT INTO checklist (usuario, casa_id, texto, completado) VALUES (?, ?, ?, 0)",
    [req.session.usuario, req.params.casaId, texto],
    function () {
      res.json({ id: this.lastID });
    }
  );
});

app.put("/checklist/:id/completado", (req, res) => {
  db.run(
    "UPDATE checklist SET completado = ? WHERE id = ?",
    [req.body.completado, req.params.id],
    () => res.json({ ok: true })
  );
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

