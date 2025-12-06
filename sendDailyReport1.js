import mysql from "mysql2/promise";
import dayjs from "dayjs";
import XLSX from "xlsx";
import Brevo from "@getbrevo/brevo";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const DEBUG = true;

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const sendDailyReport = async () => {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
  });

  const reportDate = dayjs("2025-07-01");
  const start = reportDate
    .hour(6)
    .minute(0)
    .second(0)
    .format("YYYY-MM-DD HH:mm:ss");
  const end = reportDate
    .hour(20)
    .minute(0)
    .second(0)
    .format("YYYY-MM-DD HH:mm:ss");

  // const start = dayjs().hour(7).minute(0).second(0).format("YYYY-MM-DD HH:mm:ss");
  // const end = dayjs().hour(20).minute(0).second(0).format("YYYY-MM-DD HH:mm:ss");

const [rows] = await connection.execute(
  `
  SELECT * FROM registro
  WHERE 
    (STR_TO_DATE(FechaEntrada, '%d-%m-%Y %H:%i') BETWEEN ? AND ?) OR 
    (STR_TO_DATE(FechaSalida, '%d-%m-%Y %H:%i') BETWEEN ? AND ?)
  `,
  [start, end, start, end]
);

  await connection.end();

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Datos del día");

  const excelBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  if (DEBUG) {
    // Modo prueba: guardar archivo local y mostrar datos
    fs.writeFileSync("reporte_debug.xlsx", excelBuffer);
    console.log("✅ Excel generado localmente como reporte_debug.xlsx");
    console.log("📅 Rango:", start, "➡️", end);
    console.log("📊 Registros encontrados:", rows.length);
    console.table(rows);
    return;
  }

  // Modo producción: enviar correo
  const brevoClient = new Brevo.TransactionalEmailsApi();
  brevoClient.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    BREVO_API_KEY
  );

  const sendSmtpEmail = {
    sender: { email: "andes.daily.jc@gmail.com", name: "Sistema Andes S.A" },
    to: [{ email: "percy_757@hotmail.cl", name: "Sistema Andes" }],
    subject: "Reporte Diario",
    htmlContent: "<p>Adjunto reporte diario.</p>",
    attachment: [
      {
        content: excelBuffer.toString("base64"),
        name: "reporte.xlsx",
      },
    ],
  };

  const response = await brevoClient.sendTransacEmail(sendSmtpEmail);
  console.log("✉️ Correo enviado correctamente:", response);
};

sendDailyReport().catch((err) => {
  console.error("❌ Error en envío:", err.message);
});
