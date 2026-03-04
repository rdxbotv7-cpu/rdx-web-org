const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    name: "playmusic",
    version: "1.0.0",
    permission: 0,
    prefix: true,
    premium: false,
    category: "media",
    credits: "SARDAR RDX",
    description: "Download music from YouTube using new API",
    commandCategory: "media",
    usages: ".playmusic [song name]",
    cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
    const query = args.join(" ");

    if (!query) {
        return api.sendMessage("❌ Please provide a song name", event.threadID, event.messageID);
    }

    const frames = [
        "🩵▰▱▱▱▱▱▱▱▱▱▱ 10%",
        "💙▰▰▱▱▱▱▱▱▱▱▱ 25%",
        "💜▰▰▰▰▱▱▱▱▱▱ 45%",
        "💖▰▰▰▰▰▰▱▱▱▱ 70%",
        "💗▰▰▰▰▰▰▰▰▰▰ 100% 😍"
    ];

    const searchMsg = await api.sendMessage(`🔍 Searching for: ${query}\n\n${frames[0]}`, event.threadID);

    try {
        // Use new playmusic API - directly search by query
        const apiUrl = `https://anabot.my.id/api/download/playmusic?query=${encodeURIComponent(query)}&apikey=freeApikey`;

        await api.editMessage(`🎵 Found! Processing...\n\n${frames[1]}`, searchMsg.messageID, event.threadID);

        let fetchRes;
        try {
            fetchRes = await axios.get(apiUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 60000
            });
        } catch (fetchError) {
            api.unsendMessage(searchMsg.messageID);
            return api.sendMessage(`❌ Failed to fetch: ${fetchError.message}\n\nPlease try again later.`, event.threadID, event.messageID);
        }

        // Check API response
        if (!fetchRes.data || !fetchRes.data.success) {
            api.unsendMessage(searchMsg.messageID);
            return api.sendMessage("❌ No results found or API error", event.threadID, event.messageID);
        }

        const result = fetchRes.data.data.result;

        if (!result || !result.urls) {
            api.unsendMessage(searchMsg.messageID);
            return api.sendMessage("❌ Failed to get download URL", event.threadID, event.messageID);
        }

        const downloadUrl = result.urls;
        const metadata = result.metadata;
        const title = metadata.title;
        const thumbnail = metadata.thumbnail;
        const channel = metadata.channel;
        const duration = metadata.duration;

        await api.editMessage(`🎵 Downloading...\n\n${frames[2]}`, searchMsg.messageID, event.threadID);

        // Download the audio file
        let audioRes;
        try {
            audioRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 180000
            });
        } catch (downloadError) {
            api.unsendMessage(searchMsg.messageID);
            return api.sendMessage(`❌ Download failed: ${downloadError.message}\n\nPlease try again later.`, event.threadID, event.messageID);
        }

        await api.editMessage(`🎵 Processing...\n\n${frames[3]}`, searchMsg.messageID, event.threadID);

        const cacheDir = path.join(__dirname, "cache");
        await fs.ensureDir(cacheDir);

        // Save as mpeg first, then rename to mp3
        const tempPath = path.join(cacheDir, `${Date.now()}_audio.mpeg`);
        const audioPath = path.join(cacheDir, `${Date.now()}_audio.mp3`);
        fs.writeFileSync(tempPath, audioRes.data);
        fs.renameSync(tempPath, audioPath);

        setTimeout(() => {
            api.editMessage(`🎵 Complete!\n\n${frames[4]}`, searchMsg.messageID, event.threadID);
        }, 500);

        // Download thumbnail
        let thumbPath = null;
        if (thumbnail) {
            try {
                const thumbRes = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                thumbPath = path.join(cacheDir, `${Date.now()}_thumb.jpg`);
                fs.writeFileSync(thumbPath, Buffer.from(thumbRes.data));
            } catch (thumbError) {
                console.log("Thumbnail download failed:", thumbError.message);
            }
        }

        // Send thumbnail with info
        if (thumbPath && fs.existsSync(thumbPath)) {
            const durationMins = Math.floor(duration / 60);
            const durationSecs = duration % 60;
            await api.sendMessage(
                {
                    body: `🎵 ${title}\n📺 ${channel}\n⏱️ ${durationMins}:${durationSecs.toString().padStart(2, '0')}`,
                    attachment: fs.createReadStream(thumbPath)
                },
                event.threadID
            );
        } else {
            await api.sendMessage(`🎵 ${title}\n📺 ${channel}`, event.threadID);
        }

        // Send audio file
        await api.sendMessage(
            {
                body: `🎵 Audio File`,
                attachment: fs.createReadStream(audioPath)
            },
            event.threadID
        );

        // Cleanup after 10 seconds
        setTimeout(() => {
            try {
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
                api.unsendMessage(searchMsg.messageID);
            } catch (err) {
                console.log("Cleanup error:", err);
            }
        }, 10000);

    } catch (error) {
        console.error("Playmusic command error:", error.message);
        try { api.unsendMessage(searchMsg.messageID); } catch (e) { }
        return api.sendMessage("❌ An error occurred while processing your request", event.threadID, event.messageID);
    }
};
