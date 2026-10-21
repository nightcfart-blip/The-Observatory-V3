const appState = {
  rotation: 0,
  velocity: 0,
  dragging: false,
  lastPointerAngle: 0,
  lastMoveTime: 0,
  activePanel: null
};

const compassWrap = document.getElementById("compassWrap");
const compass = document.getElementById("compass");
const overlay = document.getElementById("overlay");
const needleButtons = document.querySelectorAll(".needle");
const panels = document.querySelectorAll(".panel");
const closeButtons = document.querySelectorAll(".close-panel");

function normalizeAngle(angle) {
  let a = angle % 360;
  if (a < -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

function setCompassRotation(deg) {
  appState.rotation = deg;
  compass.style.transform = `rotate(${deg}deg)`;
}

function getCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function getAngleFromPoint(clientX, clientY) {
  const center = getCenter(compassWrap);
  const dx = clientX - center.x;
  const dy = clientY - center.y;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function startDrag(clientX, clientY) {
  appState.dragging = true;
  appState.velocity = 0;
  appState.lastPointerAngle = getAngleFromPoint(clientX, clientY);
  appState.lastMoveTime = performance.now();
  compassWrap.classList.add("dragging");
}

function moveDrag(clientX, clientY) {
  if (!appState.dragging) return;

  const now = performance.now();
  const angle = getAngleFromPoint(clientX, clientY);
  let diff = normalizeAngle(angle - appState.lastPointerAngle);

  const newRotation = appState.rotation + diff;
  setCompassRotation(newRotation);

  const dt = Math.max(now - appState.lastMoveTime, 1);
  appState.velocity = diff / dt * 16;

  appState.lastPointerAngle = angle;
  appState.lastMoveTime = now;
}

function endDrag() {
  if (!appState.dragging) return;
  appState.dragging = false;
  compassWrap.classList.remove("dragging");
}

function animateInertia() {
  if (!appState.dragging && Math.abs(appState.velocity) > 0.01) {
    setCompassRotation(appState.rotation + appState.velocity);
    appState.velocity *= 0.96;
  } else if (!appState.dragging && Math.abs(appState.velocity) <= 0.01) {
    appState.velocity = 0;
  }

  requestAnimationFrame(animateInertia);
}

function openPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  closeAllPanels();
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  overlay.classList.remove("hidden");
  appState.activePanel = panelId;
}

function closeAllPanels() {
  panels.forEach(panel => {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  });
  overlay.classList.add("hidden");
  appState.activePanel = null;
}

needleButtons.forEach(button => {
  button.addEventListener("click", (event) => {
    if (appState.dragging) return;
    const panelId = event.currentTarget.dataset.target;
    openPanel(panelId);
  });
});

closeButtons.forEach(button => {
  button.addEventListener("click", closeAllPanels);
});

overlay.addEventListener("click", closeAllPanels);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllPanels();
  }
});

compassWrap.addEventListener("wheel", (event) => {
  event.preventDefault();
  const direction = Math.sign(event.deltaY || 1);
  appState.velocity += direction * 1.2;
}, { passive: false });

compassWrap.addEventListener("mousedown", (event) => {
  startDrag(event.clientX, event.clientY);
});

window.addEventListener("mousemove", (event) => {
  moveDrag(event.clientX, event.clientY);
});

window.addEventListener("mouseup", () => {
  endDrag();
});

compassWrap.addEventListener("touchstart", (event) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  startDrag(touch.clientX, touch.clientY);
}, { passive: true });

compassWrap.addEventListener("touchmove", (event) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  moveDrag(touch.clientX, touch.clientY);
}, { passive: true });

compassWrap.addEventListener("touchend", () => {
  endDrag();
});

compassWrap.addEventListener("touchcancel", () => {
  endDrag();
});

animateInertia();
setCompassRotation(0);
