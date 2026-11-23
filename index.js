
import express from "express";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Liam de Gusta's Market está funcionando.");
});

app.get("/health", (req, res) => {
  res.json({ status: "online", bot: "Liam" });
});

app.listen(PORT, () => {
  console.log("Servidor Liam iniciado en puerto " + PORT);
});

async function startLiam() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Liam GustaMarket", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("ESCANEA ESTE CODIGO QR:");
      QRCode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("Liam está conectado a WhatsApp.");
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;

      if (status !== DisconnectReason.loggedOut) {
        console.log("Reconectando Liam...");
        setTimeout(() => startLiam(), 5000);
      } else {
        console.log("Sesion cerrada. Necesita vincularse de nuevo.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue;

      const jid = message.key.remoteJid;
      if (!jid || jid === "status@broadcast") continue;

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        "";

      const isGroup = jid.endsWith("@g.us");
      const command = text.trim().toLowerCase();

      if (isGroup && !command.startsWith("!liam")) continue;

      if (command.startsWith("!liam") || !isGroup) {
        await sock.sendMessage(jid, {
          text: "¡Hola! Soy Liam, el asistente virtual de Gusta's Market. Estoy aquí para ayudarte. Escribe !ayuda para conocer mis funciones."
        });
      }
    }
  });
}

startLiam().catch(console.error);
