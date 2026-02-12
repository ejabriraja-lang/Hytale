const admin = require('firebase-admin');
const axios = require('axios');

// التحقق من وجود مفتاح الأمان في بيئة العمل
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Error: FIREBASE_SERVICE_ACCOUNT secret is missing!");
  process.exit(1);
}

// تهيئة Firebase باستخدام المفتاح السري
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateServers() {
  console.log('🚀 Starting Hytale Server Sync (with Player Names)...');
  
  // المسار الصحيح لمجموعة السيرفرات في Firestore
  const serversRef = db.collection('artifacts/hytaletrack-prod/public/data/servers');
  const snapshot = await serversRef.get();

  if (snapshot.empty) {
    console.log('⚠️ No servers found in database.');
    return;
  }

  for (const doc of snapshot.docs) {
    const server = doc.data();
    try {
      console.log(`🔍 Checking: ${server.name} (${server.ip})`);
      
      // طلب البيانات من الإصدار الثالث (API v3) لجلب مصفوفة الأسماء
      const response = await axios.get(`https://api.mcsrvstat.us/3/${server.ip.trim().toLowerCase()}`);
      const data = response.data;

      // استخراج قائمة اللاعبين (تكون مصفوفة من الأسماء في v3)
      const playerNamesList = data.players?.list || [];

      // تحديث بيانات السيرفر في قاعدة البيانات
      await doc.ref.update({
        online: data.online || false,
        players: data.players?.online || 0,
        maxPlayers: data.players?.max || 100,
        // 👈 الحقل الجديد الذي سيظهر في الموقع
        list: playerNamesList, 
        lastChecked: admin.firestore.FieldValue.serverTimestamp(),
        // نحدث تاريخ التحديث الكلي فقط إذا تغيرت حالة السيرفر فعلياً
        ...(server.online !== data.online && { lastUpdated: admin.firestore.FieldValue.serverTimestamp() })
      });
      
      console.log(`✅ Successfully updated ${server.name}. Online: ${data.players?.online || 0}`);
    } catch (err) {
      console.error(`❌ Failed to update ${server.name}:`, err.message);
    }
  }
}

// تشغيل الدالة
updateServers().then(() => {
  console.log('✨ All servers processed successfully.');
  process.exit(0);
}).catch(err => {
  console.error('💥 Critical script error:', err);
  process.exit(1);
});
