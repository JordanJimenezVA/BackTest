import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { createPool } from "mysql2/promise";
import { PORT } from "./config.js";
import multer from "multer";
import authenticateToken from "./authenticateToken.mjs";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;

const DB_HOST_OLD = process.env.DB_HOST_OLD;
const DB_PORT_OLD = process.env.DB_PORT_OLD;
const DB_USER_OLD = process.env.DB_USER_OLD;
const DB_PASSWORD_OLD = process.env.DB_PASSWORD_OLD;
const DB_DATABASE_OLD = process.env.DB_DATABASE_OLD;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;

const app = express();
app.use(cookieParser());
app.use(express.json());

export const db = createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 6,
  queueLimit: 0,
});

export const dbAntigua = createPool({
  host: DB_HOST_OLD,
  port: DB_PORT_OLD,
  user: DB_USER_OLD,
  password: DB_PASSWORD_OLD,
  database: DB_DATABASE_OLD,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

app.use(
  cors({
    origin: [
      "https://andes.up.railway.app",
      "https://vivacious-enthusiasm-production.up.railway.app",
      "http://localhost:4173",
      "http://localhost:5173",
    ],
    methods: ["POST", "GET", "DELETE", "PUT"],
    credentials: true,
  })
);

app.listen(PORT, () => {
  console.log("Server connected " + PORT);
});

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

// GESTION LOGIN

app.get("/UserType/", async (req, res) => {
  const { RUTU } = req.query;

  if (!RUTU) {
    return res.status(400).json({ message: "El parámetro rut es requerido" });
  }

  const sql = "SELECT TipoU, NombreU FROM usuario WHERE RUTU = ?";
  try {
    const [rows] = await db.query(sql, [RUTU.toString()]);
    if (rows.length > 0) {
      const userType = rows[0].TipoU;
      const nombreUsuario = rows[0].NombreU;
      return res.json({ userType, nombreUsuario });
    } else {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
  } catch (err) {
    console.log("Error executing query:", err);
    return res.status(500).json({ Message: "Server Error" });
  }
});

app.get("/Logout", (req, res) => {
  res.clearCookie("token", { path: "/" }); // Clear the token cookie
  return res.json({ Status: "Success" });
});

app.post("/Login", async (req, res) => {
  const sql = "SELECT * FROM usuario WHERE RUTU = ?";
  try {
    const [rows] = await db.query(sql, [req.body.rutU]);

    if (rows.length > 0) {
      const user = rows[0];
      const isMatch = req.body.passwordU === user.PasswordU;

      if (isMatch) {
        const rut = user.RUTU;
        const secretKey = process.env.JWT_SECRET_KEY;
        const token = jwt.sign({ rut }, secretKey, { expiresIn: "1d" });

        const userType = user.TipoU;
        const nombreUsuario = user.NombreU;
        const instalacionU = user.InstalacionU;
        const instalacionUsuario = user.InstalacionU;

        // Aquí se hace la consulta para obtener el nombre de la instalación
        const [instalacion] = await db.query(
          "SELECT Nombre FROM instalacion WHERE IDI = ?",
          [instalacionUsuario]
        );

        let nombreInstalacion =
          instalacion.length > 0
            ? instalacion[0].Nombre
            : "Instalación no encontrada";

        res.cookie("token", token, {
          httpOnly: false,
          secure: false,
          domain: ".up.railway.app",
          sameSite: "Lax",
          maxAge: 24 * 60 * 60 * 1000, // 1 día
        });

        return res.json({
          Status: "Success",
          userType,
          nombreUsuario,
          rut,
          instalacionU,
          instalacionUsuario: nombreInstalacion,
        });
      } else {
        console.log("Error: Contraseña incorrecta");
        return res.json({ Message: "Credenciales incorrectas" });
      }
    } else {
      console.log("Error: Usuario no encontrado");
      return res.json({ Message: "Usuario no encontrado" });
    }
  } catch (err) {
    console.log("Error ejecutando la consulta:", err);
    return res.status(500).json({ Message: "Server Error" });
  }
});

//GESTION PERSONAS REPORTADAS
app.put("/Personas%20Reportadas/:RUTP", async (req, res) => {
  const RUTP = req.params.RUTP;
  const Estado = "VIGENTE";
  await db.query("UPDATE persona SET EstadoP = ? WHERE RUTP = ?", [
    Estado,
    RUTP,
  ]);
  res.send("Actualización realizada con éxito");
});

app.get("/PersonasReportadas", async (req, res) => {
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM persona WHERE EstadoP != 'VIGENTE'"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.put("/ReportarPersona", async (req, res) => {
  const { RUTP, EstadoP } = req.body;

  await db.query("UPDATE persona SET EstadoP = ? WHERE RUTP = ?", [
    EstadoP,
    RUTP,
  ]);

  res.send("Ingreso realizado con exito");
});

//GESTION INFORMES CAMION

app.get("/InformeCamion", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM revision");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/VerInforme/:IDR", async (req, res) => {
  const { IDR } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM revision WHERE IDR = ?",
      [IDR]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

//GESTION REVISION
app.get("/Revision", async (req, res) => {
  try {
    const [rows, fields] = await db.query(`
            SELECT * 
            FROM registros 
            WHERE rol IN ('CAMION', 'SEMIREMOLQUE', 'TRACTOCAMION', 'CHASIS CABINADO', 'REMOLQUE', 'OtrosCA') 
            AND chequeado = 'NO'
        `);
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/ProgresoRevision/:IDR", async (req, res) => {
  const { IDR } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM progresorevision WHERE IDR = ?",
      [IDR]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.post("/GuardarProgreso/:IDR", upload.array("FOTOS"), async (req, res) => {
  const { IDR } = req.params;
  const personal = req.body.PERSONAL;
  const apellido = req.body.APELLIDO;
  const rut = req.body.RUT;
  const patente = req.body.PATENTE;
  const rol = req.body.ROL;
  const observaciones = req.body.OBSERVACIONES;
  const guiadespacho = req.body.GUIADESPACHO;
  const selloCA = req.body.SELLO;
  const anden = req.body.ANDEN;
  const kilos = req.body.KILOS;
  const pallets = req.body.PALLETS;
  const supervisor = req.body.SUPERVISOR;
  const jefet = req.body.JEFET;
  const fotos = req.files ? req.files.map((file) => file.filename) : [];
  const fechaInicio = req.body.fechaInicio;
  const estado = "REVISANDO";
  try {
    // Verificar si ya existe un registro en progresorevision para el IDR dado
    const [existingRows] = await db.query(
      "SELECT IDR FROM progresorevision WHERE IDR = ?",
      [IDR]
    );

    if (existingRows.length > 0) {
      // Construir consulta de actualización dinámica
      const fields = [
        personal,
        apellido,
        rut,
        patente,
        rol,
        observaciones,
        guiadespacho,
        selloCA,
        anden,
        kilos,
        pallets,
        supervisor,
        jefet,
      ];
      let updateQuery =
        "UPDATE progresorevision SET PERSONAL = ?, APELLIDO = ?, RUT = ?, PATENTE = ?, ROL = ?, OBSERVACIONES = ?, GUIADESPACHO = ?, SELLO = ?, ANDEN = ?, KILOS = ?, PALLETS = ?, SUPERVISOR = ?, JEFET = ?";

      if (fotos.length > 0) {
        updateQuery += ", FOTOS = ?";
        fields.push(fotos.join(", "));
      }

      updateQuery += " WHERE IDR = ?";
      fields.push(IDR);

      await db.query(updateQuery, fields);
      res.json({ message: "Progreso actualizado correctamente" });
    } else {
      // Insertar un nuevo registro
      await db.query(
        "INSERT INTO progresorevision (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, ANDEN, KILOS, PALLETS, SUPERVISOR, JEFET, FOTOS, FECHAINICIO, IDR, ESTADO) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          personal,
          apellido,
          rut,
          patente,
          rol,
          observaciones,
          guiadespacho,
          selloCA,
          anden,
          kilos,
          pallets,
          supervisor,
          jefet,
          fotos.join(", "),
          fechaInicio,
          IDR,
          estado,
        ]
      );
      res.json({ message: "Progreso guardado correctamente" });
    }
  } catch (error) {
    console.error("Error al guardar el progreso:", error);
    res.status(500).json({ error: "Error al guardar el progreso" });
  }
});

app.post("/RevisionCamion/:IDR", upload.array("FOTOS"), async (req, res) => {
  try {
    if (!req.files) {
      return res.status(400).send("No se recibieron archivos");
    }
    const { IDR } = req.params;
    const personal = req.body.PERSONAL;
    const apellido = req.body.APELLIDO;
    const rut = req.body.RUT;
    const patente = req.body.PATENTE;
    const rol = req.body.ROL;
    const observaciones = req.body.OBSERVACIONES;
    const guiadespacho = req.body.GUIADESPACHO;
    const selloCA = req.body.SELLO;
    const anden = req.body.ANDEN;
    const kilos = req.body.KILOS;
    const pallets = req.body.PALLETS;
    const supervisor = req.body.SUPERVISOR;
    const jefet = req.body.JEFET;
    const fotos = req.files ? req.files.map((file) => file.filename) : [];
    const fechaInicio = req.body.FECHAINICIO;
    const fechaFin = req.body.FECHAFIN;
    const nombreusuario = req.body.NombreUsuario;

    await db.query(
      "INSERT INTO revision (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, ANDEN, KILOS, PALLETS, SUPERVISOR, ENRE, JEFET, FOTOS, FECHAINICIO, FECHAFIN, IDR ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        personal,
        apellido,
        rut,
        patente,
        rol,
        observaciones,
        guiadespacho,
        selloCA,
        anden,
        kilos,
        pallets,
        supervisor,
        nombreusuario,
        jefet,
        fotos.join(", "),
        fechaInicio,
        fechaFin,
        IDR,
      ]
    );
    await db.query("UPDATE progresorevision SET ESTADO = ? WHERE IDR = ?", [
      "REVISADO",
      IDR,
    ]);
    await db.query("UPDATE registros SET CHEQUEADO = ? WHERE IDR = ?", [
      "SI",
      IDR,
    ]);

    res.send("Revision realizada correctamente");
  } catch (error) {
    console.error("Error al marcar salida:", error);
    res.status(500).send("Error al marcar salida");
  }
});

//GESTION MANTENEDOR PERSONAL

app.get("/Personal", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM persona");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/EditarPersonal/:RUTP", async (req, res) => {
  const { RUTP } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM persona WHERE RUTP = ?",
      [RUTP]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.put("/EditarPersonal/:RUTP", async (req, res) => {
  const RUTP = req.params.RUTP;
  const { NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP } = req.body;

  try {
    const [result] = await db.query(
      "UPDATE persona SET NombreP = ?, ApellidoP = ?, ActividadP = ?, EmpresaP = ?, ComentarioP = ? WHERE RUTP = ?",
      [NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, RUTP]
    );

    if (result.affectedRows === 0) {
      res.status(404).send("El RUT no existe en la base de datos");
      return;
    }

    res.send("Actualización realizada con éxito");
  } catch (error) {
    console.error("Error al realizar la actualización:", error);
    res.status(500).send("Error al realizar la actualización");
  }
});

app.delete("/persona/:RUTP", (req, res) => {
  const { RUTP } = req.params;
  try {
    db.query(`DELETE FROM persona WHERE RUTP = ?`, [RUTP]);

    res.send("Usuario eliminado correctamente");
  } catch (error) {
    console.error("Error al eliminar registro:", error);
    res.status(500).send("Error al eliminar registro");
  }
});

app.post("/AgregarPersonal", async (req, res) => {
  const { RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP } =
    req.body;
  const EstadoP = "VIGENTE";

  try {
    const [result] = await db.query(
      "SELECT COUNT(*) AS count FROM persona WHERE RUTP = ?",
      [RUTP]
    );

    if (result[0].count > 0) {
      return res.status(400).send("El RUT ya existe en la base de datos");
    }
    await db.query(
      "INSERT INTO persona (RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP]
    );

    res.send("Ingreso realizado con éxito");
  } catch (error) {
    console.error("Error al registrar ingreso:", error);
    res.status(500).send("Error al registrar ingreso");
  }
});

//GESTION MANTENEDOR CAMION

app.get("/Transporte", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM transporte");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/EditarTransporte/:PATENTE", async (req, res) => {
  const { PATENTE } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM transporte WHERE PATENTE = ?",
      [PATENTE]
    );
    if (rows.length === 0) {
      console.log("No se encontró ninguna entrada para la patente:", PATENTE);
    }
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.put("/EditarTransporte/:PATENTE", async (req, res) => {
  const PATENTE = req.params.PATENTE;
  const { Tipo, Modelo, Marca, Color, EmpresaP } = req.body;

  try {
    const existenciaPatente = await db.query(
      "SELECT COUNT(*) AS count FROM transporte WHERE PATENTE = ?",
      [PATENTE]
    );
    const count = existenciaPatente[0][0].count;
    if (count === 0) {
      res.status(404).send("La Patente no existe en la base de datos");
      return;
    }

    // El IDPI existe, actualizar los datos en la tabla camiones
    await db.query(
      "UPDATE transporte SET Tipo = ?, Modelo = ?, Marca = ?, Color = ?, Empresa = ? WHERE PATENTE = ?",
      [Tipo, Modelo, Marca, Color, EmpresaP, PATENTE]
    );

    res.send("Actualización realizada con éxito");
  } catch (error) {
    console.error("Error al realizar la actualización:", error);
    res.status(500).send("Error al realizar la actualización");
  }
});

app.delete("/Transporte/:PATENTE", async (req, res) => {
  const { PATENTE } = req.params;
  try {
    await db.query(`DELETE FROM transporte WHERE PATENTE = ?`, [PATENTE]);

    res.send("Transporte eliminado correctamente");
  } catch (error) {
    console.error("Error al eliminar registro:", error);
    res.status(500).send("Error al eliminar registro");
  }
});

app.post("/AgregarTransporte", async (req, res) => {
  const { PATENTE, Tipo, Modelo, Marca, Color, EmpresaP } = req.body;
  const Estado = "VIGENTE";
  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM transporte WHERE PATENTE = ?",
      [PATENTE]
    );

    if (count > 0) {
      return res
        .status(409)
        .send({ message: "La Patente ya existe en la base de datos" });
    }

    await db.query(
      `INSERT INTO transporte (PATENTE, Tipo, Modelo, Marca, Color, Empresa, Estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [PATENTE, Tipo, Modelo, Marca, Color, EmpresaP, Estado]
    );

    res.send("Ingreso realizado con éxito");
  } catch (error) {
    console.error("Error al registrar ingreso:", error);
    res.status(500).send({ message: "Error al registrar ingreso" });
  }
});

//FORMULARIO INGRESO PERSONA

app.post("/FormularioPersona", async (req, res) => {
  let {
    RUTP,
    NombreP,
    ApellidoP,
    ActividadP,
    EmpresaP,
    tipoPersona,
    ComentarioP,
    PATENTE,
    PatenteR,
    Tipo,
    Modelo,
    Marca,
    Color,
    GuiaDE,
    SelloEn,
    fechaActualChile,
    instalacionU,
    NombreU,
    rutu,
  } = req.body;

  RUTP = RUTP?.trim();
  PATENTE = PATENTE?.trim();
  PatenteR = PatenteR?.trim();

  const tipoFinal = (
    req.body.TipoCamion?.trim() ||
    req.body.TipoT?.trim() ||
    ""
  ).toUpperCase();

  const Ciclo = false;
  const Estado = "Ingreso";
  const EstadoP = "VIGENTE";
  try {
    // 1. Verificar si la persona ya está registrada en la misma instalación y estado
    const registroExistente = await db.query(
      `SELECT COUNT(*) AS count 
       FROM registro 
       WHERE RUTP = ? AND Instalacion = ? AND Estado = 'Ingreso' AND Ciclo = FALSE`,
      [RUTP, instalacionU]
    );

    if (registroExistente[0][0].count > 0) {
      return res.status(400).json({
        error: `Esta persona se encuentra en la instalación: ${instalacionU}.`,
      });
    }

    if (PATENTE) {
      const registroPatenteExistente = await db.query(
        `SELECT COUNT(*) AS count 
     FROM registro 
     WHERE Patente = ? AND Instalacion = ? AND Estado = 'Ingreso' AND Ciclo = FALSE`,
        [PATENTE, instalacionU]
      );

      if (registroPatenteExistente[0][0].count > 0) {
        return res.status(400).json({
          error: `Esta Patente se encuentra en la instalación: ${instalacionU}.`,
        });
      }
    }

    // 2. Verificar si la persona existe en la tabla `persona`
    const personaExistente = await db.query(
      "SELECT COUNT(*) AS count FROM persona WHERE RUTP = ?",
      [RUTP]
    );

    if (personaExistente[0][0].count === 0) {
      // Si no existe, insertar en `persona`
      await db.query(
        "INSERT INTO persona (RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP]
      );
    } else {
      console.log("La persona ya existe en la tabla persona.");
    }

    // 3. Verificar si la `PATENTE` existe en la tabla `transporte`
    if (PATENTE) {
      const patenteExistente = await db.query(
        "SELECT COUNT(*) AS count FROM transporte WHERE PATENTE = ?",
        [PATENTE.trim()]
      );

      if (patenteExistente[0][0].count === 0) {
        // Determinar el valor correcto para el campo Tipo

        await db.query(
          "INSERT INTO transporte (PATENTE, Tipo, Modelo, Marca, Color, Empresa, Estado) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [PATENTE.trim(), tipoFinal, Modelo, Marca, Color, EmpresaP, EstadoP]
        );
      } else {
        console.log("La patente ya existe en la tabla transporte.");
      }
    }
    if (EmpresaP) {
      const empresaPExistente = await db.query(
        "SELECT COUNT(*) AS count FROM empresa WHERE Nombre = ?",
        [EmpresaP]
      );

      if (empresaPExistente[0][0].count === 0) {
        // Si no existe, insertar en `empresa`
        await db.query("INSERT INTO empresa (Nombre, Estado) VALUES (?, ?)", [
          EmpresaP,
          EstadoP,
        ]);
        console.log("Nueva Empresa insertada en la tabla empresa.");
      } else {
        console.log("La Empresa ya existe en la tabla empresa.");
      }
    }

    // 4. Insertar el registro de entrada/salida en la tabla `registro`
    await db.query(
      `INSERT INTO registro (RUTP, NombreP, ApellidoP, ActividadP, EmpresaP, tipoPersona, Estado, PATENTE, PatenteR, Tipo, Modelo, Marca, Color, GuiaDE, SelloEn, FechaEntrada, Instalacion, NombreU, RutU, ComentarioP, Ciclo) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        RUTP,
        NombreP,
        ApellidoP,
        ActividadP,
        EmpresaP,
        tipoPersona,
        Estado,
        PATENTE,
        PatenteR,
        tipoFinal,
        Modelo,
        Marca,
        Color,
        GuiaDE,
        SelloEn,
        fechaActualChile,
        instalacionU,
        NombreU,
        rutu,
        ComentarioP,
        Ciclo,
      ]
    );
    res.send("Entrada/salida registrada correctamente");
  } catch (error) {
    console.error("Error al registrar ingreso:", error);
    res.status(500).send("Error al registrar ingreso");
  }
});

app.get("/Personal%20Interno", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM personalinterno");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

// GESTION CAMIONES

app.get("/FormularioCamiones/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q =
      "SELECT * FROM camiones WHERE PATENTECA LIKE ? AND ESTADOCA = 'VIGENTE'";
    const results = await db.query(q, [`%${query}%`]);
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/FormularioCamiones/suggestion/:PATENTECA", async (req, res) => {
  try {
    const { PATENTECA } = req.params;
    const query = "SELECT * FROM camiones WHERE PATENTECA = ?";

    const [result] = await db.query(query, [PATENTECA]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Patente no encontrado" });
    }

    const {
      CHOFERCA,
      APELLIDOCHOFERCA,
      RUTCA,
      MARCACA,
      TIPOCA,
      MODELOCA,
      COLORCA,
      EMPRESACA,
    } = result[0];

    res.json({
      CHOFERCA,
      APELLIDOCHOFERCA,
      RUTCA,
      PATENTECA,
      MARCACA,
      TIPOCA,
      MODELOCA,
      COLORCA,
      EMPRESACA,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles del Rut" });
  }
});

// GESTION DE INGRESOS/SALIDAS

app.get("/TablaIngreso", async (req, res) => {
  try {
    const { IDINST } = req.query;

    if (!IDINST) {
      return res.status(400).json({ error: "Se requiere el IDINST" });
    }

    const query = `
    SELECT * FROM registro 
    WHERE ESTADO = 'Ingreso' 
    AND Instalacion = ?
    AND Ciclo = FALSE
`;

    const [rows] = await db.query(query, [IDINST]);
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/FormularioSalida/:IDR", async (req, res) => {
  const { IDR } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM registro WHERE IDR = ?",
      [IDR]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});


app.post("/FormularioSalida/:IDR", async (req, res) => {
  const IDR = req.params.IDR;
  const {
    RutP,
    NombreP,
    ApellidoP,
    ActividadP,
    EmpresaP,
    ComentarioP,
    TipoPersona,
    Patente,
    PatenteR,
    Tipo,
    Modelo,
    Marca,
    Color,
    GuiaDS,
    SelloSa,
    fechaActualChile,
    instalacionU,
    NombreU,
    rutu,
  } = req.body;

  const Ciclo = true;
  const Estado = "Salida";

  try {
    // 1. Insertar nuevo registro de salida
    const [insertSalida] = await db.query(
      `INSERT INTO registro (
        RutP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP,
        TipoPersona, Patente, PatenteR, Tipo, Modelo, Marca, Color,
        GuiaDS, SelloSa, Instalacion, RutU, FechaSalida, NombreU, Ciclo, Estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        RutP,
        NombreP,
        ApellidoP,
        ActividadP,
        EmpresaP,
        ComentarioP,
        TipoPersona,
        Patente,
        PatenteR,
        Tipo,
        Modelo,
        Marca,
        Color,
        GuiaDS,
        SelloSa,
        instalacionU,
        rutu,
        fechaActualChile,
        NombreU,
        Ciclo,
        Estado,
      ]
    );

    // 2.1. Actualizar ingreso pendiente de la persona
    const [personaIngreso] = await db.query(
      `UPDATE registro 
       SET Ciclo = 1 
       WHERE IDR = (
         SELECT IDR FROM (
           SELECT IDR FROM registro 
           WHERE RutP = ? 
             AND Estado = 'Ingreso' 
             AND Ciclo = 0 
           ORDER BY IDR DESC 
           LIMIT 1
         ) AS sub
       )`,
      [RutP]
    );

    // 2.2. Actualizar ingreso pendiente del transporte (por Patente)
    if (Patente && Patente.trim() !== "") {
      // Primero verificar si existe un ingreso pendiente con esa patente
      const [camionPendiente] = await db.query(
        `SELECT IDR FROM registro 
     WHERE Patente = ? 
       AND Estado = 'Ingreso' 
       AND Ciclo = 0 
     ORDER BY IDR DESC 
     LIMIT 1`,
        [Patente.trim()]
      );

      if (camionPendiente.length > 0) {
        const IDRcamion = camionPendiente[0].IDR;

        // Actualizar Ciclo para ese ingreso pendiente del camión
        const [camionIngreso] = await db.query(
          `UPDATE registro 
       SET Ciclo = 1 
       WHERE IDR = ?`,
          [IDRcamion]
        );

      } else {
        console.log("No hay ingreso pendiente con esa patente:", Patente);
      }
    } else {
      console.log(
        "No se proporciona patente para actualizar ingreso pendiente del camión"
      );
    }

    res.send("Salida registrada correctamente.");
  } catch (error) {
    console.error("Error al registrar la salida:", error);
    res.status(500).send("Error al registrar la salida");
  }
});

app.post("/FormularioSalidaSinCamion/:IDR", async (req, res) => {
  const IDR = req.params.IDR;
  const {
    RutP,
    NombreP,
    ApellidoP,
    ActividadP,
    EmpresaP,
    ComentarioP,
    TipoPersona,
    Patente,
    PatenteR,
    Tipo,
    Modelo,
    Marca,
    Color,
    fechaActualChile,
    instalacionU,
    NombreU,
    rutu,
  } = req.body;

  const EstadoSalida = "Salida";
  const EstadoIngreso = "Ingreso";

  try {
    // 1. Insertar el registro de salida de la persona con el camión
    await db.query(
      "INSERT INTO registro (RutP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, TipoPersona, Instalacion, RutU, FechaSalida, NombreU, Ciclo, Estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        RutP,
        NombreP,
        ApellidoP,
        ActividadP,
        EmpresaP,
        ComentarioP,
        TipoPersona,
        instalacionU,
        rutu,
        fechaActualChile,
        NombreU,
        true,
        EstadoSalida,
      ]
    );

    // 2. Insertar un nuevo registro para el camión sin datos de la persona
    await db.query(
      "INSERT INTO registro (Patente, PatenteR, Tipo, Modelo, Marca, Color, Instalacion, RutU, FechaEntrada, NombreU, Ciclo, Estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        Patente,
        PatenteR,
        Tipo,
        Modelo,
        Marca,
        Color,
        instalacionU,
        rutu,
        fechaActualChile,
        NombreU,
        false,
        EstadoIngreso,
      ]
    );

    // 3. Actualizar el ciclo del registro de entrada original
    await db.query("UPDATE registro SET Ciclo = 1 WHERE IDR = ?", [IDR]);

    res.send(
      "Salida registrada correctamente: datos del camión y persona actualizados, ciclo del registro de entrada modificado."
    );
  } catch (error) {
    console.error("Error al marcar salida:", error);
    res.status(500).send("Error al marcar salida");
  }
});

// GESTION HOME

app.get("/TopBox", async (req, res) => {
  const idInst = req.query.idInst;

  if (!idInst) {
    return res.status(400).json({ error: "IDINST es requerido" });
  }

  try {
    const data = await db.query(
      "SELECT * FROM registro WHERE Instalacion = ?",
      [idInst]
    );
    res.json(data);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/ChartBox", async (req, res) => {
  const { idinst } = req.query;

  if (!idinst) {
    return res.status(400).json({ error: "IDINST is required" });
  }

  try {
    const [data] = await db.query(
      "SELECT * FROM registro WHERE Instalacion = ? AND Ciclo = FALSE AND Estado = 'Ingreso'",
      [idinst]
    );
    res.json(data);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

// GESTION NOVEDADES

app.get("/TablaNovedad", async (req, res) => {
  const { IDINST } = req.query;

  if (!IDINST) {
    return res.status(400).json({ error: "IDINST es requerido" });
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM novedad WHERE Instalacion = ?",
      [IDINST]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.post("/AgregarNO", upload.array("FOTOSNO"), async (req, res) => {
  const NotaNO = req.body.NotaNO;
  const GuardiaNO = req.body.GuardiaNO;
  const HoraNO = req.body.HoraNO;
  const IDINST = req.body.IDINST;
  const files = req.files;

  try {
    const [result] = await db.query(
      "INSERT INTO novedad (Descripcion, Guardia, Fecha, Instalacion) VALUES (?, ?, ?, ?)",
      [NotaNO, GuardiaNO, HoraNO, IDINST]
    );

    const IDNO = result.insertId;

    for (const file of files) {
      await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "novedades",
            transformation: [
              { width: 800, crop: "limit" },
              { fetch_format: "auto" },
              { quality: "auto" },
            ],
          },
          async (error, result) => {
            if (error) {
              console.error("Error subiendo imagen a Cloudinary:", error);
              return reject(error);
            }

            await db.query(
              "INSERT INTO fotos_novedad (novedad_id, url) VALUES (?, ?)",
              [IDNO, result.secure_url]
            );
            resolve();
          }
        );

        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    }

    res.send("Novedad registrada con éxito");
  } catch (error) {
    console.error("Error al registrar la novedad:", error);
    res.status(500).send("Error al registrar la novedad");
  }
});

app.get("/VerNO/:IDNO", async (req, res) => {
  const { IDNO } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT n.IDNO, n.Descripcion, n.Guardia, n.Fecha, n.Instalacion, f.url AS foto_url
       FROM novedad n
       LEFT JOIN fotos_novedad f ON n.IDNO = f.novedad_id
       WHERE n.IDNO = ?`,
      [IDNO]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Novedad no encontrada" });
    }

    const novedad = {
      IDNO: rows[0].IDNO,
      Descripcion: rows[0].Descripcion,
      Guardia: rows[0].Guardia,
      Fecha: rows[0].Fecha,
      Instalacion: rows[0].Instalacion,
      fotos: [],
    };

    for (const row of rows) {
      if (row.foto_url) {
        novedad.fotos.push(row.foto_url);
      }
    }

    res.json(novedad);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

//GESTION USUARIOS

app.get("/Usuarios", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM usuario");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.post("/AgregarUsuario", async (req, res) => {
  const { RUTU, NombreU, TipoU, PasswordU, InstalacionU } = req.body;
  const EstadoU = "VIGENTE";

  try {
    const rutExistente = await db.query(
      "SELECT COUNT(*) AS count FROM usuario WHERE RUTU = ?",
      [RUTU]
    );
    const count = rutExistente[0][0].count;
    if (count > 0) {
      return res
        .status(409)
        .send({ message: "El Usuario ya existe en la base de datos" });
      return;
    }

    await db.query(
      "INSERT INTO usuario (RUTU, NombreU, TipoU, PasswordU, InstalacionU, EstadoU) VALUES (?, ?, ?, ?, ?, ?)",
      [RUTU, NombreU, TipoU, PasswordU, InstalacionU, EstadoU]
    );

    res.send("Ingreso realizado con exito");
  } catch (error) {
    console.error("Error al registrar ingreso:", error);
    res.status(500).send("Error al registrar ingreso");
  }
});

app.delete("/Usuarios/:RUTU", (req, res) => {
  const { RUTU } = req.params;
  try {
    db.query(`DELETE FROM usuario WHERE RUTU = ?`, [RUTU]);

    res.send("Usuario eliminado correctamente");
  } catch (error) {
    console.error("Error al eliminar registro:", error);
    res.status(500).send("Error al eliminar registro");
  }
});

app.put("/EditarUsuario/:RUTU", async (req, res) => {
  const RUTU = req.params.RUTU;
  const { NombreU, TipoU, PasswordU, InstalacionU, EstadoU } = req.body;

  await db.query(
    "UPDATE usuario SET NombreU = ?, TipoU = ?, PasswordU = ?, InstalacionU = ?, EstadoU = ? WHERE RUTU = ?",
    [NombreU, TipoU, PasswordU, InstalacionU, EstadoU, RUTU]
  );

  res.send("Actualización realizada con éxito");
});

app.get("/EditarUsuarios/:RUTU", async (req, res) => {
  const { RUTU } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM usuario WHERE RUTU = ?",
      [RUTU]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

//GESTION NOMBRE USUARIO

app.get("/NombreUser", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM usuarios");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/IDINST", authenticateToken, async (req, res) => {
  const rut = req.user.rut; // RUT del usuario obtenido desde el token

  try {
    const [rows] = await db.query(
      `
            SELECT i.Nombre AS NombreInstalacion
            FROM usuario u
            JOIN instalacion i ON u.InstalacionU = i.IDI
            WHERE u.RUTU = ?
        `,
      [rut]
    );

    if (rows.length > 0) {
      return res.json({ NombreInstalacion: rows[0].NombreInstalacion });
    } else {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
  } catch (error) {
    console.error("Error al consultar la base de datos:", error);
    return res.status(500).json({ error: "Error del servidor" });
  }
});

app.get("/NombreInstalacion", async (req, res) => {
  try {
    const { IDINST } = req.query;

    if (!IDINST) {
      return res.status(400).json({ error: "Se requiere el IDINST" });
    }

    // Consulta para obtener el nombre de la instalación
    const [rows] = await db.query(
      "SELECT NOMBREINST FROM instalaciones WHERE IDINST = ?",
      [IDINST]
    );

    if (rows.length > 0) {
      res.json({ nombreINST: rows[0].NOMBREINST });
    } else {
      res.status(404).json({ error: "Instalación no encontrada" });
    }
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

//GESTION LOG

app.get("/Logs", async (req, res) => {
  try {
    const { IDINST } = req.query;

    if (!IDINST) {
      return res.status(400).json({ error: "Se requiere el IDINST" });
    }

    const query = `
            SELECT * FROM registro 
            WHERE Instalacion = ?
        `;

    const [rows] = await db.query(query, [IDINST]);
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});


app.post("/VerLogExcel", async (req, res) => {
    const { idrs } = req.body;

    if (!Array.isArray(idrs) || idrs.length === 0) {
        return res.status(400).json({ error: "Debe enviar un array de IDR válidos." });
    }

    try {
        const placeholders = idrs.map(() => "?").join(",");
        const query = `SELECT * FROM registro WHERE IDR IN (${placeholders})`;

        const [rows] = await db.query(query, idrs);


        res.json(rows);
    } catch (error) {
        console.error("Error al ejecutar la consulta:", error);
        res.status(500).json({ error: "Error al ejecutar la consulta" });
    }
});


app.get("/VerLog/:IDR", async (req, res) => {
  const { IDR } = req.params;
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM registro WHERE IDR = ?",
      [IDR]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/LogsOld", async (req, res) => {
  try {
    const { IDINST } = req.query;

    if (!IDINST) {
      return res.status(400).json({ error: "Se requiere el IDINST" });
    }

    const query = `
          SELECT * FROM logs 
          WHERE IDINST = 2
      `;

    const [rows] = await dbAntigua.query(query, [IDINST]);

    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/VerLogOld/:IDL", async (req, res) => {
  const { IDL } = req.params;
  try {
    const [rows, fields] = await dbAntigua.query(
      "SELECT * FROM logs WHERE IDL = ?",
      [IDL]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.post("/VerLogOldLote", async (req, res) => {
  const { idls } = req.body; // espera un array

  if (!Array.isArray(idls) || idls.length === 0) {
    return res
      .status(400)
      .json({ error: "Debe enviar un array de IDL válidos." });
  }

  try {
    // Usa placeholders dinámicos (?, ?, ?) para la consulta
    const placeholders = idls.map(() => "?").join(",");
    const query = `SELECT * FROM logs WHERE IDL IN (${placeholders})`;

    const [rows] = await dbAntigua.query(query, idls);

    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/Empresas", async (req, res) => {
  try {
    const [rows, fields] = await db.query("SELECT * FROM empresa");
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

app.get("/Instalaciones", async (req, res) => {
  try {
    const [rows, fields] = await db.query(
      "SELECT * FROM instalacion WHERE Estado = 'ACTIVO'"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error al ejecutar la consulta" });
  }
});

//GET AUTOSUGGESTIONS

app.get("/RutSuggestion/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q = "SELECT * FROM persona WHERE RUTP LIKE ?";
    const results = await db.query(q, [`%${query}%`]);
    const suggestions = results.map((result) => result.RUTP);
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/RutSuggestion/suggestion/:RUTP", async (req, res) => {
  try {
    const { RUTP } = req.params;
    const query = `
            SELECT 
                NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP
            FROM 
                persona
            WHERE 
                RUTP = ?
        `;

    const [result] = await db.query(query, [RUTP]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Rut no encontrado" });
    }

    const { NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, EstadoP } =
      result[0];

    res.json({
      NombreP,
      ApellidoP,
      ActividadP,
      EmpresaP,
      ComentarioP,
      EstadoP,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles del Rut" });
  }
});

app.get("/PatenteRSuggestion/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q = "SELECT * FROM patenter WHERE PatenteR LIKE ?";
    const results = await db.query(q, [`%${query}%`]);
    const suggestions = results.map((result) => result.PatenteR);
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/PatenteRSuggestion/suggestion/:PatenteR", async (req, res) => {
  try {
    const { PatenteR } = req.params;
    const query = "SELECT * FROM patenter WHERE PatenteR = ?";

    const [result] = await db.query(query, [PatenteR]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Patente rampla no encontrada" });
    }

    // En lugar de reasignar PatenteR, usa una nueva variable
    const patenteData = result[0];

    res.json(patenteData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles de la Patente" });
  }
});

app.get("/PatenteSuggestion/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q =
      "SELECT * FROM transporte WHERE PATENTE LIKE ? AND Estado = 'VIGENTE'";
    const results = await db.query(q, [`%${query}%`]);
    const suggestions = results.map((result) => result.PATENTE);
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/PatenteSuggestion/suggestion/:PATENTE", async (req, res) => {
  try {
    const { PATENTE } = req.params;
    const query = "SELECT * FROM transporte WHERE PATENTE = ?";

    const [result] = await db.query(query, [PATENTE]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Patente no encontrado" });
    }

    const { Tipo, Modelo, Marca, Color } = result[0];

    res.json({ Tipo, Modelo, Marca, Color });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles del Rut" });
  }
});

app.get("/RutSalida/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q =
      "SELECT * FROM registro WHERE RutP LIKE ? AND Estado = 'Ingreso' AND Ciclo = 0";
    const results = await db.query(q, [`%${query}%`]);
    const suggestions = results.map((result) => result.RutP);
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/RutSalida/suggestion/:RutP", async (req, res) => {
  try {
    const { RutP } = req.params; // Asegúrate de que la clave coincide con cómo se pasa en el URL
    const query = `
      SELECT 
        RutP, NombreP, ApellidoP, ActividadP, EmpresaP, ComentarioP, TipoPersona, Estado 
      FROM 
        registro
      WHERE 
        RutP = ? AND Estado = 'Ingreso' AND Ciclo = 0
    `;

    const [results] = await db.query(query, [RutP]);
    if (results.length === 0) {
      return res
        .status(404)
        .json({ error: "Rut no encontrado en registro con estado 'Ingreso'" });
    }

    // Asumiendo que solo hay un registro relevante
    const {
      RutP: fetchedRutP,
      NombreP,
      ApellidoP,
      ActividadP,
      EmpresaP,
      ComentarioP,
      TipoPersona,
      Estado,
    } = results[0];

    res.json({
      RutP: fetchedRutP,
      NombreP,
      ApellidoP,
      ActividadP,
      EmpresaP,
      ComentarioP,
      TipoPersona,
      Estado,
    });
  } catch (error) {
    console.error("Error al obtener detalles del Rut:", error);
    res.status(500).json({ error: "Error al obtener detalles del Rut" });
  }
});

app.get("/EmpresaPSuggestion/suggestions", async (req, res) => {
  try {
    const { query } = req.query;
    const q =
      "SELECT Nombre FROM Empresa WHERE Nombre LIKE ? AND Estado = 'VIGENTE'";

    const [rows] = await db.query(q, [`%${query}%`]);
    res.json({ results: [rows] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/EmpresaPSuggestion/suggestion/:EmpresaP", async (req, res) => {
  try {
    const { EmpresaP } = req.params;
    const query =
      "SELECT Nombre FROM Empresa WHERE Nombre = ? AND Estado = 'VIGENTE'";
    const [result] = await db.query(query, [EmpresaP]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    const empresaData = result[0];

    res.json(empresaData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles de la Empresa" });
  }
});

app.get("/PatenteSuggestionSalida/suggestions", async (req, res) => {
  const { query } = req.query;
  const q = `
    SELECT * 
    FROM registro 
    WHERE Patente LIKE ? 
      AND (RutP IS NULL OR RutP = '') 
      AND Ciclo = 0
  `;
  try {
    const [rows] = await db.query(q, [`%${query}%`]);
    res.json({ results: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener sugerencias" });
  }
});

app.get("/PatenteSuggestionSalida/suggestion/:PATENTE", async (req, res) => {
  try {
    const { PATENTE } = req.params;
    const query = "SELECT * FROM registro WHERE Patente = ?";

    const [result] = await db.query(query, [PATENTE]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Patente no encontrado" });
    }

    const { Tipo, Modelo, Marca, Color, PatenteR, SelloEn, GuiaDE } = result[0];

    res.json({ Tipo, Modelo, Marca, Color, PatenteR, SelloEn, GuiaDE });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener detalles del Rut" });
  }
});

app.get("/PatenteCheck/valid", async (req, res) => {
  const { query } = req.query;

  const q = `
    SELECT COUNT(*) AS count 
    FROM registro 
    WHERE Patente = ? 
      AND (RutP IS NULL OR RutP = '') 
      AND Ciclo = 0
  `;

  try {
    const [rows] = await db.query(q, [query]);
    const isAvailable = rows[0].count === 0;

    res.json({ available: isAvailable });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al validar patente" });
  }
});
