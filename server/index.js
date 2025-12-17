require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const request = require('request');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());
// Serve uploads folder publicly so frontend can access images/docs
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MULTER CONFIGURATION (For Document Locker & Profile Pics) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Save as: timestamp-filename.jpg
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// --- TELEGRAM BOT SETUP ---
const token = process.env.TELEGRAM_TOKEN; 
// Initialize bot only if token exists
const bot = token ? new TelegramBot(token, { polling: true }) : null;

if (bot) {
    bot.on('polling_error', (error) => {
        console.log("⚠️ Telegram Connection Error (polling):", error.code);
    });
    bot.on('error', (error) => {
        console.log("⚠️ General Telegram Error:", error.message);
    });
} else {
    console.log("⚠️ TELEGRAM_TOKEN missing. Bot features disabled.");
}

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// --- NURSE SCHEMA ---
const NurseSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  name: String,
  phone: String,
  profilePicUrl: { type: String, default: "" },
  dailyRate: { type: Number, default: 0 },
  telegramChatId: String,
  
  // ✅ NEW FIELD: Store Profile Picture Link
  profilePicUrl: { type: String, default: "" },

  // Document Locker Array
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Attendance Logs
  logs: [{
    time: { type: Date, default: Date.now },
    photoUrl: String,
    location: String
  }]
});
const Nurse = mongoose.model('Nurse', NurseSchema);

// --- API ROUTES ---

// 1. GET All Nurses
app.get('/api/nurses', async (req, res) => {
  const { ownerId } = req.query;
  if(!ownerId) return res.json([]);
  const nurses = await Nurse.find({ ownerId }).sort({ _id: -1 });
  res.json(nurses);
});

// 2. ADD Nurse (✅ UPDATED for Profile Pic Upload)
// ✅ REPLACE YOUR EXISTING POST ROUTE WITH THIS:
app.post('/api/nurses', upload.single('profilePic'), async (req, res) => {
  try {
    const { name, phone, ownerId, dailyRate } = req.body;
    let profilePicUrl = "";

    // If an image was uploaded, save the path
    if (req.file) {
        profilePicUrl = `/uploads/${req.file.filename}`;
    }

    let nurse = await Nurse.findOne({ phone, ownerId });
    if (!nurse) {
        nurse = new Nurse({ 
            name, 
            phone, 
            ownerId, 
            dailyRate,
            profilePicUrl // Save URL to database
        });
        await nurse.save();
    }
    res.json(nurse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. DELETE Nurse
app.delete('/api/nurses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Nurse.findByIdAndDelete(id);
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. UPDATE Nurse
app.put('/api/nurses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, dailyRate } = req.body;
    
    const updatedNurse = await Nurse.findByIdAndUpdate(id, 
      { name, phone, dailyRate },
      { new: true } 
    );
    
    res.json(updatedNurse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. UPLOAD DOCUMENT
app.post('/api/nurses/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { docName } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const nurse = await Nurse.findById(id);
    if (!nurse) return res.status(404).json({ error: "Nurse not found" });

    nurse.documents.push({
      name: docName || file.originalname,
      url: `/uploads/${file.filename}`
    });

    await nurse.save();
    res.json(nurse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. DELETE DOCUMENT
app.delete('/api/nurses/:nurseId/documents/:docId', async (req, res) => {
  try {
    const { nurseId, docId } = req.params;
    const nurse = await Nurse.findById(nurseId);
    
    if (!nurse) return res.status(404).json({ error: "Nurse not found" });

    const doc = nurse.documents.id(docId); 
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const filePath = path.join(__dirname, 'uploads', path.basename(doc.url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // Delete file from disk
    }

    nurse.documents.pull(docId);
    await nurse.save();
    res.json(nurse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- TELEGRAM LOGIC ---

if (bot) {
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, "Welcome to Silver Case! 🏥\nPlease reply with your **Phone Number** (just digits) to link your account.");
    });

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      if (msg.text && !msg.text.startsWith('/')) {
        const text = msg.text.trim();
        if (text.length >= 10 && /^\d+$/.test(text)) {
            const nurse = await Nurse.findOne({ phone: text });
            if (nurse) {
                nurse.telegramChatId = chatId;
                await nurse.save();
                bot.sendMessage(chatId, `✅ Linked! Hi ${nurse.name}.\n\nWhen you reach work, click 📎 and send a **Selfie** or **Location**.`);
            } else {
                bot.sendMessage(chatId, "❌ Phone number not found. Ask your admin to add you to the dashboard first.");
            }
        }
      }
    });

    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      const nurse = await Nurse.findOne({ telegramChatId: chatId });
      
      if (nurse) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const fileLink = await bot.getFileLink(photoId);

        const filename = `selfie_${Date.now()}.jpg`;
        const filepath = path.join(__dirname, 'uploads', filename);
        
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

        const file = fs.createWriteStream(filepath);
        request(fileLink).pipe(file).on('finish', async () => {
            nurse.logs.push({ photoUrl: `/uploads/${filename}` });
            await nurse.save();
            bot.sendMessage(chatId, "📸 Selfie Received!");
        });
      }
    });

    bot.on('location', async (msg) => {
      const chatId = msg.chat.id;
      const nurse = await Nurse.findOne({ telegramChatId: chatId });

      if (nurse) {
        const loc = `${msg.location.latitude},${msg.location.longitude}`;
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
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));