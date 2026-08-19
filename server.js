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
    let id;

    do {
        id = Math.floor(100000 + Math.random() * 900000).toString();
    } while (devices.has(id));

    return id;
}

wss.on("connection", (ws) => {

    const id = generateId();

    devices.set(id, ws);

    ws.send(JSON.stringify({
        type: "registered",
        id: id
    }));

    console.log("Device connected:", id);

    ws.on("message", (message) => {

        try {

            const data = JSON.parse(message.toString());

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
