const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.get("/", (req, res) => {
    res.json({
        name: "MyRemote Server",
        status: "online"
    });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server: server
});

const devices = new Map();

function generateId() {
    let candidate;

    do {
        candidate = Math.floor(100000 + Math.random() * 900000).toString();
    } while (devices.has(candidate));

    return candidate;
}

wss.on("connection", (ws) => {

    // كل اتصال يحصل على هوية عشوائية مؤقتة فور الاتصال، كما كان سابقًا
    let id = generateId();
    devices.set(id, ws);

    ws.send(JSON.stringify({
        type: "registered",
        id: id
    }));

    console.log("Device connected (temporary id):", id);

    ws.on("message", (message) => {

        try {

            const data = JSON.parse(message.toString());

            // -------- طلب استعادة رقم دائم محفوظ مسبقًا --------
            if (data.type === "register") {

                const requestedId = String(data.id);

                const existing = devices.get(requestedId);

                // إذا كان الرقم "مستخدَمًا" من اتصال قديم مختلف، نفترض أنه
                // نفس الجهاز يعيد الاتصال بعد انقطاع، فننهي الاتصال القديم
                // (الذي غالبًا مات فعليًا ولم يُكتشف بعد) ونعطي الرقم للجديد فورًا
                if (existing && existing !== ws) {
                    try {
                        existing.terminate();
                    } catch (e) {
                        // تجاهل أي خطأ أثناء إنهاء الاتصال القديم
                    }
                    devices.delete(requestedId);
                }

                // إزالة الهوية العشوائية المؤقتة لهذا الاتصال
                devices.delete(id);

                // اعتماد الهوية الدائمة الجديدة لنفس الاتصال (نفس الـ ws)
                id = requestedId;
                devices.set(id, ws);

                ws.send(JSON.stringify({
                    type: "registered",
                    id: id
                }));

                console.log("Device claimed permanent id:", id);

                return;
            }

            // -------- طلب اتصال جديد --------
            if (data.type === "connect") {

                const targetId = String(data.targetId);

                const target = devices.get(targetId);

                if (!target || target.readyState !== WebSocket.OPEN) {

                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Device not found"
                    }));

                    return;
                }

                target.send(JSON.stringify({
                    type: "connection_request",
                    from: id
                }));

                ws.send(JSON.stringify({
                    type: "request_sent",
                    targetId: targetId
                }));
            }

            // -------- رد بالقبول أو الرفض --------
            if (data.type === "response") {

                const targetId = String(data.targetId);

                const target = devices.get(targetId);

                if (!target || target.readyState !== WebSocket.OPEN) {

                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Device not found"
                    }));

                    return;
                }

                target.send(JSON.stringify({
                    type: "connection_response",
                    from: id,
                    accepted: !!data.accepted
                }));
            }

            // -------- تمرير إطار شاشة (frame) من المضيف إلى المتحكم --------
            if (data.type === "frame") {

                const targetId = String(data.targetId);

                const target = devices.get(targetId);

                if (!target || target.readyState !== WebSocket.OPEN) {
                    // لا نرسل رسالة خطأ هنا لتفادي إغراق الطرف المرسل
                    // في حال انقطع المتحكم أثناء بث مستمر
                    return;
                }

                target.send(JSON.stringify({
                    type: "frame",
                    from: id,
                    data: data.data
                }));
            }

        } catch (error) {

            console.log("Invalid message:", error.message);

        }
    });

    ws.on("close", () => {

        devices.delete(id);

        console.log("Device disconnected:", id);
    });

});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {

    console.log(`MyRemote Server running on port ${PORT}`);

});
