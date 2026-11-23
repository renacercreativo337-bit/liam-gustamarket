
import express from "express";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode-terminal";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Liam de Gusta's Market está funcionando.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    bot: "Liam"
  });
});

app.listen(PORT, () => {
  console.log("Servidor Liam iniciado en puerto " + PORT);
});

// SISTEMA DE ADVERTENCIAS
const warningsFile = "./warnings.json";

let warnings = {};

try {
  if (fs.existsSync(warningsFile)) {
    warnings = JSON.parse(fs.readFileSync(warningsFile, "utf8"));
  }
} catch (error) {
  console.log("No se pudieron cargar las advertencias.");
}

function saveWarnings() {
  fs.writeFileSync(
    warningsFile,
    JSON.stringify(warnings, null, 2)
  );
}

// DETECCIÓN DE INFORMACIÓN PRIVADA
function asksPrivateInformation(text) {
  const terms = [
    "contraseña",
    "contrasena",
    "password",
    "clave de acceso",
    "codigo de verificacion",
    "código de verificación",
    "codigo de seguridad",
    "código de seguridad",
    "codigo sms",
    "código sms",
    "datos personales",
    "informacion privada",
    "información privada",
    "cuenta de otro usuario",
    "cuenta de otro trabajador",
    "numero de telefono privado",
    "número de teléfono privado",
    "sesion de otro usuario",
    "sesión de otro usuario"
  ];

  const normalized = text.toLowerCase();

  return terms.some(term => normalized.includes(term));
}

// INICIO DE LIAM
let starting = false;

async function startLiam() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./auth_info");

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["Liam GustaMarket", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    // CONEXIÓN Y CÓDIGO QR
    sock.ev.on("connection.update", async (update) => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      if (qr) {
        console.log("ESCANEA ESTE CODIGO QR:");
        QRCode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.log("Liam está conectado a WhatsApp.");
        starting = false;
      }

      if (connection === "close") {
        starting = false;

        const status =
          lastDisconnect?.error?.output?.statusCode;

        if (status !== DisconnectReason.loggedOut) {
          console.log("Reconectando Liam...");

          setTimeout(() => {
            startLiam().catch(console.error);
          }, 5000);
        } else {
          console.log(
            "Sesión cerrada. Necesita vincularse nuevamente."
          );
        }
      }
    });

    // RECEPCIÓN DE MENSAJES
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        if (!message.message || message.key.fromMe) continue;

        const jid = message.key.remoteJid;

        if (!jid || jid === "status@broadcast") continue;

        const sender = message.key.participant || jid;

        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          "";

        const command = text.trim().toLowerCase();

        const isGroup = jid.endsWith("@g.us");

        // EN GRUPOS, LIAM SOLO RESPONDE A SUS COMANDOS
        if (isGroup && !command.startsWith("!liam") &&
            !command.startsWith("!ayuda")) {
          continue;
        }

        // PROTECCIÓN DE PRIVACIDAD
        if (asksPrivateInformation(text)) {
          if (!isGroup) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ No me está permitido proporcionar, consultar " +
                "ni revelar contraseñas, códigos de seguridad o " +
                "información privada de ningún usuario. " +
                "Por seguridad, protege siempre tus datos."
            });
            continue;
          }

          const warningKey = `${jid}_${sender}`;

          warnings[warningKey] =
            (warnings[warningKey] || 0) + 1;

          const count = warnings[warningKey];

          saveWarnings();

          if (count >= 5) {
            await sock.sendMessage(jid, {
              text:
                "🚫 Has alcanzado cinco advertencias por intentar " +
                "obtener información privada. Liam procederá a " +
                "solicitar tu expulsión del grupo."
            });

            try {
              await sock.groupParticipantsUpdate(
                jid,
                [sender],
                "remove"
              );
            } catch (error) {
              console.log(
                "No se pudo expulsar al usuario. " +
                "Comprueba los permisos de administrador."
              );
            }
          } else {
            await sock.sendMessage(jid, {
              text:
                `⚠️ ADVERTENCIA ${count}/5\n\n` +
                "No me está permitido responder preguntas " +
                "sobre contraseñas, códigos o información " +
                "privada de ningún usuario.\n\n" +
                "Si continúas realizando estas consultas, " +
                "al llegar a cinco advertencias podrás ser " +
                "expulsado del grupo."
            });
          }

          continue;
        }

        // COMANDO DE AYUDA
        if (command === "!ayuda" ||
            command === "!liam ayuda") {
          await sock.sendMessage(jid, {
            text:
              "🤖 LIAM - ASISTENTE DE GUSTA'S MARKET\n\n" +
              "Mis comandos disponibles:\n\n" +
              "• !liam - Presentación de Liam.\n" +
              "• !ayuda - Mostrar esta información.\n\n" +
              "Estoy aquí para ayudarte con Gusta's Market."
          });

          continue;
        }

        // PRESENTACIÓN DE LIAM
        if (command === "!liam") {
          await sock.sendMessage(jid, {
            text:
              "¡Hola! 👋 Soy Liam, el asistente virtual " +
              "de Gusta's Market.\n\n" +
              "Estoy aquí para ayudarte con información " +
              "sobre nuestra tienda, funcionamiento y " +
              "procedimientos.\n\n" +
              "Escribe !ayuda para conocer mis funciones."
          });

          continue;
        }

        // RESPUESTA A MENSAJES PRIVADOS
        if (!isGroup) {
          await sock.sendMessage(jid, {
            text:
              "¡Hola! 👋 Soy Liam, el asistente virtual " +
              "de Gusta's Market.\n\n" +
              "Escribe !ayuda para conocer mis funciones."
          });
        }
      }
    });

  } catch (error) {
    starting = false;
    console.error("Error iniciando Liam:", error);

    setTimeout(() => {
      startLiam().catch(console.error);
    }, 10000);
  }
}

startLiam().catch(console.error);
