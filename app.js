// —— 全局变量 —— 
let client = null;
const topicCtrl = "car/control";
const topicStatus = "car/status";

// —— 连接/断开 —— 
document.getElementById("btnConnect").addEventListener("click", () => {
    if (client && client.isConnected()) {
        client.disconnect();
        return;
    }
    const broker = document.getElementById("brokerUrl").value.trim();
    connectMQTT(broker);
});

function connectMQTT(brokerUrl) {
    const clientId = "webClient-" + Date.now();
    client = new Paho.MQTT.Client(
        brokerUrl.split("//")[1].split(":")[0],
        Number(brokerUrl.split(":").pop().split("/")[0]),
        clientId
    );
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    client.connect({
        onSuccess: onConnect,
        onFailure: e => log(`连接失败: ${e.errorMessage}`),
        useSSL: brokerUrl.startsWith("wss")
    });
}

function onConnect() {
    log("✅ 已连接");
    document.getElementById("connStatus").innerText = "已连接";
    document.getElementById("btnConnect").innerText = "断开";
    client.subscribe(topicStatus, { qos: 1 });
}

function onConnectionLost(response) {
    log("⚠️ 连接丢失");
    document.getElementById("connStatus").innerText = "未连接";
    document.getElementById("btnConnect").innerText = "连接";
}

// —— 控制命令按钮 —— 
["Forward", "Left", "Right", "Backward"].forEach(dir => {
    document.getElementById("btn" + dir).onclick = () => {
        sendCommand(dir.toLowerCase());
    };
});

function sendCommand(cmd) {
    if (!client || !client.isConnected()) {
        log("请先连接 Broker");
        return;
    }
    const msg = new Paho.MQTT.Message(cmd);
    msg.destinationName = topicCtrl;
    client.send(msg);
    log(`→ CMD: ${cmd}`);
}

// —— 状态处理 —— 
function onMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString;
    log(`← [${topic}] ${payload}`);
    if (topic === topicStatus) {
        try {
            const st = JSON.parse(payload);
            document.getElementById("speed").innerText = st.speed ?? "—";
            document.getElementById("battery").innerText = st.battery ?? "—";
            // 更多字段……
        } catch {
            // 非 JSON 格式也可以直接展示
        }
    }
}

// —— 日志 —— 
function log(txt) {
    const area = document.getElementById("logArea");
    area.textContent += txt + "\n";
    area.scrollTop = area.scrollHeight;
}
