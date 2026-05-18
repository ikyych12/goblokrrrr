import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Telegraf, Context } from "telegraf";
import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

let firebaseConfig = { firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID, projectId: process.env.FIREBASE_PROJECT_ID };
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    firebaseConfig.firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || config.firestoreDatabaseId;
    firebaseConfig.projectId = firebaseConfig.projectId || config.projectId;
  }
} catch (err) {
  console.error("Error reading firebase-applet-config.json", err);
}

// Initialize Firebase Admin
if (!admin.apps || admin.apps.length === 0) {
  const serviceAccountPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: firebaseConfig.projectId,
    });
  } else if (firebaseConfig.projectId) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } else {
    // If no project ID, try default (local may require GOOGLE_APPLICATION_CREDENTIALS)
    admin.initializeApp();
  }
}

// admin.firestore() takes an App as argument, not a database ID string.
// For named databases, we use the default app or specify it in initialization if using SDK v11+
const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
  (db as any).databaseId = firebaseConfig.firestoreDatabaseId;
}

// Verify Firestore connection
db.listCollections().then(() => {
  console.log("✅ Successfully connected to Firestore database:", firebaseConfig.firestoreDatabaseId || "(default)");
}).catch(err => {
  console.error("❌ Firestore connection failed:", err.message);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Telegram Bot Logic ---
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not found. Bot functionality will be disabled.");
  } else {
    const bot = new Telegraf(token);

    bot.catch((err: any, ctx: Context) => {
      console.error(`[Telegraf Error] Update Type: ${ctx.updateType}`, err);
    });

    // Middleware to ensure user is in DB
    bot.use(async (ctx: any, next) => {
      if (!ctx.from) return next();
      
      const userId = ctx.from.id.toString();

      try {
        // --- BLACKLIST CHECK ---
        const blacklistDoc = await db.collection("blacklist").doc(userId).get();
        if (blacklistDoc.exists) {
          if (ctx.chat?.type !== "private") {
            try {
              await ctx.leaveChat();
            } catch (e) {}
          }
          return; // Ignore blacklisted users
        }

        const userRef = db.collection("users").doc(userId);
        const doc = await userRef.get();
        
        if (!doc.exists) {
          const defaultRole = userId === "8696784568" ? "owner" : "member";
          await userRef.set({
            telegramId: userId,
            username: ctx.from.username || ctx.from.first_name || "Unknown",
            role: defaultRole,
            balance: 0,
            createdAt: new Date().toISOString(),
          });
          ctx.state.user = { role: defaultRole, balance: 0 };
        } else {
          // Force owner role for the specific ID even if DB says otherwise
          const userData = doc.data();
          if (userId === "8696784568" && userData?.role !== "owner") {
            userData!.role = "owner";
            await userRef.update({ role: "owner" });
          }
          ctx.state.user = userData;
        }
      } catch (err) {
        console.error("DB Error in middleware", err);
        // Fallback state if DB fails so bot doesn't completely die
        ctx.state.user = ctx.state.user || { role: "member", balance: 0 };
      }
      return next();
    });

    bot.command("ping", (ctx) => {
      ctx.reply(`🏓 *PONG!*\n\nSistem Status: \`AKTIF\`\nLatency: \`${new Date().getTime() - (ctx.message.date * 1000)}ms\``, { parse_mode: "Markdown" });
    });

    bot.start((ctx) => {
      ctx.reply(`👑 *GUARD BOT ELITE* 👑\n\nSelamat datang *${ctx.from.first_name}*!\n\nBot ini bertugas menjaga keamanan grup dan mengelola *Keanggotaan VIP*.\n\n📊 *Statistik Anda:*\n├ Role: \`${ctx.state.user.role.toUpperCase()}\`\n└ Expiry: \`${ctx.state.user.expiryDate ? new Date(ctx.state.user.expiryDate).toLocaleDateString() : "PERMANENT"}\`\n\n📌 *Command Tersedia:*\n/status - Cek status anda\n/rent - Beli akses grup\n/promote - (Seller/Admin) Jual Role\n/kick - (Seller/Admin) Keluarkan member`, { parse_mode: "Markdown" });
    });

    bot.command("status", (ctx) => {
      const expiry = ctx.state.user.expiryDate ? new Date(ctx.state.user.expiryDate).toLocaleString() : "Permanent";
      ctx.reply(`🛡️ *PROFIL KEAMANAN* 🛡️\n\n👤 *User:* @${ctx.from.username || "n/a"}\n🆔 *ID:* \`${ctx.from.id}\`\n🎖️ *Role:* \`${ctx.state.user.role.toUpperCase()}\`\n💰 *Saldo:* \`Rp ${ctx.state.user.balance || 0}\`\n⏳ *Berakhir:* \`${expiry}\`\n\n_Sistem akan otomatis mengeluarkan anda jika masa sewa habis!_`, { parse_mode: "Markdown" });
    });

    // --- HELPER FOR LOGGING ---
    async function addLog(type: string, action: string, details: string) {
      try {
        await db.collection("logs").add({
          type,
          action,
          details,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.error("Log failed", e);
      }
    }

    // --- BROADCAST ENDPOINT ---
    app.post("/api/broadcast", async (req, res) => {
      const { target, message } = req.body;
      if (!message) return res.status(400).json({ error: "Message required" });

      try {
        let count = 0;
        if (target === "users") {
          const snap = await db.collection("users").get();
          for (const doc of snap.docs) {
            try {
              await bot.telegram.sendMessage(doc.data().telegramId, message, { parse_mode: "Markdown" });
              count++;
            } catch (e) {}
          }
        } else {
          const snap = await db.collection("groups").get();
          for (const doc of snap.docs) {
            try {
              await bot.telegram.sendMessage(doc.data().groupId, message, { parse_mode: "Markdown" });
              count++;
            } catch (e) {}
          }
        }
        await addLog("broadcast", `Broadcast to ${target}`, `Message sent to ${count} targets`);
        res.json({ status: "ok", sent: count });
      } catch (err) {
        res.status(500).json({ error: "Broadcast failed" });
      }
    });

    app.get("/api/logs", async (req, res) => {
      try {
        const snap = await db.collection("logs").orderBy("timestamp", "desc").limit(50).get();
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(logs);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch logs" });
      }
    });

    app.get("/api/polls", async (req, res) => {
      try {
        const snap = await db.collection("polls").orderBy("createdAt", "desc").get();
        const polls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(polls);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch polls" });
      }
    });

    app.post("/api/polls", async (req, res) => {
      const { question, options } = req.body;
      if (!question || !options || options.length < 2) {
        return res.status(400).json({ error: "Question and at least 2 options required" });
      }

      try {
        const groupsSnap = await db.collection("groups").get();
        let successCount = 0;

        for (const gDoc of groupsSnap.docs) {
          try {
            await bot.telegram.sendPoll(gDoc.data().groupId, question, options);
            successCount++;
          } catch (e) {}
        }

        await db.collection("polls").add({
          question,
          options,
          successCount,
          createdAt: new Date().toISOString()
        });

        await addLog("broadcast", "Poll Created", `Poll "${question}" sent to ${successCount} groups`);
        res.json({ status: "ok", sent: successCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to create poll" });
      }
    });

    // Tracking Groups & Authorization
    // Simple in-memory rate limiting for anti-spam
    const userMessageLog: Record<string, number[]> = {};

    bot.on("new_chat_members", async (ctx) => {
      const isMe = ctx.message.new_chat_members.some(u => u.id === bot.botInfo?.id);
      
      // If other users joined
      if (!isMe) {
        const groupDoc = await db.collection("groups").doc(ctx.chat.id.toString()).get();
        const settings = groupDoc.data()?.settings;
        if (settings?.welcomeMessage) {
          const msg = settings.welcomeMessage.replace("{name}", ctx.message.new_chat_members.map(m => `@${m.username || m.first_name}`).join(", "));
          ctx.reply(msg, { parse_mode: "Markdown" });
        }
        return;
      }

      if (isMe) {
        const inviterId = ctx.from?.id.toString();
        if (!inviterId) return;

        const userRef = db.collection("users").doc(inviterId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        // Roles allowed to add the bot to a group
        const allowedRoles = ["owner", "admin", "seller", "vip", "guard"];
        
        if (!userDoc.exists || !allowedRoles.includes(userData?.role)) {
          await addLog("security", "Unauthorized Group Addition", `User ${inviterId} tried to add bot to ${ctx.chat.id}`);
          await ctx.reply("❌ *AKSES DITOLAK*\n\nMaaf, saya hanya bisa bekerja di grup jika ditambahkan oleh *Admin*, *Seller*, atau *Member VIP*.\n\nSilahkan hubungi @kytyg_adm untuk mendapatkan akses sewa.", { parse_mode: "Markdown" });
          try {
            await ctx.leaveChat();
          } catch (e) {
            console.error("Failed to leave unauthorized group", e);
          }
          return;
        }

        await addLog("system", "Bot Added to Group", `Group: ${(ctx.chat as any).title} (ID: ${ctx.chat.id}) by User ${inviterId}`);
        await db.collection("groups").doc(ctx.chat.id.toString()).set({
          groupId: ctx.chat.id.toString(),
          title: (ctx.chat as any).title || "Unknown Group",
          addedBy: inviterId,
          addedAt: new Date().toISOString(),
          settings: {
            protectLinks: false,
            protectToxic: false,
            protectSpam: false,
            forbiddenKeywords: [],
            welcomeMessage: "Selamat datang {name} di grup kami! Silahkan cek pin message."
          }
        });
        ctx.reply("✅ *GuardBot Aktif* di grup ini.\n\nFitur keamanan telah dibuka untuk grup ini oleh pengundang resmi.\n\nSemua fitur keamanan (Anti-Link, Anti-Toxic) dimatikan secara default.\n\nGunakan /config untuk mengaktifkan fitur.", { parse_mode: "Markdown" });
      }
    });

    // Config Command
    bot.command("config", async (ctx) => {
      if (ctx.chat.type === "private") return ctx.reply("Gunakan command ini di dalam grup!");
      
      const { role } = ctx.state.user;
      if (!["owner", "admin", "seller"].includes(role)) {
        return ctx.reply("❌ Hanya Seller/Admin yang bisa mengubah konfigurasi grup.");
      }

      const groupRef = db.collection("groups").doc(ctx.chat.id.toString());
      const groupDoc = await groupRef.get();
      const settings = groupDoc.exists ? groupDoc.data()?.settings : { protectLinks: false, protectToxic: false };

      const text = `⚙️ *KONFIGURASI GRUP*\n\n1. Anti-Link: ${settings?.protectLinks ? "✅ ON" : "❌ OFF"}\n2. Anti-Toxic: ${settings?.protectToxic ? "✅ ON" : "❌ OFF"}\n3. Anti-Spam: ${settings?.protectSpam ? "✅ ON" : "❌ OFF"}\n\n_Gunakan Dashboard Web untuk pengaturan lebih lengkap._`;
      ctx.reply(text, { parse_mode: "Markdown" });
    });

    bot.command("toggle", async (ctx) => {
      if (ctx.chat.type === "private") return;
      const { role } = ctx.state.user;
      if (!["owner", "admin", "seller"].includes(role)) return;

      const args = ctx.message.text.split(" ");
      if (args.length < 2) return ctx.reply("Pilih nomor (1-3)");

      const groupRef = db.collection("groups").doc(ctx.chat.id.toString());
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) return;

      const settings = groupDoc.data()?.settings || { protectLinks: false, protectToxic: false, protectSpam: false };
      const choice = args[1];

      if (choice === "1") settings.protectLinks = !settings.protectLinks;
      else if (choice === "2") settings.protectToxic = !settings.protectToxic;
      else if (choice === "3") settings.protectSpam = !settings.protectSpam;
      else return ctx.reply("Pilihan tidak valid.");

      await groupRef.update({ settings });
      ctx.reply(`✅ *UPDATE KONFIGURASI*\n\nAnti-Link: ${settings.protectLinks ? "ON" : "OFF"}\nAnti-Toxic: ${settings.protectToxic ? "ON" : "OFF"}\nAnti-Spam: ${settings.protectSpam ? "ON" : "OFF"}`, { parse_mode: "Markdown" });
    });

    // Kick Command for Sellers
    bot.command("kick", async (ctx) => {
      const { role } = ctx.state.user;
      if (!["owner", "admin", "seller"].includes(role)) {
        return ctx.reply("❌ Anda tidak punya akses untuk mengeluarkan member.");
      }

      const args = ctx.message.text.split(" ");
      if (args.length < 2) return ctx.reply("Gunakan: /kick [user_id]");

      const targetId = args[1];
      try {
        const targetNum = parseInt(targetId);
        await ctx.kickChatMember(targetNum);
        await ctx.unbanChatMember(targetNum);
        ctx.reply(`✅ Berhasil mengeluarkan user \`${targetId}\` dari grup.`, { parse_mode: "Markdown" });
      } catch (e) {
        ctx.reply("❌ Gagal mengeluarkan member. Pastikan saya Admin.");
      }
    });

    // Buy/Rent Command
    bot.command("rent", async (ctx) => {
      ctx.reply(`💎 *MENU SEWA GRUP* 💎\n\nPilih paket untuk akses grup:\n\n1. 7 Hari - Rp 25.000\n2. 30 Hari - Rp 80.000\n3. Permanen - Menghubungi Admin\n\n_Ketik /pay (nomor paket) untuk membeli._`, { parse_mode: "Markdown" });
    });

    bot.command("pay", async (ctx) => {
      const args = ctx.message.text.split(" ");
      if (args.length < 2) return ctx.reply("Masukan nomor paket!");
      
      const paket = args[1];
      let days = 0;
      if (paket === "1") days = 7;
      else if (paket === "2") days = 30;
      else return ctx.reply("Paket tidak valid.");

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      try {
        await db.collection("users").doc(ctx.from.id.toString()).update({
          role: "vip",
          expiryDate: expiryDate.toISOString()
        });
        ctx.reply(`✅ *PEMBAYARAN BERHASIL*\n\nAkses VIP aktif sampai: \`${expiryDate.toLocaleString()}\`\n\n_Silahkan join grup menggunakan link yang disediakan Admin._`, { parse_mode: "Markdown" });
      } catch (e) {
        ctx.reply("❌ Gagal memproses paket.");
      }
    });

    // Handle Join Request
    bot.on("chat_join_request", async (ctx) => {
      const userId = ctx.from.id.toString();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const isAdmin = ["owner", "admin", "seller"].includes(userData?.role);
        const isVipActive = userData?.role === "vip" && userData?.expiryDate && new Date(userData.expiryDate) > new Date();

        if (isAdmin || isVipActive || userData?.role === "guard") {
          await ctx.approveChatJoinRequest(ctx.from.id);
          bot.telegram.sendMessage(userId, "✅ Permintaan join disetujui! Selamat datang di grup.");
        } else {
          await ctx.declineChatJoinRequest(ctx.from.id);
          bot.telegram.sendMessage(userId, "❌ Permintaan join ditolak. Anda belum memiliki akses aktif. Silahkan ketik /rent untuk membeli akses.");
        }
      } else {
        await ctx.declineChatJoinRequest(ctx.from.id);
        bot.telegram.sendMessage(userId, "❌ Anda belum terdaftar. Silahkan /start bot terlebih dahulu.");
      }
    });

    // Promote Command Updates
    bot.command("promote", async (ctx) => {
      const { role } = ctx.state.user;
      if (role === "member" || role === "guard") {
        return ctx.reply("🔒 *AKSES DITOLAK*\n\nAnda tidak memiliki otoritas untuk mempromosikan user lain.", { parse_mode: "Markdown" });
      }

      const text = ctx.message?.text;
      if (!text) return;
      
      const args = text.split(" ");
      if (args.length < 3) {
        return ctx.reply("⚠️ *FORMAT SALAH*\n\nGunakan: `/promote (user_id) (role)`\nContoh: `/promote 12345 vip`", { parse_mode: "Markdown" });
      }

      const targetId = args[1];
      const newRole = args[2].toLowerCase();
      const allowedRoles = ["guard", "vip", "seller", "admin"];
      
      if (!allowedRoles.includes(newRole)) return ctx.reply("❌ Role tidak valid.");
      if (newRole === "admin" && role !== "owner") return ctx.reply("❌ Hanya Owner yang bisa mengangkat Admin.");

      try {
        const targetRef = db.collection("users").doc(targetId);
        const targetDoc = await targetRef.get();
        if (!targetDoc.exists) return ctx.reply("❌ User tidak ditemukan.");

        // Set expiry if VIP
        const updateData: any = { role: newRole };
        if (newRole === "vip") {
          const exp = new Date();
          exp.setDate(exp.getDate() + 30);
          updateData.expiryDate = exp.toISOString();
        }

        await targetRef.update(updateData);
        
        // Log transaction
        await db.collection("transactions").add({
          sellerId: ctx.from.id.toString(),
          buyerId: targetId,
          rolePurchased: newRole,
          amount: newRole === "vip" ? 25000 : 0, 
          timestamp: new Date().toISOString()
        });

        ctx.reply(`✨ *SUKSES*\n\nUser \`@${targetDoc.data()?.username}\` sekarang menjadi \`${newRole.toUpperCase()}\`.`, { parse_mode: "Markdown" });
      } catch (err) {
        ctx.reply("❌ Gagal.");
      }
    });

    // Guard & Expiry Check Logic
    bot.on("message", async (ctx: any, next) => {
      const { role, expiryDate } = ctx.state.user;
      
      // Auto-kick if expired (only if they are VIP/Guard and not Admin/Owner)
      if (expiryDate && new Date(expiryDate) < new Date() && !["owner", "admin"].includes(role)) {
        if (ctx.chat.type !== "private") {
          try {
            await ctx.banChatMember(ctx.from.id);
            await ctx.unbanChatMember(ctx.from.id); // unban so they can rejoin later if they rent again
            ctx.reply(`🚫 *MASA SEWA HABIS*\n\nMaaf @${ctx.from.username}, masa sewa anda telah habis. Silahkan hubungi bot untuk memperpanjang akses.`, { parse_mode: "Markdown" });
            
            await db.collection("users").doc(ctx.from.id.toString()).update({ role: "member", expiryDate: null });
            return;
          } catch (e) {
            console.error("Kick failed", e);
          }
        }
      }

      if (ctx.chat.type === "private") return next();

      // Fetch group settings
      const groupRef = db.collection("groups").doc(ctx.chat.id.toString());
      const groupDoc = await groupRef.get();
      const settings = groupDoc.exists ? groupDoc.data()?.settings : null;

      const isAuthorized = ["owner", "admin", "seller", "guard"].includes(role);
      const msgText = ctx.message.text?.toLowerCase() || "";
      
      if (!isAuthorized && settings) {
        // 1. Anti-Spam logic
        if (settings.protectSpam) {
          const userId = ctx.from.id.toString();
          const now = Date.now();
          if (!userMessageLog[userId]) userMessageLog[userId] = [];
          userMessageLog[userId] = userMessageLog[userId].filter(t => now - t < 10000); // 10s window
          userMessageLog[userId].push(now);

          if (userMessageLog[userId].length > 5) { // more than 5 messages in 10s
             try {
                await ctx.deleteMessage();
                await addLog("security", "Anti-Spam Triggered", `User ${ctx.from.username || ctx.from.id} spammed in group ${ctx.chat.id}`);
                return;
             } catch (e) {}
          }
        }

        // 2. Anti-Link
        if (settings.protectLinks && (msgText.includes("http") || msgText.includes("t.me"))) {
          try {
            await ctx.deleteMessage();
            await addLog("security", "Anti-Link Triggered", `User ${ctx.from.username || ctx.from.id} sent link in ${ctx.chat.id}`);
            return;
          } catch (e) {
            console.error("Delete failed", e);
          }
        }

        // 3. Anti-Toxic / Forbidden Keywords
        const defaultToxic = ["ajg", "anjing", "babi", "bangsat", "tolol", "goblok", "kontol", "memek", "asu", "peler", "jancok"];
        const forbidden = [...defaultToxic, ...(settings.forbiddenKeywords || [])];
        
        if (settings.protectToxic && forbidden.some(word => msgText.includes(word))) {
          try {
            await ctx.deleteMessage();
            await addLog("security", "Anti-Toxic Triggered", `User ${ctx.from.username || ctx.from.id} used forbidden word in ${ctx.chat.id}`);
            ctx.reply(`⚠️ *PERINGATAN* ⚠️\n\n@${ctx.from.username}, dilarang menggunakan kata terlarang!`, { parse_mode: "Markdown" });
            return;
          } catch (e) {
            console.error("Toxic delete failed", e);
          }
        }
      }

      // 4. Auto-Reply Logic (Available for everyone)
      if (settings && settings.autoReplies && msgText) {
        const ar = (settings.autoReplies as any[]).find(r => msgText.includes(r.trigger.toLowerCase()));
        if (ar) {
          ctx.reply(ar.reply, { reply_to_message_id: ctx.message.message_id });
        }
      }

      return next();
    });

    // Background Task: Expiry Checker (Runs every minute)
    setInterval(async () => {
      const now = new Date().toISOString();
      const expiredUsers = await db.collection("users")
        .where("expiryDate", "<", now)
        .where("role", "==", "vip")
        .get();

      if (expiredUsers.empty) return;

      const groups = await db.collection("groups").get();
      
      for (const userDoc of expiredUsers.docs) {
        const userData = userDoc.data();
        const userId = userData.telegramId;

        // Kick from all tracked groups
        for (const groupDoc of groups.docs) {
          const groupId = groupDoc.id;
          try {
            await bot.telegram.banChatMember(groupId, parseInt(userId));
            await bot.telegram.unbanChatMember(groupId, parseInt(userId));
            console.log(`Auto-kicked expired user ${userId} from ${groupId}`);
          } catch (e) {
            // Probably not in this group or bot not admin
          }
        }

        // Send PM notification
        try {
          await bot.telegram.sendMessage(userId, `⚠️ *MASA SEWA HABIS*\n\nMaaf, masa VIP anda telah berakhir dan anda telah dikeluarkan secara otomatis dari grup.\n\nSilahkan hubungi @kytyg_adm untuk perpanjang!`, { parse_mode: "Markdown" });
        } catch (e) {}

        // Update DB
        await userDoc.ref.update({ role: "member", expiryDate: null });
      }
    }, 60000);

    app.get("/api/bot-check", async (req, res) => {
      if (!token) return res.status(400).json({ error: "Token not configured" });
      try {
        const me = await bot.telegram.getMe();
        res.json({ ok: true, me });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Delete webhook before launch to ensure polling works
    bot.telegram.deleteWebhook().then(() => {
      bot.launch()
        .then(() => console.log("✅ Telegram bot launched successfully via polling"))
        .catch((err) => console.error("❌ Failed to launch Telegram bot:", err));
    }).catch(err => {
      console.error("Failed to delete webhook, but trying to launch anyway", err);
      bot.launch().catch(e => console.error("Bot launch failed after deleteWebhook failed", e));
    });

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }

  app.get("/api/bot-status", (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    res.json({
      initialized: !!token,
      polling: !!token
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const usersSnap = await db.collection("users").count().get();
      const txSnap = await db.collection("transactions").count().get();
      res.json({ 
        totalUsers: usersSnap.data().count,
        totalTransactions: txSnap.data().count
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const { search } = req.query;
      let query: admin.firestore.Query = db.collection("users");
      
      const snap = await query.get();
      let users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (search) {
        const s = (search as string).toLowerCase();
        users = users.filter((u: any) => 
          u.username?.toLowerCase().includes(s) || 
          u.telegramId?.includes(s)
        );
      }
      
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users/:id/role", async (req, res) => {
    try {
      const { role, expiryDate } = req.body;
      await db.collection("users").doc(req.params.id).update({
        role,
        ...(expiryDate !== undefined && { expiryDate })
      });
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // --- BLACKLIST API ---
  app.get("/api/blacklist", async (req, res) => {
    try {
      const snap = await db.collection("blacklist").get();
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch blacklist" });
    }
  });

  app.post("/api/blacklist", async (req, res) => {
    try {
      const { telegramId, reason, bannedBy } = req.body;
      await db.collection("blacklist").doc(telegramId).set({
        telegramId,
        reason,
        bannedBy,
        createdAt: new Date().toISOString()
      });
      // Also mark in users collections if exists
      await db.collection("users").doc(telegramId).update({ isBanned: true }).catch(() => {});
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Failed to blacklist user" });
    }
  });

  app.delete("/api/blacklist/:id", async (req, res) => {
    try {
      await db.collection("blacklist").doc(req.params.id).delete();
      await db.collection("users").doc(req.params.id).update({ isBanned: false }).catch(() => {});
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove from blacklist" });
    }
  });

  app.get("/api/groups", async (req, res) => {
    try {
      const snap = await db.collection("groups").get();
      const groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(groups);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  app.get("/api/groups/:id/settings", async (req, res) => {
    try {
      const doc = await db.collection("groups").doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: "Group not found" });
      res.json(doc.data()?.settings || {});
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/groups/:id/settings", async (req, res) => {
    try {
      await db.collection("groups").doc(req.params.id).update({
        settings: req.body
      });
      res.json({ status: "ok" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // --- Vite & Production Setup ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
