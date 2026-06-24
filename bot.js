const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalBlock },
} = require("mineflayer-pathfinder");
const { Vec3 } = require("vec3");
const readline = require("readline");
const express = require("express");

// --- ÇOKLU BOT AYARLARI ---
const botNames = ["storxy51", "storxy511", "storxy5111"];
const password = "selam123";
const serverIP = "play.aesirmc.com";
const serverVersion = "1.20.1";

const HEDEF_COORD = new Vec3(-64, 123, 363);
const BAKIS_COORD = new Vec3(-65.663, 123, 362.92);

const bots = {};
let activeBotName = null;

// --- WEB SUNUCUSU (SİTE) AYARLARI ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  let html = `
    <div style="font-family: Arial, sans-serif; background-color: #1e1e1e; color: #fff; padding: 20px; border-radius: 10px; max-width: 400px; margin: auto; margin-top: 50px;">
      <h2 style="text-align: center; color: #00ffcc;">🤖 Bot Durum Paneli</h2>
      <hr style="border-color: #444;">
      <ul style="list-style-type: none; padding: 0;">
  `;

  botNames.forEach((name) => {
    let status = bots[name]
      ? bots[name].entity
        ? "🟢 AKTİF (Oyunda)"
        : "🟡 Bağlanıyor..."
      : "🔴 Çevrimdışı";
    html += `<li style="padding: 10px; border-bottom: 1px solid #333; font-size: 18px;"><strong>${name}:</strong> ${status}</li>`;
  });

  html += `
      </ul>
      <p style="text-align: center; font-size: 12px; color: #888;">Son kontrol: ${new Date().toLocaleTimeString(
        "tr-TR",
        { timeZone: "Europe/Istanbul" }
      )}</p>
    </div>
  `;
  res.send(html);
});

app.listen(PORT, () => {
  safeLog(
    `[🌐] Web Paneli aktif! (Port: ${PORT}) - VDS kapanmaya karşı korumaya alındı.`
  );
});

// --- KONSOL DÜZENLEYİCİ ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

function safeLog(msg) {
  if (process.stdout.clearLine) process.stdout.clearLine();
  if (process.stdout.cursorTo) process.stdout.cursorTo(0);
  console.log(msg);
  if (process.stdout.isTTY) rl.prompt(true);
}

// Botları 20 saniye arayla sokan fonksiyon
async function startSystem() {
  safeLog("=========================================");
  safeLog("Sistem başlatılıyor... Botlar sırayla görevlerini yapacak.");
  safeLog("=========================================\n");

  for (const name of botNames) {
    await createBot(name, true);
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
  safeLog("\n[!] Tüm botlar sıraya girdi.");
}

function createBot(username, isInitial = false) {
  return new Promise((resolve) => {
    const bot = mineflayer.createBot({
      host: serverIP,
      port: 25565,
      username: username,
      version: serverVersion,
      auth: "offline",
    });

    bot.loadPlugin(pathfinder);
    bot.jitterInterval = null;
    
    let resolved = false;
    let botPhase = 1;
    let reconnecting = false;
    
    // Çakışmaları ve bugları önleyecek kilit bayrakları (Flags)
    let lobbyInitDone = false;
    let asmpInitDone = false;
    let tpaInterval = null;

    // Geliştirilmiş Güvenli Yeniden Bağlanma Fonksiyonu
    function handleReconnect(reasonSource) {
      if (reconnecting) return;
      reconnecting = true;

      // Çalışan TPA döngüsü varsa sızıntı yapmaması için temizle
      if (tpaInterval) {
        clearInterval(tpaInterval);
        tpaInterval = null;
      }

      safeLog(`[-] ${username} bağlantısı koptu (${reasonSource}). 20 sn sonra baştan başlayacak...`);
      
      // Web panelinde anlık olarak Çevrimdışı görünmesi için objeyi boşa çıkarıyoruz
      bots[username] = null;

      if (isInitial && !resolved) {
        resolved = true;
        resolve();
      }

      // Eski botun soket bağlantı kalıntılarını temizle ve yeni botu tetikle
      try { bot.quit(); } catch (e) {}
      setTimeout(() => createBot(username, false), 20000);
    }

    bot.on("spawn", () => {
      // PHASE 1: Ana lobi işlemleri (Sadece 1 kez tetiklenir)
      if (botPhase === 1 && !lobbyInitDone) {
        lobbyInitDone = true;
        safeLog(`[+] ${username} ana lobiye girdi.`);
        
        setTimeout(() => {
          if (reconnecting) return;
          bot.chat(`/login ${password}`);
          safeLog(`[!] ${username} giriş yaptı.`);
        }, 2000);

        setTimeout(() => {
          if (reconnecting) return;
          safeLog(`[=>] ${username} hedefe yürüyor...`);
          const defaultMove = new Movements(bot);
          defaultMove.canDig = false;
          bot.pathfinder.setMovements(defaultMove);
          bot.pathfinder.setGoal(
            new GoalBlock(HEDEF_COORD.x, HEDEF_COORD.y, HEDEF_COORD.z)
          );
        }, 4000);
      } 
      // PHASE 2: ASMP sunucusuna geçiş sonrası işlemler (Sadece 1 kez tetiklenir)
      else if (botPhase === 2 && !asmpInitDone) {
        asmpInitDone = true;
        safeLog(`[+] ${username} ASMP sunucusuna başarıyla geçti!`);
        
        setTimeout(() => {
          if (reconnecting) return;
          let count = 0;
          tpaInterval = setInterval(() => {
            if (reconnecting || !bot || !bot.entity) {
              clearInterval(tpaInterval);
              return;
            }
            bot.chat("/tpa laynox");
            safeLog(`[!] ${username} -> /tpa laynox (${count + 1}/3)`);
            count++;
            
            if (count >= 3) {
              clearInterval(tpaInterval);
              safeLog(`[+] ${username} görevini tamamladı. Sınırsız beklemeye geçildi.`);
              if (isInitial && !resolved) {
                resolved = true;
                resolve();
              }
            }
          }, 4000);
        }, 4000);
      }
    });

    bot.on("goal_reached", () => {
      if (botPhase === 1 && !reconnecting) {
        safeLog(`[!] ${username} hedefe ulaştı ve kilitlendi.`);
        bot.lookAt(BAKIS_COORD, true); // true: anında bakmasını sağlar
        
        setTimeout(() => {
          if (reconnecting) return;
          bot.swingArm();
          const npc = bot.nearestEntity(
            (e) =>
              e.position.distanceTo(bot.entity.position) < 4 &&
              e.id !== bot.entity.id
          );
          if (npc) bot.attack(npc);
          safeLog(`[!] ${username} sol tık attı.`);
          botPhase = 2; // Bir sonraki spawn eventi artık ASMP aşamasını tetikleyecek
        }, 1000);
      }
    });

    bot.on("message", (jsonMsg) => {
      if (activeBotName === username)
        safeLog(`[${username}] ` + jsonMsg.toAnsi());
    });

    bot.on("kicked", (reason) => {
      safeLog(`[!] ${username} sunucudan atıldı. Sebeb: ${reason}`);
      handleReconnect("Kicked");
    });

    bot.on("end", () => {
      handleReconnect("End");
    });

    bot.on("error", (err) => {
      safeLog(`[!] ${username} hatası: ${err.message}`);
      handleReconnect("Error");
    });

    bots[username] = bot;
  });
}

// Sistemi başlat
startSystem();
