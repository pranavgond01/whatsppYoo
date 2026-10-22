import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import pino from 'pino';
import express from 'express';
import Groq from 'groq-sdk'; // 👈 Groq SDK import kiya

// 🌐 Express Web Server for Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 WhatsApp Chill AI & Poll Bot is running 24/7 on Cloud!');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server is running on port ${PORT}`);
});

// ⚠️ APNI GROQ API KEY YAHAN DALEN (Ya Environment Variable mein set karein)
// ⚠️ Groq API key ko environment variable se load karein
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ⚠️ AAPKA GROUP JID
const TARGET_GROUP_JID = '120363414636843883@g.us'; 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
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

    // ⏰ Schedule Every Day at 7:00 PM (19:00) for Mandir Poll
    cron.schedule('0 19 * * *', async () => {
        console.log('⏰ Executing Daily 7:00 PM Poll Task...');
        await sendGroupPoll(sock, TARGET_GROUP_JID);
    });

    // 📩 Incoming Messages Handler (Poll Check + Groq Chill AI Chat)
    sock.ev.on('messages.upsert', async (event) => {
        const messages = event.messages;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const chatId = msg.key.remoteJid;
            if (chatId !== TARGET_GROUP_JID) continue; // Sirf target group par kaam karega

            const messageContent = 
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.imageMessage?.caption;

            if (!messageContent) continue;

            const text = messageContent.trim();
            const lowerText = text.toLowerCase();

            // 1. Alive Check Trigger ("hi" / "hello")
            if (lowerText === 'hi' || lowerText === 'hello') {
                await sock.sendMessage(TARGET_GROUP_JID, {
                    text: 'Hello, bot is alive! 🤖🚀 Aur batao, kya chal raha hai?'
                }, { quoted: msg });
                continue;
            }

            // 2. Groq AI Chill Bot Trigger 
            // (Aap group mein jab bhi bot ko mention karenge ya seedha message bhejenge, yeh Groq se chill reply dega)
            // Yahan hum check kar rahe hain ki kya message bot ko tag kiya gaya hai ya phir aap normal baat kar rahe hain
            const botNumberId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isMentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botNumberId);

            // Agar aap chahte hain ki har message par reply kare toh 'true' rakhein, 
            // ya agar sirf mention par kare toh 'isMentioned' check karein. Abhi hum ise smart rakhte hain ki mention karne par ya normal text par reply kare.
            if (isMentioned || text.startsWith('!ai') || text.startsWith('bot')) {
                // Mention ya '!ai' command hatakar clean text le lete hain
                let cleanQuery = text.replace(/@\d+/g, '').replace('!ai', '').replace('bot', '').trim();
                if (!cleanQuery) cleanQuery = "Batao bhai, kya haal hai?";

                console.log(`🤖 Generating Groq AI response for: "${cleanQuery}"`);

                try {
                    // Groq API Call (Using Llama-3 model for lightning fast chill responses)
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [
                            {
                                role: "system",
                                content: "You are a very chill, friendly, funny, and casual WhatsApp AI buddy. Talk like a cool friend using Hinglish (mix of Hindi and English) with appropriate emojis. Keep answers crisp and engaging."
                            },
                            {
                                role: "user",
                                content: cleanQuery
                            }
                        ],
                        model: "llama-3.3-70b-versatile", // Super fast and smart Groq model
                        temperature: 0.7,
                        max_tokens: 300,
                    });

                    const aiReply = chatCompletion.choices[0]?.message?.content || "Arre bhai, samajh nahi aaya, thoda wapas bol! 😅";

                    await sock.sendMessage(TARGET_GROUP_JID, {
                        text: aiReply
                    }, { quoted: msg });

                } catch (error) {
                    console.error('Groq API Error:', error);
                    await sock.sendMessage(TARGET_GROUP_JID, {
                        text: 'Arre yaar, abhi mera dimaag thoda hang ho gaya hai (Groq API limit/error)! 🤖💀'
                    }, { quoted: msg });
                }
            }
        }
    });

    // 📊 Track Live Poll Votes
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
