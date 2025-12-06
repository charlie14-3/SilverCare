require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const request = require('request');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 1. Setup Telegram Bot
const token = process.env.TELEGRAM_TOKEN; 
const bot = new TelegramBot(token, { polling: true }); 

// ✅ ADD THIS: Stop the server from crashing on connection errors
bot.on('polling_error', (error) => {
  console.log("⚠️ Telegram Connection Error (polling):", error.code);  // Will log 'ETIMEDOUT' instead of crashing
});

bot.on('error', (error) => {
   console.log("⚠️ General Telegram Error:", error.message);
});
// 2. Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// 3. Nurse Schema
const NurseSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  name: String,
  phone: String,
  telegramChatId: String,
  logs: [{
    time: { type: Date, default: Date.now },
    photoUrl: String,
    location: String
  }]
});
const Nurse = mongoose.model('Nurse', NurseSchema);

// 4. API Routes

// GET All Nurses
app.get('/api/nurses', async (req, res) => {
  const { ownerId } = req.query;
  if(!ownerId) return res.json([]);
  const nurses = await Nurse.find({ ownerId }).sort({ _id: -1 });
  res.json(nurses);
});

// ADD Nurse
app.post('/api/nurses', async (req, res) => {
  try {
    const { name, phone, ownerId } = req.body;
    let nurse = await Nurse.findOne({ phone, ownerId });
    if (!nurse) {
        nurse = new Nurse({ name, phone, ownerId });
        await nurse.save();
    }
    res.json(nurse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Nurse (THIS WAS MISSING BEFORE)
app.delete('/api/nurses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // We remove the ownerId check here so you can delete old bad data
    await Nurse.findByIdAndDelete(id);
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. TELEGRAM LOGIC

// A. Listen for /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome to Silver Case! 🏥\nPlease reply with your **Phone Number** so I can link you to your agency.");
});

// B. Listen for TEXT (Linking Phone)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && !msg.text.startsWith('/')) {
    const text = msg.text.trim();
    if (text.length >= 10 && /^\d+$/.test(text)) {
        const nurse = await Nurse.findOne({ phone: text });
        if (nurse) {
            nurse.telegramChatId = chatId;
            await nurse.save();
            bot.sendMessage(chatId, `✅ Profile Linked! Hi ${nurse.name}.\n\nWhen you reach work, send me a **Selfie** and your **Location**.`);
        } else {
            bot.sendMessage(chatId, "❌ Phone number not found. Ask your admin to add you first.");
        }
    }
  }
});

// C. Listen for PHOTOS
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const nurse = await Nurse.findOne({ telegramChatId: chatId });
  
  if (nurse) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const fileLink = await bot.getFileLink(photoId);

    const filename = `selfie_${Date.now()}.jpg`;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    // Create folder if missing
    if (!fs.existsSync(path.join(__dirname, 'uploads'))){
        fs.mkdirSync(path.join(__dirname, 'uploads'));
    }

    const file = fs.createWriteStream(filepath);
    request(fileLink).pipe(file).on('finish', async () => {
        nurse.logs.push({ photoUrl: `/uploads/${filename}` });
        await nurse.save();
        bot.sendMessage(chatId, "📸 Selfie Received!");
    });
  }
});

// D. Listen for LOCATION
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const nurse = await Nurse.findOne({ telegramChatId: chatId });

  if (nurse) {
    const loc = `${msg.location.latitude},${msg.location.longitude}`;
    
    // Smart Update: if last log was recent & has photo but no location, update it
    const lastLog = nurse.logs[nurse.logs.length - 1];
    if (lastLog && !lastLog.location && (Date.now() - new Date(lastLog.time) < 300000)) {
        lastLog.location = loc;
    } else {
        nurse.logs.push({ location: loc });
    }
    
    await nurse.save();
    bot.sendMessage(chatId, "📍 Location Received! Attendance Marked. ✅");
  }
});

app.listen(5001, () => console.log("Telegram Bot Server Running..."));