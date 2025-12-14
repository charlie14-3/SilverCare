require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const request = require('request');
const multer = require('multer'); // <--- New Dependency

const app = express();
app.use(cors());
app.use(express.json());
// Serve uploads folder publicly so frontend can access images/docs
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MULTER CONFIGURATION (For Document Locker) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Save as: timestamp-filename.pdf
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// --- TELEGRAM BOT SETUP ---
const token = process.env.TELEGRAM_TOKEN; 
// Initialize bot only if token exists (prevents crashes if env is missing)
const bot = token ? new TelegramBot(token, { polling: true }) : null;

if (bot) {
    // Prevent server crash on connection errors (Common in India)
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
  dailyRate: { type: Number, default: 0 }, // For Payroll
  telegramChatId: String,
  
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

// 2. ADD Nurse
app.post('/api/nurses', async (req, res) => {
  try {
    const { name, phone, ownerId, dailyRate } = req.body;
    let nurse = await Nurse.findOne({ phone, ownerId });
    if (!nurse) {
        nurse = new Nurse({ name, phone, ownerId, dailyRate });
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
    // Removed ownerId check specifically to allow cleaning up old bad data
    await Nurse.findByIdAndDelete(id);
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. UPLOAD DOCUMENT (New Feature)
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

// ... existing upload route ...

// 5. DELETE DOCUMENT (New Feature)
app.delete('/api/nurses/:nurseId/documents/:docId', async (req, res) => {
  try {
    const { nurseId, docId } = req.params;
    const nurse = await Nurse.findById(nurseId);
    
    if (!nurse) return res.status(404).json({ error: "Nurse not found" });

    // 1. Find the document to get the filename
    const doc = nurse.documents.id(docId); 
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // 2. Delete file from 'uploads' folder
    // Extract filename from URL (e.g., "/uploads/123.pdf" -> "uploads/123.pdf")
    const filePath = path.join(__dirname, 'uploads', path.basename(doc.url));
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // Delete file from disk
    }

    // 3. Remove from Database
    nurse.documents.pull(docId); // Remove subdocument
    await nurse.save();

    res.json(nurse); // Send back updated nurse object
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ... existing Telegram Logic ...

// --- TELEGRAM LOGIC ---

if (bot) {
    // A. Handle /start
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, "Welcome to Silver Case! 🏥\nPlease reply with your **Phone Number** (just digits) to link your account.");
    });

    // B. Handle Text (Phone Number Linking)
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      if (msg.text && !msg.text.startsWith('/')) {
        const text = msg.text.trim();
        // Check if text looks like a phone number (10+ digits)
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

    // C. Handle Photos (Selfie Attendance)
    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      const nurse = await Nurse.findOne({ telegramChatId: chatId });
      
      if (nurse) {
        const photoId = msg.photo[msg.photo.length - 1].file_id; // Best quality
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

    // D. Handle Location (GPS Attendance)
    bot.on('location', async (msg) => {
      const chatId = msg.chat.id;
      const nurse = await Nurse.findOne({ telegramChatId: chatId });

      if (nurse) {
        const loc = `${msg.location.latitude},${msg.location.longitude}`;
        
        // Smart Logic: Merge location with recent photo log if exists
        const lastLog = nurse.logs[nurse.logs.length - 1];
        if (lastLog && !lastLog.location && (Date.now() - new Date(lastLog.time) < 300000)) { // 5 min window
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