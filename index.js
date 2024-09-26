import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { createPool } from 'mysql2/promise';
import { PORT } from './config.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bcrypt from 'bcrypt';
import authenticateToken from './authenticateToken.mjs';

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;


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
    connectionLimit: 6,  // Número máximo de conexiones simultáneas
    queueLimit: 0
})


app.use(cors({
    origin: ["https://app-sis-andes.up.railway.app" ,"https://vivacious-enthusiasm-production.up.railway.app", "http://localhost:4173" , "http://localhost:5173" ],
    methods: ["POST", "GET", "DELETE", "PUT"],
    credentials: true,
}));

app.listen(PORT, () => {
    console.log("Server connected " + PORT);
});

app.use('/ChartBox', authenticateToken);
app.use('/TopBox', authenticateToken);



app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dir = path.join(__dirname, 'imagenes');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);  // Crea la carpeta si no existe
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dir);  // Establecer la carpeta donde se guardarán las imágenes
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); // Nombre único para evitar colisiones
    }
});

const upload = multer({ storage: storage });

app.use('/imagenes', express.static(path.join(__dirname, 'imagenes')));

// GESTION LOGIN

app.get('/UserType/', async (req, res) => {
    const { RUTU } = req.query;

    if (!RUTU) {
        return res.status(400).json({ message: 'El parámetro rut es requerido' });
    }

    const sql = "SELECT TIPOU, NOMBREU FROM usuarios WHERE RUTU = ?";
    try {
        const [rows] = await db.query(sql, [RUTU.toString()]);
        if (rows.length > 0) {
            const userType = rows[0].TIPOU;
            const nombreUsuario = rows[0].NOMBREU;
            return res.json({ userType, nombreUsuario });
        } else {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
    } catch (err) {
        console.log("Error executing query:", err);
        return res.status(500).json({ Message: "Server Error" });
    }
});



app.get('/Logout', (req, res) => {
    res.clearCookie('token', { path: '/' }); // Clear the token cookie
    return res.json({ Status: "Success" });
});


app.post('/Login', async (req, res) => {
    const sql = "SELECT * FROM usuarios WHERE RUTU = ?";
    try {
        const [rows] = await db.query(sql, [req.body.rutU]);

        if (rows.length > 0) {
            const user = rows[0];
            const isMatch = req.body.passwordU === user.PASSWORDU;

            if (isMatch) {
                const rut = user.RUTU;
                const secretKey = process.env.JWT_SECRET_KEY;
                const token = jwt.sign({ rut }, secretKey, { expiresIn: '1d' });

                res.cookie('token', token, {
                    httpOnly: true,
                    secure: true,  // Railway utiliza HTTPS, por lo tanto, secure debe estar en true
                    domain: '.up.railway.app',  // El dominio base, compartido entre el frontend y el backend
                    sameSite: 'None',  // Necesario para habilitar cookies entre diferentes dominios/subdominios
                    maxAge: 24 * 60 * 60 * 1000  // 1 día
                });
                return res.json({ Status: "Success" });
            } else {
                return res.json({ Message: "Credenciales incorrectas" });
            }
        } else {
            return res.json({ Message: "Usuario no encontrado" });
        }
    } catch (err) {
        console.log("Error executing query:", err);
        return res.status(500).json({ Message: "Server Error" });
    }
});



//GESTION PERSONAL NG
app.put("/EditarPersonasReportadas/:IDNG", async (req, res) => {
    const IDNG = req.params.IDNG;
    const { RUTNG, ESTADONG } = req.body;

    try {
        // Verificar si el IDPI existe en la tabla personalinterno
        const existenciaNG = await db.query('SELECT COUNT(*) AS count FROM personasng WHERE IDNG = ?', [IDNG]);
        const count = existenciaNG[0][0].count;
        if (count === 0) {
            // El IDPI no existe en la tabla personalinterno
            res.status(404).send('La Persona no existe en la base de datos');
            return;
        }

        // El IDPI existe, actualizar los datos en la tabla personalinterno
        await db.query('UPDATE personasng SET RUTNG = ?, ESTADONG = ? WHERE IDNG = ?', [RUTNG, ESTADONG, IDNG]);

        res.send('Actualización realizada con éxito');
    } catch (error) {
        console.error('Error al realizar la actualización:', error);
        res.status(500).send('Error al realizar la actualización');
    }
});

app.get("/EditarPersonasReportadas/:IDNG", async (req, res) => {
    const { IDNG } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM personasng WHERE IDNG = ?", [IDNG]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get("/PersonasReportadas", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM personasng");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.delete("/Personas%20Reportadas/:IDNG", (req, res) => {
    const { IDNG } = req.params;
    try {
        db.query(`DELETE FROM personasng WHERE IDNG = ?`, [IDNG]);

        res.send("Usuario eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        res.status(500).send("Error al eliminar registro");
    }
});

app.post("/AgregarPersonaNG", async (req, res) => {

    const rutNG = req.body.RutNG;
    const estadoNG = req.body.EstadoNG;

    try {
        // Verificar si el RUT existe en la tabla camiones
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM personasng WHERE RUTNG = ?', [rutNG]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            // El RUT ya existe en la tabla camiones
            res.send('El RUT ya existe en la base de datos');
            return;
        }

        // El RUT no existe, insertarlo en la tabla personalexterno
        await db.query('INSERT INTO personasng (RUTNG, ESTADONG) VALUES (?, ?)', [rutNG, estadoNG]);

        res.send('Ingreso realizado con exito');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});


//GESTION INFORMES CAMION

app.get("/InformeCamion", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM revision");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get("/VerInforme/:IDR", async (req, res) => {
    const { IDR } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM revision WHERE IDR = ?", [IDR]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
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
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.get("/ProgresoRevision/:IDR", async (req, res) => {
    const { IDR } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM progresorevision WHERE IDR = ?", [IDR]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.post("/GuardarProgreso/:IDR", upload.array('FOTOS'), async (req, res) => {
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
    const fotos = req.files ? req.files.map(file => file.filename) : [];
    const fechaInicio = req.body.fechaInicio;
    const estado = "REVISANDO";
    try {
        // Verificar si ya existe un registro en progresorevision para el IDR dado
        const [existingRows] = await db.query("SELECT IDR FROM progresorevision WHERE IDR = ?", [IDR]);

        if (existingRows.length > 0) {
            // Construir consulta de actualización dinámica
            const fields = [personal, apellido, rut, patente, rol, observaciones, guiadespacho, selloCA, anden, kilos, pallets, supervisor, jefet];
            let updateQuery = "UPDATE progresorevision SET PERSONAL = ?, APELLIDO = ?, RUT = ?, PATENTE = ?, ROL = ?, OBSERVACIONES = ?, GUIADESPACHO = ?, SELLO = ?, ANDEN = ?, KILOS = ?, PALLETS = ?, SUPERVISOR = ?, JEFET = ?";

            if (fotos.length > 0) {
                updateQuery += ", FOTOS = ?";
                fields.push(fotos.join(', '));
            }

            updateQuery += " WHERE IDR = ?";
            fields.push(IDR);

            await db.query(updateQuery, fields);
            res.json({ message: 'Progreso actualizado correctamente' });
        } else {
            // Insertar un nuevo registro
            await db.query('INSERT INTO progresorevision (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, ANDEN, KILOS, PALLETS, SUPERVISOR, JEFET, FOTOS, FECHAINICIO, IDR, ESTADO) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [personal, apellido, rut, patente, rol, observaciones, guiadespacho, selloCA, anden, kilos, pallets, supervisor, jefet, fotos.join(', '), fechaInicio, IDR, estado]);
            res.json({ message: 'Progreso guardado correctamente' });
        }
    } catch (error) {
        console.error('Error al guardar el progreso:', error);
        res.status(500).json({ error: 'Error al guardar el progreso' });
    }
});

app.post("/RevisionCamion/:IDR", upload.array('FOTOS'), async (req, res) => {
    try {
        if (!req.files) {
            return res.status(400).send('No se recibieron archivos');
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
        const fotos = req.files ? req.files.map(file => file.filename) : [];
        const fechaInicio = req.body.FECHAINICIO;
        const fechaFin = req.body.FECHAFIN;
        const nombreusuario = req.body.NombreUsuario;


        await db.query('INSERT INTO revision (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, ANDEN, KILOS, PALLETS, SUPERVISOR, ENRE, JEFET, FOTOS, FECHAINICIO, FECHAFIN, IDR ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [personal, apellido, rut, patente, rol, observaciones, guiadespacho, selloCA, anden, kilos, pallets, supervisor, nombreusuario, jefet, fotos.join(', '), fechaInicio, fechaFin, IDR]);
        await db.query('UPDATE progresorevision SET ESTADO = ? WHERE IDR = ?', ['REVISADO', IDR]);
        await db.query('UPDATE registros SET CHEQUEADO = ? WHERE IDR = ?', ['SI', IDR]);

        res.send('Revision realizada correctamente');
    } catch (error) {
        console.error('Error al marcar salida:', error);
        res.status(500).send('Error al marcar salida');
    }
});

//GESTION MANTENEDOR PERSONAL INTERNO

app.put("/EditarPersonalInterno/:IDPI", async (req, res) => {
    const IDPI = req.params.IDPI;
    const { RUTPI, NOMBREPI, APELLIDOPI, ROLPI, ESTADOPI, VEHICULOPI, MODELOPI, PATENTEPI, COLORPI } = req.body;

    try {
        // Verificar si el IDPI existe en la tabla personalinterno
        const existenciaPI = await db.query('SELECT COUNT(*) AS count FROM personalinterno WHERE IDPI = ?', [IDPI]);
        const count = existenciaPI[0][0].count;
        if (count === 0) {
            // El IDPI no existe en la tabla personalinterno
            res.status(404).send('El IDPI no existe en la base de datos');
            return;
        }

        // El IDPI existe, actualizar los datos en la tabla personalinterno
        await db.query('UPDATE personalinterno SET RUTPI = ?, NOMBREPI = ?, APELLIDOPI = ?, ROLPI = ?, ESTADOPI = ?, VEHICULOPI = ?, MODELOPI = ?, PATENTEPI = ?, COLORPI = ? WHERE IDPI = ?', [RUTPI, NOMBREPI, APELLIDOPI, ROLPI, ESTADOPI, VEHICULOPI, MODELOPI, PATENTEPI, COLORPI, IDPI]);

        res.send('Actualización realizada con éxito');
    } catch (error) {
        console.error('Error al realizar la actualización:', error);
        res.status(500).send('Error al realizar la actualización');
    }
});

app.get("/EditarPersonalInterno/:IDPI", async (req, res) => {
    const { IDPI } = req.params;
    try {
        const [rows] = await db.query("SELECT * FROM personalinterno WHERE IDPI = ?", [IDPI]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.delete("/Personal%20Interno/:IDPI", (req, res) => {
    const { IDPI } = req.params;
    try {
        db.query(`DELETE FROM personalinterno WHERE IDPI = ?`, [IDPI]);
        res.send("Usuario eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        res.status(500).send("Error al eliminar registro");
    }
});


app.post("/AgregarPersonalInterno", async (req, res) => {
    const rutPI = req.body.rutPI;
    const nombrePI = req.body.NombrePI;
    const apellidoPI = req.body.ApellidoPI;
    const vehiculoPI = req.body.VehiculoPI;
    const modeloPI = req.body.ModeloPI;
    const colorPI = req.body.ColorPI;
    const patentePI = req.body.PatentePI;
    const rolPI = req.body.RolPI;
    const estadoPI = "VIGENTE";


    try {
        // Verificar si el RUT existe en la tabla personalinterno
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM personalinterno WHERE RUTPI = ?', [rutPI]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            // El RUT ya existe en la tabla personalinterno
            res.send('El RUT ya existe en la base de datos');
            return;
        }

        // El RUT no existe, insertarlo en la tabla personalinterno
        await db.query('INSERT INTO personalinterno (RUTPI, nombrePI, apellidoPI, vehiculoPI, colorPI, patentePI, rolPI, estadoPI, modeloPI) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [rutPI, nombrePI, apellidoPI, vehiculoPI, colorPI, patentePI, rolPI, estadoPI, modeloPI]);

        res.send('Ingreso realizado con exito');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});








//GESTION MANTENEDOR PERSONAL EXTERNO

app.put("/EditarPersonalExterno/:IDPE", async (req, res) => {
    const IDPE = req.params.IDPE;
    const { RUTPE, NOMBREPE, APELLIDOPE, ROLPE, EMPRESAPE, ESTADOPE, VEHICULOPE, MODELOPE, PATENTEPE, COLORPE } = req.body;

    try {
        // Verificar si el IDPE existe en la tabla personalinterno
        const existenciaPI = await db.query('SELECT COUNT(*) AS count FROM personalexterno WHERE IDPE = ?', [IDPE]);
        const count = existenciaPI[0][0].count;
        if (count === 0) {
            // El IDPI no existe en la tabla personalinterno
            res.status(404).send('El IDPE no existe en la base de datos');
            return;
        }

        // El IDPI existe, actualizar los datos en la tabla personalinterno
        await db.query('UPDATE personalexterno SET RUTPE = ?, NOMBREPE = ?, APELLIDOPE = ?, ROLPE = ?, EMPRESAPE = ?, ESTADOPE = ?, VEHICULOPE = ?, PATENTEPE = ?, COLORPE = ?, MODELOPE = ? WHERE IDPE = ?', [RUTPE, NOMBREPE, APELLIDOPE, ROLPE, EMPRESAPE, ESTADOPE, VEHICULOPE, PATENTEPE, COLORPE, MODELOPE, IDPE]);

        res.send('Actualización realizada con éxito');
    } catch (error) {
        console.error('Error al realizar la actualización:', error);
        res.status(500).send('Error al realizar la actualización');
    }
});

app.get("/EditarPersonalExterno/:IDPE", async (req, res) => {
    const { IDPE } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM personalexterno WHERE IDPE = ?", [IDPE]);
        res.json(rows);

    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.delete("/Personal%20Externo/:IDPE", (req, res) => {
    const { IDPE } = req.params;
    try {
        db.query(`DELETE FROM personalexterno WHERE IDPE = ?`, [IDPE]);

        res.send("Usuario eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        res.status(500).send("Error al eliminar registro");
    }
});

app.post("/AgregarPersonalExterno", async (req, res) => {
    const rutPE = req.body.rutPE;
    const nombrePE = req.body.NombrePE;
    const apellidoPE = req.body.ApellidoPE;
    const vehiculoPE = req.body.VehiculoPE;
    const modeloPE = req.body.ModeloPE;
    const colorPE = req.body.ColorPE;
    const patentePE = req.body.PatentePE;
    const rolPE = req.body.RolPE;
    const empresaPE = req.body.EmpresaPE;
    const estadoPE = "VIGENTE";


    try {
        // Verificar si el RUT existe en la tabla personalinterno
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM personalexterno WHERE RUTPE = ?', [rutPE]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            // El RUT ya existe en la tabla personalinterno
            res.send('El RUT ya existe en la base de datos');
            return;
        }

        // El RUT no existe, insertarlo en la tabla personalexterno
        await db.query('INSERT INTO personalexterno (RUTPE, nombrePE, apellidoPE, vehiculoPE, modeloPE, colorPE, patentePE, rolPE, empresaPE, estadoPE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [rutPE, nombrePE, apellidoPE, vehiculoPE, modeloPE, colorPE, patentePE, rolPE, empresaPE, estadoPE]);

        res.send('Ingreso realizado con exito');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});




//GESTION MANTENEDOR CAMION

app.put("/EditarCamiones/:IDCA", async (req, res) => {
    const IDCA = req.params.IDCA;
    const { RUTCA, CHOFERCA, APELLIDOCHOFERCA, PATENTECA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA, ESTADOCA } = req.body;

    try {
        // Verificar si el IDPE existe en la tabla camiones
        const existenciaPI = await db.query('SELECT COUNT(*) AS count FROM camiones WHERE IDCA = ?', [IDCA]);
        const count = existenciaPI[0][0].count;
        if (count === 0) {
            // El IDPI no existe en la tabla camiones
            res.status(404).send('El IDCA no existe en la base de datos');
            return;
        }

        // El IDPI existe, actualizar los datos en la tabla camiones
        await db.query('UPDATE camiones SET CHOFERCA = ?, APELLIDOCHOFERCA = ?, RUTCA = ?, PATENTECA = ?, MARCACA = ?, TIPOCA = ?, MODELOCA = ?, COLORCA = ?, EMPRESACA = ?, ESTADOCA = ? WHERE IDCA = ?', [CHOFERCA, APELLIDOCHOFERCA, RUTCA, PATENTECA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA, ESTADOCA, IDCA]);


        res.send('Actualización realizada con éxito');
    } catch (error) {
        console.error('Error al realizar la actualización:', error);
        res.status(500).send('Error al realizar la actualización');
    }
});

app.get("/EditarCamiones/:IDCA", async (req, res) => {
    const { IDCA } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM camiones WHERE IDCA = ?", [IDCA]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.delete("/camiones/:IDCA", async (req, res) => {
    const { IDCA } = req.params;
    try {
        await db.query(`DELETE FROM camiones WHERE IDCA = ?`, [IDCA]);

        res.send("Usuario eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        res.status(500).send("Error al eliminar registro");
    }
});

app.post("/AgregarCamion", async (req, res) => {
    const choferCA = req.body.ChoferCA;
    const apellidoCA = req.body.ApellidoCA;
    const rutCA = req.body.RutCA;
    const tipoCA = req.body.TipoCA;
    const modeloCA = req.body.ModeloCA;
    const colorCA = req.body.ColorCA;
    const patenteCA = req.body.PatenteCA;
    const marcaCA = req.body.MarcaCA;
    const empresaCA = req.body.EmpresaCA;
    const estadoCA = "VIGENTE";

    try {
        // Verificar si el RUT existe en la tabla camiones
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM camiones WHERE RUTCA = ?', [rutCA]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            // El RUT ya existe en la tabla camiones
            res.send('El RUT ya existe en la base de datos');
            return;
        }

        // El RUT no existe, insertarlo en la tabla personalexterno
        await db.query('INSERT INTO camiones (CHOFERCA, APELLIDOCHOFERCA, RUTCA, PATENTECA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA, ESTADOCA) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidoCA, rutCA, patenteCA, marcaCA, tipoCA, modeloCA, colorCA, empresaCA, estadoCA]);

        res.send('Ingreso realizado con exito');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});



//GESTION DE PERSONAL EXTERNO

app.get("/Personal%20Externo", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM personalexterno");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get('/FormularioPersonalExterno/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        const q = "SELECT * FROM personalexterno WHERE RUTPE LIKE ? AND ESTADOPE = 'VIGENTE'";
        const results = await db.query(q, [`%${query}%`]);
        const suggestions = results.map((result) => result.RUTPE);
        res.json({ results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener sugerencias' });
    }
});

app.get('/FormularioPersonalExterno/suggestion/:RUTPE', async (req, res) => {
    try {
        const { RUTPE } = req.params;
        const query = `
            SELECT 
                pe.NOMBREPE, pe.APELLIDOPE, pe.VEHICULOPE, pe.COLORPE, 
                pe.PATENTEPE, pe.ROLPE, pe.EMPRESAPE, pe.MODELOPE, png.ESTADONG
            FROM 
                personalexterno pe
            LEFT JOIN 
                personasng png ON pe.RUTPE = png.RUTNG
            WHERE 
                pe.RUTPE = ?
        `;

        const [result] = await db.query(query, [RUTPE]);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Rut no encontrado' });
        }

        const { NOMBREPE, APELLIDOPE, VEHICULOPE, COLORPE, PATENTEPE, ROLPE, EMPRESAPE, MODELOPE, ESTADONG } = result[0];


        res.json({ NOMBREPE, APELLIDOPE, VEHICULOPE, COLORPE, PATENTEPE, ROLPE, EMPRESAPE, MODELOPE, ESTADONG });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener detalles del Rut' });
    }
});

app.post("/FormularioPersonalExterno", async (req, res) => {
    const {
        rutPE, NombrePE, ApellidoPE, VehiculoPE, ModeloPE, ColorPE, PatentePE,
        EmpresaPE, RolPE, ObservacionesPE, fechaActualChile, ignoreWarning
    } = req.body;
    const NombreUsuarioEX = req.body.NombreUsuarioEX;
    const GuiaDespachoPE = req.body.GuiaDespachoPE;
    const SelloPE = req.body.SelloPE;
    const IDINST = req.body.idinst;
    const estado = "INGRESO";
    const estadoPE = "VIGENTE";
    const chequeo = "NO";

    try {

        if (!ignoreWarning) {
            // Verificar si el RUT ya existe en la misma instalación
            const result = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST = ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutPE, IDINST]
            );

            if (result[0].length > 0) {
                const nombreInstalacion = result[0][0].NOMBREINST;
                return res.status(400).json({
                    error: `Esta persona ya está registrada en la instalación: ${nombreInstalacion}.`
                });
            }

            // Verificar si el RUT está en otras instalaciones
            const resultOtherInst = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST <> ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutPE, IDINST]
            );

            if (resultOtherInst[0].length > 0) {
                const nombreOtraInstalacion = resultOtherInst[0][0].NOMBREINST;
                return res.status(200).json({
                    warning: `Esta persona está registrada en la instalación: ${nombreOtraInstalacion}. ¿Desea continuar con el registro?`
                });
            }
        }

        // Verificar si el RUT ya existe en la tabla personalexterno
        const rutExistente = await db.query(
            'SELECT COUNT(*) AS count FROM personalexterno WHERE RUTPE = ?',
            [rutPE]
        );
        const count = rutExistente[0][0].count;

        if (count > 0) {
            await db.query(
                'INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, CHEQUEADO, GUARDIA, VEHICULO, MODELO, COLOR, SELLO, GUIADESPACHO, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [NombrePE, ApellidoPE, rutPE, PatentePE, RolPE, ObservacionesPE, fechaActualChile, estado, chequeo, NombreUsuarioEX, VehiculoPE, ModeloPE, ColorPE, SelloPE, GuiaDespachoPE, IDINST]
            );

            await db.query(
                'INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, GUARDIA, VEHICULO, MODELO, COLOR, SELLO, GUIADESPACHO, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [NombrePE, ApellidoPE, rutPE, PatentePE, RolPE, ObservacionesPE, fechaActualChile, estado, NombreUsuarioEX, VehiculoPE, ModeloPE, ColorPE, SelloPE, GuiaDespachoPE, IDINST]
            );

            res.send('Entrada/salida registrada correctamente');
            return;
        }

        // Insertar en personalexterno
        await db.query(
            'INSERT INTO personalexterno (RUTPE, NOMBREPE, APELLIDOPE, VEHICULOPE, COLORPE, PATENTEPE, EMPRESAPE, ROLPE, ESTADOPE, MODELOPE ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [rutPE, NombrePE, ApellidoPE, VehiculoPE, ColorPE, PatentePE, EmpresaPE, RolPE, estadoPE, ModeloPE]
        );

        await db.query(
            'INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, CHEQUEADO, GUARDIA, VEHICULO, MODELO, COLOR, SELLO, GUIADESPACHO, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [NombrePE, ApellidoPE, rutPE, PatentePE, RolPE, ObservacionesPE, fechaActualChile, estado, chequeo, NombreUsuarioEX, VehiculoPE, ModeloPE, ColorPE, SelloPE, GuiaDespachoPE, IDINST]
        );

        await db.query(
            'INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, GUARDIA, VEHICULO, MODELO, COLOR, SELLO, GUIADESPACHO, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [NombrePE, ApellidoPE, rutPE, PatentePE, RolPE, ObservacionesPE, fechaActualChile, estado, NombreUsuarioEX, VehiculoPE, ModeloPE, ColorPE, SelloPE, GuiaDespachoPE, IDINST]
        );

        res.send('Entrada/salida registrada correctamente');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});




//GESTION PERSONAL INTERNO

app.get("/Personal%20Interno", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM personalinterno");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get('/FormularioPersonalInterno/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        const q = "SELECT * FROM personalinterno WHERE RUTPI LIKE ? AND ESTADOPI = 'VIGENTE'";
        const results = await db.query(q, [`%${query}%`]);
        const suggestions = results.map((result) => result.RUTPI);
        res.json({ results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener sugerencias' });
    }
});


app.get('/FormularioPersonalInterno/suggestion/:RUTPI', async (req, res) => {
    try {
        const { RUTPI } = req.params;
        const query = `
            SELECT 
                pi.NOMBREPI, pi.APELLIDOPI, pi.VEHICULOPI, pi.COLORPI, 
                pi.PATENTEPI, pi.ROLPI, pi.MODELOPI, png.ESTADONG
            FROM 
                personalinterno pi
            LEFT JOIN 
                personasng png ON pi.RUTPI = png.RUTNG
            WHERE 
                pi.RUTPI = ?
        `;

        const [result] = await db.query(query, [RUTPI]);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Rut no encontrado' });
        }

        const { NOMBREPI, APELLIDOPI, VEHICULOPI, COLORPI, PATENTEPI, ROLPI, MODELOPI, ESTADONG } = result[0];


        res.json({ NOMBREPI, APELLIDOPI, VEHICULOPI, COLORPI, PATENTEPI, ROLPI, MODELOPI, ESTADONG });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener detalles del Rut' });
    }
});


app.post("/FormularioPersonalInterno", async (req, res) => {
    const rutPI = req.body.RUTPI;
    const nombrePI = req.body.NOMBREPI;
    const apellidoPI = req.body.APELLIDOPI;
    const vehiculoPI = req.body.VEHICULOPI;
    const modeloPI = req.body.MODELOPI;
    const colorPI = req.body.COLORPI;
    const patentePI = req.body.PATENTEPI;
    const rolPI = req.body.ROLPI;
    const observacionesPI = req.body.OBSERVACIONESPI;
    const fechaActualChile = req.body.fechaActualChile;
    const NombreUsuarioI = req.body.NombreUsuarioI;
    const estado = "INGRESO";
    const estadoPI = "VIGENTE";
    const chequeo = "NO";
    const IDINST = req.body.idinst;
    const ignoreWarning = req.body;
    try {
        if (!ignoreWarning) {
            // Verificar si el RUT ya existe en la misma instalación
            const result = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST = ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutPI, IDINST]
            );

            if (result[0].length > 0) {
                const nombreInstalacion = result[0][0].NOMBREINST;
                return res.status(400).json({
                    error: `Esta persona ya está registrada en la instalación: ${nombreInstalacion}.`
                });
            }

            // Verificar si el RUT está en otras instalaciones
            const resultOtherInst = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST <> ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutPI, IDINST]
            );

            if (resultOtherInst[0].length > 0) {
                const nombreOtraInstalacion = resultOtherInst[0][0].NOMBREINST;
                return res.status(200).json({
                    warning: `Esta persona está registrada en la instalación: ${nombreOtraInstalacion}. ¿Desea continuar con el registro?`
                });
            }
        }

        const rutExistenteRegistros = await db.query('SELECT COUNT(*) AS count FROM registros WHERE RUT = ?', [rutPI]);
        const countRegistros = rutExistenteRegistros[0][0].count;
        if (countRegistros > 0) {
            return res.status(400).json({ error: 'Esta persona se encuentra en las instalaciones' });
        }

        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM personalinterno WHERE RUTPI = ?', [rutPI]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            await db.query('INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, CHEQUEADO, GUARDIA, VEHICULO, MODELO, COLOR, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nombrePI, apellidoPI, rutPI, patentePI, rolPI, observacionesPI, fechaActualChile, estado, chequeo, NombreUsuarioI, vehiculoPI, modeloPI, colorPI, IDINST]);

            await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, GUARDIA, VEHICULO, MODELO, COLOR, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nombrePI, apellidoPI, rutPI, patentePI, rolPI, observacionesPI, fechaActualChile, estado, NombreUsuarioI, vehiculoPI, modeloPI, colorPI, IDINST]);

            res.send('Entrada/salida registrada correctamente');
            return;
        }

        await db.query('INSERT INTO personalinterno (RUTPI, nombrePI, apellidoPI, vehiculoPI, colorPI, patentePI, rolPI, estadoPI, modeloPI) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [rutPI, nombrePI, apellidoPI, vehiculoPI, colorPI, patentePI, rolPI, estadoPI, modeloPI]);
        await db.query('INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, CHEQUEADO, GUARDIA, VEHICULO, MODELO, COLOR, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nombrePI, apellidoPI, rutPI, patentePI, rolPI, observacionesPI, fechaActualChile, estado, chequeo, NombreUsuarioI, vehiculoPI, modeloPI, colorPI, IDINST]);

        await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, FECHAINGRESO, ESTADO, GUARDIA, VEHICULO, MODELO, COLOR, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nombrePI, apellidoPI, rutPI, patentePI, rolPI, observacionesPI, fechaActualChile, estado, NombreUsuarioI, vehiculoPI, modeloPI, colorPI, IDINST]);

        res.send('Entrada/salida registrada correctamente');

    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});

// GESTION CAMIONES

app.get("/Camiones", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM camiones");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get('/FormularioCamiones/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        const q = "SELECT * FROM camiones WHERE PATENTECA LIKE ? AND ESTADOCA = 'VIGENTE'";
        const results = await db.query(q, [`%${query}%`]);
        res.json({ results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener sugerencias' });
    }
});


app.get('/FormularioCamiones/suggestion/:PATENTECA', async (req, res) => {
    try {
        const { PATENTECA } = req.params;
        const query = "SELECT * FROM camiones WHERE PATENTECA = ?";

        const [result] = await db.query(query, [PATENTECA]);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Patente no encontrado' });
        }

        const { CHOFERCA, APELLIDOCHOFERCA, RUTCA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA } = result[0];


        res.json({ CHOFERCA, APELLIDOCHOFERCA, RUTCA, PATENTECA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener detalles del Rut' });
    }
});


app.post("/FormularioCamiones", async (req, res) => {
    const choferCA = req.body.ChoferCA;
    const apellidochoferCA = req.body.ApellidoChoferCA;
    const rutCA = req.body.RutCA;
    const patenteCA = req.body.PatenteCA;
    const patenteRACA = req.body.PatenteRACA;
    const marcaCA = req.body.MarcaCA;
    const tipoCA = req.body.TipoCA;
    const modeloCA = req.body.ModeloCA;
    const colorCA = req.body.ColorCA;
    const selloCA = req.body.SelloCA;
    const empresaCA = req.body.EmpresaCA;
    const observacionesCA = req.body.ObservacionesCA;
    const guiaDespachoCA = req.body.GuiaDespachoCA;
    const fechaActualChile = req.body.fechaActualChile;
    const estadoCA = "VIGENTE";
    const estado = "INGRESO";
    const chequeo = "NO";
    const rolCA = req.body.TipoCA;
    const NombreUsuarioCA = req.body.NombreUsuarioCA;
    const IDINST = req.body.idinst;
    const ignoreWarning = req.body;

    try {
        if (!ignoreWarning) {
            // Verificar si el RUT ya existe en la misma instalación
            const result = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST = ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutCA, IDINST]
            );

            if (result[0].length > 0) {
                const nombreInstalacion = result[0][0].NOMBREINST;
                return res.status(400).json({
                    error: `Esta persona ya está registrada en la instalación: ${nombreInstalacion}.`
                });
            }

            // Verificar si el RUT está en otras instalaciones
            const resultOtherInst = await db.query(
                `SELECT i.NOMBREINST
                FROM registros r
                JOIN instalaciones i ON r.IDINST = i.IDINST
                WHERE r.RUT = ? AND r.IDINST <> ?
                ORDER BY r.FECHAINGRESO DESC
                LIMIT 1`,
                [rutCA, IDINST]
            );

            if (resultOtherInst[0].length > 0) {
                const nombreOtraInstalacion = resultOtherInst[0][0].NOMBREINST;
                return res.status(200).json({
                    warning: `Esta persona está registrada en la instalación: ${nombreOtraInstalacion}. ¿Desea continuar con el registro?`
                });
            }
        }

        // Verificar si el RUT ya existe en la tabla personalexterno
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM camiones WHERE RUTCA = ?', [rutCA]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            await db.query('INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, FECHAINGRESO, SELLO, ESTADO, CHEQUEADO, GUARDIA, PATENTERACA, VEHICULO, MODELO, COLOR, MARCA, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidochoferCA, rutCA, patenteCA, rolCA, observacionesCA, guiaDespachoCA, fechaActualChile, selloCA, estado, chequeo, NombreUsuarioCA, patenteRACA, tipoCA, modeloCA, colorCA, marcaCA, IDINST]);

            await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, FECHAINGRESO, ESTADO, GUARDIA, PATENTERACA, VEHICULO, MODELO, COLOR, MARCA, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidochoferCA, rutCA, patenteCA, rolCA, observacionesCA, guiaDespachoCA, selloCA, fechaActualChile, estado, NombreUsuarioCA, patenteRACA, tipoCA, modeloCA, colorCA, marcaCA, IDINST]);

            res.send('Entrada/salida registrada correctamente');
            return;
        }

        await db.query('INSERT INTO camiones (CHOFERCA, APELLIDOCHOFERCA, RUTCA, PATENTECA, MARCACA, TIPOCA, MODELOCA, COLORCA, EMPRESACA, ESTADOCA) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidochoferCA, rutCA, patenteCA, marcaCA, tipoCA, modeloCA, colorCA, empresaCA, estadoCA]);
        await db.query('INSERT INTO registros (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, FECHAINGRESO, SELLO, ESTADO, CHEQUEADO, GUARDIA, PATENTERACA, VEHICULO, MODELO, COLOR, MARCA, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidochoferCA, rutCA, patenteCA, rolCA, observacionesCA, guiaDespachoCA, fechaActualChile, selloCA, estado, chequeo, NombreUsuarioCA, patenteRACA, tipoCA, modeloCA, colorCA, marcaCA, IDINST]);

        await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, FECHAINGRESO, ESTADO, GUARDIA, PATENTERACA, VEHICULO, MODELO, COLOR, MARCA, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [choferCA, apellidochoferCA, rutCA, patenteCA, rolCA, observacionesCA, guiaDespachoCA, selloCA, fechaActualChile, estado, NombreUsuarioCA, patenteRACA, tipoCA, modeloCA, colorCA, marcaCA, IDINST]);

        res.send('Entrada/salida registrada correctamente');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});

// GESTION DE INGRESOS/SALIDAS



app.get("/TablaIngreso", async (req, res) => {
    try {
        const { IDINST } = req.query;

        if (!IDINST) {
            return res.status(400).json({ error: 'Se requiere el IDINST' });
        }

        // Consulta para obtener los registros filtrados por IDINST y otros criterios
        const query = `
            SELECT * FROM registros 
            WHERE ESTADO = 'INGRESO' 
            AND ROL IN ('SEMIREMOLQUE', 'CAMION', 'TRACTOCAMION', 'CHASIS CABINADO', 'REMOLQUE', 'OtrosCA')
            AND IDINST = ?
        `;

        const [rows] = await db.query(query, [IDINST]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.get("/FormularioSalida/:IDR", async (req, res) => {
    const { IDR } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM registros WHERE IDR = ?", [IDR]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.post("/FormularioSalida/:IDR", async (req, res) => {
    const IDR = req.params.IDR;
    const patente = req.body.PATENTE;
    const rol = req.body.ROL;
    const vehiculo = req.body.ROL;
    const modelo = req.body.MODELO;
    const color = req.body.COLOR;
    const marca = req.body.MARCA;
    const rut = req.body.RUT;
    const personal = req.body.PERSONAL;
    const apellido = req.body.APELLIDO;
    const guiadespacho = req.body.GUIADESPACHO;
    const sello = req.body.SELLO;
    const patenteraca = req.body.PATENTERACA;
    const observaciones = req.body.OBSERVACIONES;
    const estado = "SALIDA";
    const fechasalida = req.body.FECHASALIDA;
    const nombreUsuario = req.body.NombreUsuario;
    const IDINST = req.body.IDINST;
    try {

        await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, FECHASALIDA, GUARDIA, PATENTERACA, ESTADO, VEHICULO, MODELO, COLOR, MARCA, IDINST) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [personal, apellido, rut, patente, rol, observaciones, guiadespacho, sello, fechasalida, nombreUsuario, patenteraca, estado, vehiculo, modelo, color, marca, IDINST]);

        // await db.query('UPDATE registros SET ESTADO = ? WHERE IDR = ?', ['SALIDA', IDR]);
        await db.query('DELETE FROM registros WHERE IDR = ?', [IDR]);

        res.send('Salida registrada correctamente');

    } catch (error) {
        console.error('Error al marcar salida:', error);
        res.status(500).send('Error al marcar salida');
    }
});



app.post("/marcarSalida", (req, res) => {
    const { IDR, ROL } = req.body;
    const fechaSalida = new Date().toISOString().slice(0, 19).replace('T', ' ');
    FormularioSalida
    db.query('UPDATE registros SET ESTADO = ?, FECHASALIDA = ? WHERE IDR = ?', ['SALIDA', fechaSalida, IDR], (err, result) => {
        if (err) {
            console.error('Error al marcar salida:', err);
            res.status(500).send('Error al marcar salida');
            return;
        }
        res.send('Salida registrada correctamente');
    });
});




// GESTION HOME

app.get("/TopBox", authenticateToken, async (req, res) => {
    const idInst = req.query.idInst;

    if (!idInst) {
        return res.status(400).json({ error: 'IDINST es requerido' });
    }

    try {
        const data = await db.query("SELECT * FROM logs WHERE IDINST = ?", [idInst]);
        res.json(data);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get("/ChartBox", authenticateToken, async (req, res) => {
    const { idinst } = req.query;

    if (!idinst) {
        return res.status(400).json({ error: "IDINST is required" });
    }

    try {
        const [data] = await db.query("SELECT * FROM registros WHERE IDINST = ?", [idinst]);
        res.json(data);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


// GESTION NOVEDADES

app.get("/TablaNovedad", async (req, res) => {
    const { IDINST } = req.query;

    if (!IDINST) {
        return res.status(400).json({ error: 'IDINST es requerido' });
    }

    try {
        const [rows] = await db.query("SELECT * FROM novedades WHERE IDINST = ?", [IDINST]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});



app.post("/AgregarNO", upload.array('FOTOSNO', 10), async (req, res) => {
    const NotaNO = req.body.NotaNO;
    const GuardiaNO = req.body.GuardiaNO;
    const HoraNO = req.body.HoraNO;
    const IDINST = req.body.IDINST;

    // Obtener los nombres de los archivos subidos
    const FOTOSNO = req.files ? req.files.map(file => file.filename) : [];

    try {
        // Guarda los datos en la base de datos
        await db.query('INSERT INTO novedades (HORANO, GUARDIANO, NOTANO, FOTOSNO, IDINST ) VALUES (?, ?, ?, ?, ?)', 
        [HoraNO, GuardiaNO, NotaNO, FOTOSNO.join(', '), IDINST]);

        res.send('Novedad registrada con éxito');
    } catch (error) {
        console.error('Error al registrar la novedad:', error);
        res.status(500).send('Error al registrar la novedad');
    }
});


app.get("/VerNO/:IDNO", async (req, res) => {
    const { IDNO } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM novedades WHERE IDNO = ?", [IDNO]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


//GESTION CONTRASEÑA






//GESTION USUARIOS

app.get("/Usuarios", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM usuarios");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.post("/AgregarU", async (req, res) => {

    const rutU = req.body.RutU;
    const nombreU = req.body.NombreU;
    const tipoU = req.body.TipoU;
    const passwordU = req.body.PasswordU;

    try {
        // Verificar si el RUT existe en la tabla camiones
        const rutExistente = await db.query('SELECT COUNT(*) AS count FROM usuarios WHERE RUTU = ?', [rutU]);
        const count = rutExistente[0][0].count;
        if (count > 0) {
            // El RUT ya existe en la tabla camiones
            res.send('El RUT ya existe en la base de datos');
            return;
        }

        // El RUT no existe, insertarlo en la tabla personalexterno
        await db.query('INSERT INTO usuarios (RUTU, NOMBREU, TIPOU, PASSWORDU) VALUES (?, ?, ?, ?)', [rutU, nombreU, tipoU, passwordU]);

        res.send('Ingreso realizado con exito');
    } catch (error) {
        console.error('Error al registrar ingreso:', error);
        res.status(500).send('Error al registrar ingreso');
    }
});

app.delete("/Usuarios/:IDU", (req, res) => {
    const { IDU } = req.params;
    try {
        db.query(`DELETE FROM usuarios WHERE IDU = ?`, [IDU]);

        res.send("Usuario eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        res.status(500).send("Error al eliminar registro");
    }
});

app.put("/EditarU/:IDU", async (req, res) => {
    const IDU = req.params.IDU;
    const { RUTU, NOMBREU, TIPOU, PASSWORDU, IDINST } = req.body;

    try {
        // Verificar si el IDPI existe en la tabla personalinterno
        const existenciaNG = await db.query('SELECT COUNT(*) AS count FROM usuarios WHERE IDU = ?', [IDU]);
        const count = existenciaNG[0][0].count;
        if (count === 0) {
            // El IDPI no existe en la tabla personalinterno
            res.status(404).send('La Persona no existe en la base de datos');
            return;
        }

        // El IDPI existe, actualizar los datos en la tabla personalinterno
        await db.query('UPDATE usuarios SET RUTU = ?, NOMBREU = ?, TIPOU = ?, PASSWORDU = ?, IDINST = ? WHERE IDU = ?', [RUTU, NOMBREU, TIPOU, PASSWORDU, IDINST, IDU]);

        res.send('Actualización realizada con éxito');
    } catch (error) {
        console.error('Error al realizar la actualización:', error);
        res.status(500).send('Error al realizar la actualización');
    }
});

app.get("/EditarUsuarios/:IDU", async (req, res) => {
    const { IDU } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM usuarios WHERE IDU = ?", [IDU]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});



//GESTION TABLA INGRESO RE

app.get("/TablaIngresoRE", async (req, res) => {
    try {
        const { IDINST } = req.query; // Obtenemos IDINST de los parámetros de la solicitud

        if (!IDINST) {
            return res.status(400).json({ error: 'Se requiere el IDINST' });
        }

        const query = `
            SELECT registros.*, progresorevision.ESTADO AS estadoRevision 
            FROM registros 
            LEFT JOIN progresorevision ON registros.IDR = progresorevision.IDR 
            WHERE registros.ESTADO = 'INGRESO'
            AND registros.ROL NOT IN ('SEMIREMOLQUE', 'CAMION', 'TRACTOCAMION', 'CHASIS CABINADO', 'REMOLQUE', 'OtrosCA')
            AND registros.IDINST = ?
        `;

        const [rows, fields] = await db.query(query, [IDINST]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.get("/FormularioSalidaRE/:IDR", async (req, res) => {
    const { IDR } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM registros WHERE IDR = ?", [IDR]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.post("/FormularioSalidaRE/:IDR", async (req, res) => {
    const IDR = req.params.IDR;
    const personal = req.body.PERSONAL;
    const apellido = req.body.APELLIDO;
    const rut = req.body.RUT;
    const patente = req.body.PATENTE;
    const vehiculo = req.body.VEHICULO;
    const modelo = req.body.MODELO;
    const color = req.body.COLOR;
    const rol = req.body.ROL;
    const observaciones = req.body.OBSERVACIONES;
    const guiadespacho = req.body.GUIADESPACHO;
    const sello = req.body.SELLO;
    const estado = "SALIDA";
    const fechasalida = req.body.FECHASALIDA;
    const IDINST = req.body.IDINST;
    const nombreUsuario = req.body.NombreUsuario;

    try {

        await db.query('INSERT INTO logs (PERSONAL, APELLIDO, RUT, PATENTE, ROL, OBSERVACIONES, GUIADESPACHO, SELLO, FECHASALIDA, GUARDIA, ESTADO, VEHICULO, MODELO, COLOR, IDINST ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [personal, apellido, rut, patente, rol, observaciones, guiadespacho, sello, fechasalida, nombreUsuario, estado, vehiculo, modelo, color, IDINST]);

        // await db.query('UPDATE registros SET ESTADO = ? WHERE IDR = ?', ['SALIDA', IDR]);
        await db.query('DELETE FROM registros WHERE IDR = ?', [IDR]);

        res.send('Salida registrada correctamente');

    } catch (error) {
        console.error('Error al marcar salida:', error);
        res.status(500).send('Error al marcar salida');
    }
});


//GESTION NOMBRE USUARIO

app.get("/NombreUser", async (req, res) => {
    try {
        const [rows, fields] = await db.query("SELECT * FROM usuarios");
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

app.get("/IDINST", authenticateToken, async (req, res) => {
    const rut = req.user.rut; // Ya se verifica en el middleware

    try {
        const [rows] = await db.query("SELECT IDINST FROM usuarios WHERE RUTU = ?", [rut]);

        if (rows.length > 0) {
            return res.json({ IDINST: rows[0].IDINST });
        } else {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
        return res.status(500).json({ error: 'Error del servidor' });
    }
});




app.get("/NombreInstalacion", async (req, res) => {
    try {
        const { IDINST } = req.query;

        if (!IDINST) {
            return res.status(400).json({ error: 'Se requiere el IDINST' });
        }

        // Consulta para obtener el nombre de la instalación
        const [rows] = await db.query("SELECT NOMBREINST FROM instalaciones WHERE IDINST = ?", [IDINST]);

        if (rows.length > 0) {
            res.json({ nombreINST: rows[0].NOMBREINST });
        } else {
            res.status(404).json({ error: 'Instalación no encontrada' });
        }
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});

//GESTION LOG


app.get("/Logs", async (req, res) => {
    try {
        const { IDINST } = req.query;

        if (!IDINST) {
            return res.status(400).json({ error: 'Se requiere el IDINST' });
        }

        const query = `
            SELECT * FROM logs 
            WHERE IDINST = ?
        `;

        const [rows] = await db.query(query, [IDINST]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});


app.get("/VerLog/:IDL", async (req, res) => {
    const { IDL } = req.params;
    try {
        const [rows, fields] = await db.query("SELECT * FROM logs WHERE IDL = ?", [IDL]);
        res.json(rows);
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        res.status(500).json({ error: 'Error al ejecutar la consulta' });
    }
});