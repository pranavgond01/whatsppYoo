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

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        // 👇 Yeh options add karne se incoming messages aur group events reliably milte hain
        syncFullHistory: false,
        markOnlineOnConnect: true
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

    // 📩 Improved Incoming Messages Handler
    sock.ev.on('messages.upsert', async (event) => {
        const messages = event.messages;
        for (const msg of messages) {
            // Agar message khud bot ka bheja hua hai ya message empty hai toh return
            if (!msg.message || msg.key.fromMe) continue;

            const chatId = msg.key.remoteJid;

            // Sirf target group ke messages par dhyan dein
            if (chatId !== TARGET_GROUP_JID) continue;

            // Saare possible text formats nikalne ka tarika
            const messageContent = 
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.imageMessage?.caption || 
                msg.message.videoMessage?.caption;

            if (!messageContent) continue;

            const text = messageContent.trim().toLowerCase();
            console.log(`💬 Group Message Captured: "${messageContent}"`);

            // Agar message "hi" ya "hello" hai
            if (text === 'hi' || text === 'hello') {
                console.log('✅ Trigger matched! Sending reply...');
                await sock.sendMessage(TARGET_GROUP_JID, {
                    text: 'Hello, bot is alive! 🤖🚀'
                }, { quoted: msg });
            }
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
                    console.log(`\n📊 NEW POLL SELECTION: +${voterNumber}`);
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
