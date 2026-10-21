const state = {
  rotation: 0,
  velocity: 0,
  dragging: false,
  pointerId: null,
  lastAngle: 0,
  lastTime: 0,
  moved: false,
  clickLock: false,
  activePanel: null
};

const compassWrap = document.getElementById("compassWrap");
const compass = document.getElementById("compass");
const needles = document.querySelectorAll(".needle");
const overlay = document.getElementById("overlay");
const panels = document.querySelectorAll(".panel");
const closeButtons = document.querySelectorAll(".close-panel");

function setRotation(deg) {
  state.rotation = deg;
  compass.style.transform = `rotate(${deg}deg)`;
}

function getCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function getPointerAngle(clientX, clientY) {
  const center = getCenter(compassWrap);
  const dx = clientX - center.x;
  const dy = clientY - center.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function normalizeAngle(angle) {
  let value = angle % 360;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

function startDrag(event) {
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.velocity = 0;
  state.lastAngle = getPointerAngle(event.clientX, event.clientY);
  state.lastTime = performance.now();
  state.moved = false;
  compassWrap.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;

  const now = performance.now();
  const currentAngle = getPointerAngle(event.clientX, event.clientY);
  const diff = normalizeAngle(currentAngle - state.lastAngle);

  if (Math.abs(diff) > 0.05) {
    state.moved = true;
  }

  setRotation(state.rotation + diff);

  const deltaTime = Math.max(now - state.lastTime, 1);
  state.velocity = (diff / deltaTime) * 16;

  state.lastAngle = currentAngle;
  state.lastTime = now;
}

function endDrag(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;

  state.dragging = false;

  if (state.moved) {
    state.clickLock = true;
    setTimeout(() => {
      state.clickLock = false;
    }, 180);
  }

  try {
    compassWrap.releasePointerCapture(event.pointerId);
  } catch (e) {}
}

function inertia() {
  if (!state.dragging) {
    if (Math.abs(state.velocity) > 0.01) {
      setRotation(state.rotation + state.velocity);
      state.velocity *= 0.965;
    } else {
      state.velocity = 0;
    }
  }

  requestAnimationFrame(inertia);
}

function openPanel(id) {
  const panel = document.getElementById(id);
  if (!panel) return;

  closePanels();
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  overlay.classList.remove("hidden");
  state.activePanel = id;
}

function closePanels() {
  panels.forEach((panel) => {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  });

  overlay.classList.add("hidden");
  state.activePanel = null;
}

compassWrap.addEventListener("pointerdown", (event) => {
  startDrag(event);
});

compassWrap.addEventListener("pointermove", (event) => {
  moveDrag(event);
});

compassWrap.addEventListener("pointerup", (event) => {
  endDrag(event);
});

compassWrap.addEventListener("pointercancel", (event) => {
  endDrag(event);
});

compassWrap.addEventListener("wheel", (event) => {
  event.preventDefault();
  const delta = event.deltaY;
  state.velocity += delta * 0.0022;
}, { passive: false });

needles.forEach((needle) => {
  needle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.dragging || state.clickLock) return;
    openPanel(needle.dataset.target);
  });
});

overlay.addEventListener("click", closePanels);

closeButtons.forEach((button) => {
  button.addEventListener("click", closePanels);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanels();
  }
});

setRotation(0);
inertia();
