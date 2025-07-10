window.addEventListener("DOMContentLoaded", () => {
  // —— 全局变量 ——     
  let client = null;
  const topicCtrl = "car/control";
  const topicStatus = "car/status";
  let virtualX = 0; // 虚拟摇杆X轴位置 [-1, 1]
  let virtualY = 0; // 虚拟摇杆Y轴位置 [-1, 1]
  let isDragging = false;

  // —— 摇杆可视化更新 ——
  function updateJoystickVisual(x, y, left, right) {
    const stick = document.getElementById("joystickStick");
    const maxOffset = 58; // 摇杆最大偏移距离

    // 计算摇杆位置
    const offsetX = x * maxOffset;
    const offsetY = -y * maxOffset; // Y轴反向

    stick.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

    // 更新数值显示
    document.getElementById("xValue").innerText = x.toFixed(2);
    document.getElementById("yValue").innerText = y.toFixed(2);
    document.getElementById("leftValue").innerText = left.toFixed(2);
    document.getElementById("rightValue").innerText = right.toFixed(2);
  }

  // —— 计算和发送控制命令 ——
  function updateControl() {
    let left = virtualY + virtualX;
    let right = virtualY - virtualX;

    left = Math.max(-1, Math.min(1, left));
    right = Math.max(-1, Math.min(1, right));

    const maxSpeed = 100;
    const leftSpeed = Math.round(left * maxSpeed);
    const rightSpeed = Math.round(right * maxSpeed);

    // 更新摇杆可视化
    updateJoystickVisual(virtualX, virtualY, left, right);

    if (client && client.isConnected()) {
      const msg = new Paho.Message(JSON.stringify({
        left: leftSpeed,
        right: rightSpeed
      }));
      msg.destinationName = topicCtrl;
      client.send(msg);
    }
    document.getElementById("leftSpeed").innerText = leftSpeed;
    document.getElementById("rightSpeed").innerText = rightSpeed;
  }

  // 初始化摇杆显示
  updateControl();

  // —— 键盘控制 ——
  const keyState = {};

  window.addEventListener("keydown", (e) => {
    keyState[e.key] = true;
    updateVirtualJoystick();
  });

  window.addEventListener("keyup", (e) => {
    keyState[e.key] = false;
    updateVirtualJoystick();
  });

  function updateVirtualJoystick() {
    let newX = 0;
    let newY = 0;

    // 检查按键状态
    if (keyState["ArrowLeft"] || keyState["a"] || keyState["A"]) newX -= 1;
    if (keyState["ArrowRight"] || keyState["d"] || keyState["D"]) newX += 1;
    if (keyState["ArrowUp"] || keyState["w"] || keyState["W"]) newY += 1;
    if (keyState["ArrowDown"] || keyState["s"] || keyState["S"]) newY -= 1;

    // 归一化对角线移动
    if (newX !== 0 && newY !== 0) {
      const length = Math.sqrt(newX * newX + newY * newY);
      newX /= length;
      newY /= length;
    }

    virtualX = newX;
    virtualY = newY;
    updateControl();
  }

  // —— 鼠标拖拽控制 ——
  const joystickBase = document.querySelector(".joystick-base");
  const joystickStick = document.getElementById("joystickStick");

  function getJoystickPosition(clientX, clientY) {
    const baseRect = joystickBase.getBoundingClientRect();
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;

    const maxRadius = baseRect.width / 2 - 25; // 减去摇杆半径
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    let x = deltaX / maxRadius;
    let y = -deltaY / maxRadius; // Y轴反向

    // 限制在单位圆内
    if (distance > maxRadius) {
      x = (deltaX / distance) * (maxRadius / maxRadius);
      y = -(deltaY / distance) * (maxRadius / maxRadius);
    }

    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));

    return { x, y };
  }

  joystickBase.addEventListener("mousedown", (e) => {
    isDragging = true;
    const pos = getJoystickPosition(e.clientX, e.clientY);
    virtualX = pos.x;
    virtualY = pos.y;
    updateControl();
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      const pos = getJoystickPosition(e.clientX, e.clientY);
      virtualX = pos.x;
      virtualY = pos.y;
      updateControl();
      e.preventDefault();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      virtualX = 0;
      virtualY = 0;
      updateControl();
    }
  });

  // 触摸事件支持（移动端）
  joystickBase.addEventListener("touchstart", (e) => {
    isDragging = true;
    const touch = e.touches[0];
    const pos = getJoystickPosition(touch.clientX, touch.clientY);
    virtualX = pos.x;
    virtualY = pos.y;
    updateControl();
    e.preventDefault();
  });

  window.addEventListener("touchmove", (e) => {
    if (isDragging && e.touches.length > 0) {
      const touch = e.touches[0];
      const pos = getJoystickPosition(touch.clientX, touch.clientY);
      virtualX = pos.x;
      virtualY = pos.y;
      updateControl();
      e.preventDefault();
    }
  });

  window.addEventListener("touchend", () => {
    if (isDragging) {
      isDragging = false;
      virtualX = 0;
      virtualY = 0;
      updateControl();
    }
  });

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
    client = new Paho.Client(
      brokerUrl.split("//")[1].split(":")[0],
      Number(brokerUrl.split(":").pop().split("/")[0]),
      clientId
    );
    log("开始连接 MQTT...");
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;
    client.connect({
      userName: "admin",
      password: "123456",
      onSuccess: onConnect,
      onFailure: e => log(`❌ 连接失败: ${e.errorMessage}`),
      useSSL: brokerUrl.startsWith("wss")
    });
  }

  function onConnect() {
    log("✅ 已连接");
    document.getElementById("connStatus").innerText = "已连接";
    document.getElementById("btnConnect").innerText = "断开";
    client.subscribe(topicStatus, { qos: 1 });
  }

  function onConnectionLost() {
    log("⚠️ 连接丢失");
    document.getElementById("connStatus").innerText = "未连接";
    document.getElementById("btnConnect").innerText = "连接";
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
        document.getElementById("statu").innerText = st.statu ?? "—";
      } catch {
        // 非 JSON 格式直接展示
      }
    }
  }

  // —— 日志 —— 
  function log(txt) {
    const area = document.getElementById("logArea");
    area.textContent += txt + "\n";
    area.scrollTop = area.scrollHeight;
  }
});
