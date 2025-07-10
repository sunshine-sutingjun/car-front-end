window.addEventListener("DOMContentLoaded", () => {
  // —— 全局变量 ——     
  let client = null;
  const topicCtrl = "car/control";
  const topicStatus = "car/status";
  let virtualX = 0; // 虚拟摇杆X轴位置 [-1, 1]
  let virtualY = 0; // 虚拟摇杆Y轴位置 [-1, 1]
  let isDragging = false;
  // Xbox控制器相关变量
  let gamepadLoopId = null;
  let lastGamepadConnected = false;
  let usingGamepad = false;

  // —— 摇杆可视化更新 —__
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

  // —— 计算和发送控制命令 —__
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

  // —— 键盘控制 —__
  const keyState = {};

  window.addEventListener("keydown", (e) => {
    keyState[e.key] = true;
    usingGamepad = false; // 切换到键盘控制
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

  // —— 鼠标拖拽控制 —__
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
    usingGamepad = false; // 切换到鼠标控制
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
    usingGamepad = false; // 切换到触摸控制
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

  // —— Xbox手柄控制 —__
  window.addEventListener("gamepadconnected", (e) => {
    log(`✅ 游戏手柄已连接: ${e.gamepad.id}`);
    updateGamepadDisplay(true, e.gamepad.id);
    
    if (!gamepadLoopId) {
      gamepadLoopId = requestAnimationFrame(gamepadLoop);
    }
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    log(`❌ 游戏手柄已断开: ${e.gamepad.id}`);
    updateGamepadDisplay(false);
    
    // 如果之前在使用游戏手柄，重置虚拟摇杆
    if (usingGamepad) {
      virtualX = 0;
      virtualY = 0;
      updateControl();
      usingGamepad = false;
    }
  });

  // 更新游戏手柄状态显示
  function updateGamepadDisplay(connected, id = '') {
    const gamepadStatus = document.getElementById("gamepadStatus");
    const gamepadId = document.getElementById("gamepadId");
    
    if (gamepadStatus) {
      gamepadStatus.innerText = connected ? "已连接" : "未连接";
    }
    
    if (gamepadId && connected) {
      gamepadId.innerText = id;
    }
  }
  
  // 游戏手柄控制循环
  function gamepadLoop() {
    // 获取所有手柄
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gamepadConnected = false;
    
    // 检查是否有手柄连接
    for (const gamepad of gamepads) {
      if (gamepad) {
        gamepadConnected = true;
        
        // 左摇杆控制
        const leftStickX = applyDeadzone(gamepad.axes[0], 0.15);  // 水平轴
        const leftStickY = applyDeadzone(gamepad.axes[1], 0.15);  // 垂直轴（反向）
        
        // 右摇杆控制（可选择使用）
        // const rightStickX = applyDeadzone(gamepad.axes[2], 0.15);
        // const rightStickY = applyDeadzone(gamepad.axes[3], 0.15);
        
        // 只有当摇杆被移动或者之前就在使用手柄时，才应用手柄控制
        if (leftStickX !== 0 || leftStickY !== 0 || usingGamepad) {
          usingGamepad = true;
          virtualX = leftStickX;
          virtualY = -leftStickY;  // Y轴需要反向
          updateControl();
        }
        
        break; // 只使用第一个检测到的手柄
      }
    }
    
    // 检测手柄连接状态变化
    if (gamepadConnected !== lastGamepadConnected) {
      lastGamepadConnected = gamepadConnected;
      if (!gamepadConnected) {
        updateGamepadDisplay(false);
      }
    }
    
    // 继续循环
    gamepadLoopId = requestAnimationFrame(gamepadLoop);
  }
  
  // 应用死区来避免摇杆漂移
  function applyDeadzone(value, deadzone) {
    if (Math.abs(value) < deadzone) {
      return 0;
    }
    
    // 保持值的符号，调整范围以保持线性响应
    return (value - (Math.sign(value) * deadzone)) / (1 - deadzone);
  }

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
  
  // 初始化游戏手柄支持
  if (navigator.getGamepads) {
    // 启动游戏手柄检测循环
    gamepadLoopId = requestAnimationFrame(gamepadLoop);
    
    // 添加游戏手柄控制说明
    const controlsInfo = document.querySelector(".controls-info");
    if (controlsInfo) {
      const gamepadInfo = document.createElement("div");
      gamepadInfo.innerHTML = "🎮 Xbox手柄左摇杆";
      controlsInfo.appendChild(gamepadInfo);
    }
  } else {
    log("⚠️ 您的浏览器不支持游戏手柄API");
  }
});
