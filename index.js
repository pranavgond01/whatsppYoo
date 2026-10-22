import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import pino from 'pino';
import express from 'express';

// 🌐 Express Web Server for Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 WhatsApp Poll Bot is running 24/7 on Cloud!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server is running on port ${PORT}`);
});

// ⚠️ AAPKA GROUP JID
const TARGET_GROUP_JID = '120363414636843883@g.us'; 

// ⚠️ APNA PERSONAL WHATSAPP NUMBER YAHAN DALEIN (Country code ke saath, bina '+' ke)
// Jaise agar number 9876543210 hai, toh '919876543210@s.whatsapp.net' likhein
const MY_PERSONAL_JID = '917620692399@s.whatsapp.net'; // <-- Ise apne number se badal lein!

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 Scan QR Code with your bot WhatsApp number:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected Successfully!');
        }
    });

    // ⏰ Schedule Every Day at 7:00 PM (19:00)
    cron.schedule('0 19 * * *', async () => {
        console.log('⏰ Executing Daily 7:00 PM Poll Task...');
        await sendGroupPoll(sock, TARGET_GROUP_JID);
    });

    // 📩 Incoming Messages Handler (Check if you sent "hello")
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Khud ke message ignore karein

        const senderJid = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        
        // Message text nikalne ke liye
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Check if message is from target group and sent by YOU, and text is "hello"
        if (chatId === TARGET_GROUP_JID && senderJid === MY_PERSONAL_JID && messageContent?.toLowerCase() === 'hello') {
            console.log('✅ Hello command triggered by Pranav!');
            await sock.sendMessage(TARGET_GROUP_JID, {
                text: '👋 Hello Pranav! Bot is online, active, and ready to roll! 🚀'
            }, { quoted: msg });
        }
    });

    // 📊 Track Live Poll Votes & Log Responses
    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update.pollUpdates) {
                const pollVotes = update.update.pollUpdates;

                for (const vote of pollVotes) {
                    const voterJid = vote.pollUpdateMessageKey.participant || vote.pollUpdateMessageKey.remoteJid;
                    const voterNumber = voterJid.split('@')[0];
                    
                    console.log(`\n📊 NEW POLL SELECTION:`);
                    console.log(`👤 User: +${voterNumber}`);
                    console.log(`📩 Selection Data Received!`);
                }
            }
        }
    });
}

// Function to Send Multiple-Choice Poll
async function sendGroupPoll(sock, groupJid) {
    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants.map(p => p.id);

        console.log(`\n📤 Sending Poll to Group: "${groupMetadata.subject}"...`);

        await sock.sendMessage(groupJid, {
            poll: {
                name: 'Yooohuuu',
                values: [
                    'Chleee',
                    'Ajjaaaa',
                    'Araaa',
                    'Waittt'
                ],
                selectableCount: 0 
            },
            mentions: participants 
        });

        console.log('✅ Group Poll Created Successfully & All Members Tagged!');
    } catch (err) {
        console.error('Error sending poll:', err);
    }
}

startBot();
