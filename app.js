
"use strict";

const $ = id => document.getElementById(id);

const TYPE_NAMES = {
  group: "Group",
  production: "Production",
  season: "Season",
  episode: "Episode"
};

const SYMBOLS = {
  group: "◇",
  production: "✦",
  season: "◈",
  episode: "✧"
};

const state = {
  rotation: 0,
  velocity: 0,
  dragging: false,
  pointerId: null,
  moved: false,
  startX: 0,
  startY: 0,
  lastAngle: 0,
  lastTime: 0,
  currentPage: "home",
  detailType: null,
  detailId: null,
  editType: null,
  editId: null,
  pendingImage: undefined,
  imagePreviewURL: null
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  setupCompass();
  setupNavigation();
  setupCreation();
  setupLibrary();
  setupWatchlist();
  setupEditor();
  setupDetails();
  setupStatistics();
  fillMediaSelectors();
  renderLibrary();
  renderWatchlist();
}

/* ============================================
   GENERAL HELPERS
============================================ */

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function clear(el) {
  el.replaceChildren();
}

function emptyMessage(text) {
  return element("div", "empty-state", text);
}

function formatScore(value) {
  return value === null ? "—" : value.toFixed(1);
}

function parseGenres(text) {
  return [...new Set(
    text.split(",").map(s => s.trim()).filter(Boolean)
  )];
}

function optionalNumber(id) {
  const raw = $(id).value.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function formatMinutes(minutes) {
  const m = Math.round(minutes || 0);
  const h = Math.floor(m / 60);
  const remainder = m % 60;
  return h ? `${h}h ${remainder}m` : `${m}m`;
}

function imageInto(container, item) {
  getImageURL(item.type, item.id).then(url => {
    if (!url || !container.isConnected) return;

    const img = new Image();
    img.alt = "";
    img.src = url;
    container.replaceChildren(img);
  }).catch(console.error);
}

function parentName(item) {
  const type = parentTypeOf(item.type);
  if (!type || !item.parentId) return "";
  return findEntry(type, item.parentId)?.title || "";
}

function descendants(item) {
  const result = [];

  function walk(parent) {
    getChildren(parent.type, parent.id).forEach(child => {
      result.push(child);
      walk(child);
    });
  }

  walk(item);
  return result;
}

/* ============================================
   COMPASS
============================================ */

function setupCompass() {
  const wrap = $("compassWrap");
  const compass = $("compass");

  function setRotation(value) {
    state.rotation = value;
    compass.style.transform = `rotate(${value}deg)`;
  }

  function pointerAngle(x, y) {
    const r = wrap.getBoundingClientRect();
    return Math.atan2(
      y - (r.top + r.height / 2),
      x - (r.left + r.width / 2)
    ) * 180 / Math.PI;
  }

  function difference(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  wrap.addEventListener("pointerdown", e => {
    if (state.dragging) return;

    state.dragging = true;
    state.pointerId = e.pointerId;
    state.moved = false;
    state.velocity = 0;

    state.startX = e.clientX;
    state.startY = e.clientY;
    state.lastAngle = pointerAngle(e.clientX, e.clientY);
    state.lastTime = performance.now();

    wrap.setPointerCapture(e.pointerId);
  });

  wrap.addEventListener("pointermove", e => {
    if (!state.dragging ||
        e.pointerId !== state.pointerId) return;

    if (Math.hypot(
      e.clientX - state.startX,
      e.clientY - state.startY
    ) > 7) {
      state.moved = true;
    }

    if (!state.moved) return;

    const now = performance.now();
    const angle = pointerAngle(e.clientX, e.clientY);
    const delta = difference(angle, state.lastAngle);
    const dt = Math.max(1, now - state.lastTime);

    setRotation(state.rotation + delta);
    state.velocity = Math.max(-15,
      Math.min(15, delta / dt * 16));

    state.lastAngle = angle;
    state.lastTime = now;
  });

  function finish(e, cancelled = false) {
    if (!state.dragging ||
        e.pointerId !== state.pointerId) return;

    const moved = state.moved;
    state.dragging = false;
    state.pointerId = null;

    if (wrap.hasPointerCapture(e.pointerId)) {
      wrap.releasePointerCapture(e.pointerId);
    }

    if (cancelled) {
      state.velocity = 0;
    } else if (!moved) {
      state.velocity = 0;
      activateTip(e.clientX, e.clientY);
    }
  }

  wrap.addEventListener("pointerup", e => finish(e));
  wrap.addEventListener("pointercancel",
    e => finish(e, true));

  wrap.addEventListener("wheel", e => {
    e.preventDefault();
    state.velocity += Math.max(-5,
      Math.min(5, e.deltaY * .012));
  }, { passive: false });

  function activateTip(x, y) {
    const r = wrap.getBoundingClientRect();
    const dx = x - r.left - r.width / 2;
    const dy = y - r.top - r.height / 2;

    const distance = Math.hypot(dx, dy) / r.width;
    if (distance < .26 || distance > .52) return;

    const screenAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const local = (screenAngle - state.rotation + 36000) % 360;

    const points = [
      [270, "watchlist"],
      [0, "creation"],
      [90, "library"],
      [180, "statistics"]
    ];

    const match = points.find(([angle]) =>
      Math.abs(difference(local, angle)) <= 15
    );

    if (match) openPage(match[1]);
  }

  document.querySelectorAll(".tip").forEach(tip => {
    tip.addEventListener("click", e => {
      if (e.detail === 0) openPage(tip.dataset.page);
    });
  });

  let lastFrame = performance.now();

  function animate(now) {
    const frames = Math.min((now - lastFrame) / 16.667, 3);
    lastFrame = now;

    if (!state.dragging && Math.abs(state.velocity) > .015) {
      setRotation(state.rotation + state.velocity * frames);
      state.velocity *= Math.pow(.955, frames);
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

/* ============================================
   NAVIGATION
============================================ */

function openPage(name) {
  state.currentPage = name;

  document.querySelectorAll(".page").forEach(p =>
    p.classList.remove("active")
  );

  $("homePage").classList.add("hidden");

  const page = $(name + "Page");
  if (page) page.classList.add("active");

  if (name === "library") renderLibrary();
  if (name === "watchlist") renderWatchlist();
  if (name === "statistics") renderStatistics();
}

function goHome() {
  state.currentPage = "home";
  document.querySelectorAll(".page").forEach(p =>
    p.classList.remove("active")
  );
  $("homePage").classList.remove("hidden");
}

function setupNavigation() {
  document.querySelectorAll("[data-back]").forEach(b =>
    b.addEventListener("click", goHome)
  );

  $("libraryAddBtn").addEventListener("click", () =>
    openPage("creation")
  );
}

/* ============================================
   MEDIA OPTIONS
============================================ */

function fillMediaSelectors() {
  ["editMedium", "watchMedium"].forEach(id => {
    const select = $(id);
    clear(select);

    const first = new Option(
      id === "watchMedium"
        ? "Media type (optional)"
        : "Not specified",
      ""
    );

    select.add(first);

    MEDIA_TYPES.forEach(m =>
      select.add(new Option(m, m))
    );
  });
}

/* ============================================
   CREATION AND EDITOR
============================================ */

function setupCreation() {
  document.querySelectorAll("[data-create]").forEach(b => {
    b.addEventListener("click", () =>
      openEditor(b.dataset.create)
    );
  });
}

function setupEditor() {
  $("cancelEditor").onclick = closeEditor;

  $("saveEditor").onclick = () =>
    $("editorForm").requestSubmit();

  $("editorForm").onsubmit = async e => {
    e.preventDefault();
    await saveEditor();
  };

  $("editRating").addEventListener("input", renderStarEditor);

  $("deleteEntryBtn").onclick = deleteCurrentEntry;

  $("bannerInput").addEventListener("change", e => {
    const file = e.target.files?.[0];

    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Please choose an image.");
        return;
      }

      state.pendingImage = file;
      showEditorImage(file);
    }
  });

  $("removeBanner").onclick = () => {
    state.pendingImage = null;
    clearPreviewURL();
    $("bannerPreview").textContent = "No banner";
    $("bannerInput").value = "";
  };

  $("editorOverlay").addEventListener("click", e => {
    if (e.target === $("editorOverlay")) closeEditor();
  });
}

function clearPreviewURL() {
  if (state.imagePreviewURL) {
    URL.revokeObjectURL(state.imagePreviewURL);
    state.imagePreviewURL = null;
  }
}

function showEditorImage(blob) {
  clearPreviewURL();

  state.imagePreviewURL = URL.createObjectURL(blob);
  const img = new Image();

  img.alt = "Banner preview";
  img.src = state.imagePreviewURL;

  $("bannerPreview").replaceChildren(img);
}

async function openEditor(type, id = null, parentId = "") {
  const entry = id ? findEntry(type, id) : null;
  if (id && !entry) return;

  state.editType = type;
  state.editId = id;
  state.pendingImage = undefined;

  $("editorForm").reset();
  $("bannerInput").value = "";
  clearPreviewURL();

  $("editId").value = id || "";
  $("editType").value = type;
  $("editorHeading").textContent =
    (entry ? "Edit " : "Create ") + TYPE_NAMES[type];

  $("editTitle").value = entry?.title || "";
  $("editMedium").value = entry?.medium || "";
  $("editRelease").value = entry?.release || "";
  $("editDuration").value = entry?.duration ?? "";
  $("editRating").value = entry?.rating ?? "";
  $("editEpisodeNumber").value =
    entry?.episodeNumber ?? "";

  $("editMainGenres").value =
    (entry?.mainGenres || []).join(", ");

  $("editSecondaryGenres").value =
    (entry?.secondaryGenres || []).join(", ");

  $("editNotes").value = entry?.notes || "";

  $("mediumField").classList.toggle(
    "hidden", type !== "production"
  );

  $("parentField").classList.toggle(
    "hidden", type === "group"
  );

  $("episodeNumberField").classList.toggle(
    "hidden", type !== "episode"
  );

  $("ratingField").classList.toggle(
    "hidden", type === "group"
  );

  $("deleteEntryBtn").classList.toggle("hidden", !id);

  fillParentSelector(type, entry?.parentId || parentId);
  renderStarEditor();

  $("bannerPreview").textContent = "No banner";
  $("editorOverlay").classList.remove("hidden");

  if (entry) {
    const expectedId = entry.id;
    const blob = await loadImage(type, id).catch(() => null);

    if (blob && state.editId === expectedId) {
      showEditorImage(blob);
    }
  }
}

function fillParentSelector(type, selectedId) {
  const select = $("editParent");
  clear(select);

  const parentType = parentTypeOf(type);
  if (!parentType) return;

  const required = type !== "production";

  $("parentLabel").textContent =
    TYPE_NAMES[parentType] + (required ? "" : " (optional)");

  select.add(new Option(
    required
      ? "Select " + TYPE_NAMES[parentType]
      : "Independent Production",
    ""
  ));

  getCollection(parentType).forEach(parent =>
    select.add(new Option(parent.title, parent.id))
  );

  select.value = selectedId || "";
}

function renderStarEditor() {
  const container = $("starRating");
  clear(container);

  const current = optionalNumber("editRating") ?? 0;

  for (let i = 1; i <= 10; i++) {
    const b = element("button",
      "star-button" + (i <= current ? " active" : ""),
      i <= current ? "★" : "☆"
    );

    b.type = "button";
    b.setAttribute("aria-label", `Rate ${i}/10`);

    b.onclick = () => {
      $("editRating").value = i;
      renderStarEditor();
    };

    container.appendChild(b);
  }
}

async function saveEditor() {
  const type = state.editType;
  const id = state.editId;

  if (!type) return;

  const title = $("editTitle").value.trim();
  if (!title) return alert("Enter a title.");

  const parentId = type === "group"
    ? ""
    : $("editParent").value;

  if (["season", "episode"].includes(type) &&
      !parentId) {
    alert("Select a parent entry first.");
    return;
  }

  if (parentId) {
    const parentType = parentTypeOf(type);

    if (!findEntry(parentType, parentId)) {
      alert("That parent no longer exists.");
      return;
    }
  }

  const rating = optionalNumber("editRating");
  const duration = optionalNumber("editDuration");
  const number = optionalNumber("editEpisodeNumber");

  if (rating !== null && (rating < 0 || rating > 10)) {
    return alert("Rating must be between 0 and 10.");
  }

  if (duration !== null &&
      (!Number.isInteger(duration) || duration < 0)) {
    return alert("Duration must be a nonnegative whole number.");
  }

  if (type === "episode" && number !== null &&
      (!Number.isInteger(number) || number < 1)) {
    return alert("Episode number must be a positive integer.");
  }

  const values = {
    title,
    medium: type === "production"
      ? $("editMedium").value : "",
    parentId,
    episodeNumber: type === "episode" ? number : null,
    release: $("editRelease").value.trim(),
    duration,
    rating: type === "group" ? null : rating,
    mainGenres: parseGenres($("editMainGenres").value),
    secondaryGenres: parseGenres(
      $("editSecondaryGenres").value
    ),
    notes: $("editNotes").value
  };

  // Write image first so failure does not silently
  // create an entry without its selected image.

  const entryId = id || createId();

  try {
    if (state.pendingImage === null) {
      await deleteImage(type, entryId);
      invalidateImageURL(type, entryId);
    } else if (state.pendingImage) {
      await saveImage(type, entryId, state.pendingImage);
      invalidateImageURL(type, entryId);
    }
  } catch (err) {
    console.error(err);
    alert("The banner could not be saved.");
    return;
  }

  if (id) {
    updateEntry(type, id, values);
  } else {
    createEntry(type, { ...values, id: entryId });
  }

  closeEditor();

  if (state.detailType === type &&
      state.detailId === id && id) {
    await openDetail(type, id);
  } else {
    await openDetail(type, entryId);
  }

  renderLibrary();
  renderStatistics();
}

function closeEditor() {
  $("editorOverlay").classList.add("hidden");
  state.editType = null;
  state.editId = null;
  state.pendingImage = undefined;
  clearPreviewURL();
}

async function deleteCurrentEntry() {
  const type = state.editType;
  const id = state.editId;
  if (!type || !id) return;

  const warning = type === "group"
    ? "Delete this Group? Productions will remain independent."
    : ["production", "season"].includes(type)
      ? "Delete this entry and all its descendants?"
      : "Delete this entry?";

  if (!confirm(warning)) return;

  const entry = findEntry(type, id);
  const affected = entry ? [entry, ...descendants(entry)] : [];

  removeEntry(type, id);

  for (const item of affected) {
    try {
      await deleteImage(item.type, item.id);
      invalidateImageURL(item.type, item.id);
    } catch (e) {
      console.error(e);
    }
  }

  closeEditor();
  closeDetail();
  renderLibrary();
  renderStatistics();
}

/* ============================================
   INDIVIDUAL ENTRY DETAILS
============================================ */

function setupDetails() {
  $("closeDetail").onclick = closeDetail;

  $("editDetail").onclick = () => {
    if (state.detailType && state.detailId) {
      openEditor(state.detailType, state.detailId);
    }
  };

  $("detailOverlay").addEventListener("click", e => {
    if (e.target === $("detailOverlay")) closeDetail();
  });
}

function closeDetail() {
  $("detailOverlay").classList.add("hidden");
  state.detailType = null;
  state.detailId = null;
}

async function openDetail(type, id) {
  const item = findEntry(type, id);
  if (!item) return;

  state.detailType = type;
  state.detailId = id;

  $("detailOverlay").classList.remove("hidden");

  $("detailKind").textContent = TYPE_NAMES[type];
  $("detailTitle").textContent = item.title;

  const banner = $("detailBanner");
  clear(banner);

  getImageURL(type, id).then(url => {
    if (!url || state.detailId !== id ||
        state.detailType !== type) return;

    const img = new Image();
    img.alt = "";
    img.src = url;
    banner.prepend(img);
  }).catch(console.error);

  const medium = effectiveMedium(item);

  $("detailMedium").textContent =
    type === "group" ? "" :
    type === "production" ? medium :
    medium ? medium : "";

  const rating = effectiveRating(item);

  const stars = $("detailStars");
  clear(stars);

  for (let i = 1; i <= 10; i++) {
    const star = element(
      "span",
      rating !== null && i <= Math.round(rating)
        ? "filled" : "",
      rating !== null && i <= Math.round(rating)
        ? "★" : "☆"
    );
    stars.appendChild(star);
  }

  $("detailRating").textContent =
    rating === null ? "Unrated" :
    `(${rating.toFixed(1)})`;

  const extra = [];

  if (item.release) extra.push(item.release);

  if (type === "episode" && item.duration !== null &&
      item.duration !== undefined) {
    extra.push(formatMinutes(Number(item.duration)));
  }

  if (type === "episode" && item.episodeNumber != null) {
    extra.unshift("Episode " + item.episodeNumber);
  }

  $("detailExtra").textContent = extra.join(" · ");

  $("detailMainGenres").textContent =
    (item.mainGenres || []).join(" · ");

  $("detailSecondaryGenres").textContent =
    (item.secondaryGenres || []).join(" · ");

  $("detailNotes").textContent = item.notes || "";

  await renderDetailChildren(item);
}

async function renderDetailChildren(item) {
  const container = $("detailChildren");
  clear(container);

  const childType = {
    group: "production",
    production: "season",
    season: "episode"
  }[item.type];

  if (!childType) return;

  const heading = element("div", "children-heading-row");

  const title = element(
    "div", "children-heading",
    childType === "production" ? "Productions" :
    childType === "season" ? "Seasons" : "Episodes"
  );

  const add = element("button", "child-add", "+ Add");
  add.onclick = () => openEditor(childType, null, item.id);

  heading.append(title, add);
  container.appendChild(heading);

  const children = getChildren(item.type, item.id)
    .slice()
    .sort((a,b) => {
      if (childType === "episode") {
        return (a.episodeNumber ?? Infinity) -
          (b.episodeNumber ?? Infinity);
      }
      return a.createdAt - b.createdAt;
    });

  if (!children.length) {
    container.appendChild(emptyMessage("No entries yet."));
    return;
  }

  if (item.type === "group") {
    const strip = element("div", "production-strip");

    children.forEach(child => {
      const tile = element("button", "production-tile");
      const art = element(
        "div", "production-tile-art", "✦"
      );

      imageInto(art, child);

      const bottom = element("div", "production-tile-bottom");
      bottom.appendChild(element("strong", "", child.title));

      const score = effectiveRating(child);

      bottom.appendChild(element(
        "small", "",
        score === null ? "Unrated" : `★ ${score.toFixed(1)}`
      ));

      tile.append(art, bottom);
      tile.onclick = () => openDetail(child.type, child.id);

      strip.appendChild(tile);
    });

    container.appendChild(strip);
  }

  if (item.type === "production") {
    const list = element("div", "season-list");

    children.forEach(child => {
      const row = element("button", "season-row");
      row.appendChild(element("span", "", child.title));

      const score = effectiveRating(child);

      row.appendChild(element(
        "span", "",
        score === null ? "›" : `★ ${score.toFixed(1)}  ›`
      ));

      row.onclick = () => openDetail(child.type, child.id);
      list.appendChild(row);
    });

    container.appendChild(list);
  }

  if (item.type === "season") {
    const grid = element("div", "episode-grid");

    children.forEach((child, index) => {
      const tile = element("button", "episode-tile");

      imageInto(tile, child);

      tile.appendChild(element(
        "span", "episode-number",
        `E${child.episodeNumber ?? index + 1}`
      ));

      const score = effectiveRating(child);

      tile.appendChild(element(
        "small", "",
        score === null ? "" : `★ ${score.toFixed(1)}`
      ));

      tile.onclick = () => openDetail(child.type, child.id);
      grid.appendChild(tile);
    });

    container.appendChild(grid);
  }
}

/* ============================================
   LIBRARY
============================================ */

function setupLibrary() {
  $("librarySearch").oninput = renderLibrary;
  $("librarySort").onchange = renderLibrary;

  document.querySelectorAll("[data-filter]").forEach(b => {
    b.onchange = renderLibrary;
  });
}

function renderLibrary() {
  const search = $("librarySearch").value.toLowerCase().trim();
  const sorting = $("librarySort").value;

  const types = [...document.querySelectorAll(
    "[data-filter]:checked"
  )].map(x => x.dataset.filter);

  const items = allEntries().filter(item => {
    if (!types.includes(item.type)) return false;

    const searchable = [
      item.title, item.medium, parentName(item),
      ...genreList(item)
    ].join(" ").toLowerCase();

    return searchable.includes(search);
  });

  items.sort((a,b) => {
    const scoreA = effectiveRating(a);
    const scoreB = effectiveRating(b);

    const aName = a.title.toLowerCase();
    const bName = b.title.toLowerCase();

    const releaseA = releaseTimestamp(a.release);
    const releaseB = releaseTimestamp(b.release);

    switch (sorting) {
      case "az": return aName.localeCompare(bName);
      case "za": return bName.localeCompare(aName);
      case "oldest":
        return a.createdAt - b.createdAt;
      case "medium":
        return effectiveMedium(a).localeCompare(
          effectiveMedium(b)
        ) || aName.localeCompare(bName);
      case "ratingHigh":
        return (scoreB ?? -1) - (scoreA ?? -1);
      case "ratingLow":
        return (scoreA ?? 11) - (scoreB ?? 11);
      case "releaseNew":
        return (releaseB ?? -Infinity) -
          (releaseA ?? -Infinity);
      case "releaseOld":
        return (releaseA ?? Infinity) -
          (releaseB ?? Infinity);
      default:
        return b.createdAt - a.createdAt;
    }
  });

  $("libraryCount").textContent =
    `${items.length} ${items.length === 1 ? "entry" : "entries"}`;

  const list = $("libraryItems");
  clear(list);

  if (!items.length) {
    list.appendChild(emptyMessage("No entries to display."));
    return;
  }

  items.forEach(item => {
    const row = element("button", "library-entry");

    const art = element(
      "div", "entry-art", SYMBOLS[item.type]
    );
    imageInto(art, item);

    const info = element("div", "entry-info");

    info.appendChild(element("strong", "", item.title));
    info.appendChild(element(
      "small", "",
      [
        TYPE_NAMES[item.type],
        effectiveMedium(item),
        item.release,
        parentName(item)
      ].filter(Boolean).join(" · ")
    ));

    const score = effectiveRating(item);

    const rating = element(
      "span", "entry-score",
      score === null ? "" : `★ ${score.toFixed(1)}`
    );

    const arrow = element("span", "entry-arrow", "›");

    row.append(art, info, rating, arrow);
    row.onclick = () => openDetail(item.type, item.id);

    list.appendChild(row);
  });
}

/* ============================================
   WATCHLIST
============================================ */

function setupWatchlist() {
  $("watchlistForm").onsubmit = e => {
    e.preventDefault();

    const title = $("watchTitle").value.trim();
    if (!title) return;

    trackerData.watchlist.push({
      id: createId(),
      title,
      medium: $("watchMedium").value,
      release: $("watchRelease").value.trim(),
      createdAt: Date.now()
    });

    saveDatabase();
    $("watchlistForm").reset();
    renderWatchlist();
  };
}

function renderWatchlist() {
  const list = $("watchlistItems");
  clear(list);

  if (!trackerData.watchlist.length) {
    list.appendChild(emptyMessage("Your watchlist is empty."));
    return;
  }

  trackerData.watchlist.forEach(item => {
    const row = element("div", "watch-item");

    const checkbox = element("input", "watch-check");
    checkbox.type = "checkbox";
    checkbox.setAttribute(
      "aria-label", `Move ${item.title} into Library`
    );

    checkbox.onchange = () => {
      if (!checkbox.checked) return;

      createEntry("production", {
        title: item.title,
        medium: item.medium,
        release: item.release
      });

      trackerData.watchlist = trackerData.watchlist.filter(
        x => x.id !== item.id
      );

      saveDatabase();
      renderWatchlist();
      renderLibrary();
      renderStatistics();
    };

    const info = element("div", "watch-text");
    info.appendChild(element("strong", "", item.title));
    info.appendChild(element(
      "small", "",
      [item.medium, item.release].filter(Boolean).join(" · ")
    ));

    const del = element("button", "watch-delete", "×");

    del.onclick = () => {
      trackerData.watchlist = trackerData.watchlist.filter(
        x => x.id !== item.id
      );
      saveDatabase();
      renderWatchlist();
    };

    row.append(checkbox, info, del);
    list.appendChild(row);
  });
}

/* ============================================
   STATISTICS DATA
============================================ */

// Durations:
// Episodes with entered durations are counted individually.
// A Season's duration is used only when its Episodes
// have no durations.
// A Production's duration is used only when none of
// its Seasons/Episodes provide durations.

function productionMinutes(production) {
  const seasons = getChildren("production", production.id);
  let sum = 0;
  let known = false;

  for (const season of seasons) {
    const episodes = getChildren("season", season.id);
    const durations = episodes
      .map(e => e.duration)
      .filter(v => v !== null && v !== undefined)
      .map(Number)
      .filter(Number.isFinite);

    if (durations.length) {
      sum += durations.reduce((a,b) => a+b,0);
      known = true;
    } else if (season.duration !== null &&
               season.duration !== undefined) {
      sum += Number(season.duration) || 0;
      known = true;
    }
  }

  if (known) return sum;

  return Number(production.duration) || 0;
}

function statisticsData() {
  const productions = trackerData.productions;
  const ratings = productions
    .map(effectiveRating)
    .filter(v => v !== null);

  const media = new Map();
  const genres = new Map();
  const genreSets = new Map();
  const overlaps = new Map();
  const points = [];

  const timeline = new Map();

  for (const p of productions) {
    const medium = p.medium || "Unspecified";
    const minutes = productionMinutes(p);

    media.set(medium, (media.get(medium) || 0) + minutes);

    const uniqueGenres = [...new Set(
      genreList(p).map(g => g.toLowerCase())
    )];

    uniqueGenres.forEach(g => {
      genres.set(g, (genres.get(g) || 0) + 1);
    });

    genreSets.set(p.id, new Set(uniqueGenres));

    for (let i = 0; i < uniqueGenres.length; i++) {
      for (let j = i + 1; j < uniqueGenres.length; j++) {
        const key = [uniqueGenres[i], uniqueGenres[j]]
          .sort().join("|");
        overlaps.set(key, (overlaps.get(key) || 0) + 1);
      }
    }

    const rating = effectiveRating(p);
    if (rating !== null) {
      points.push({
        title: p.title,
        x: minutes,
        y: rating
      });
    }

    // Release year is used as a timeline proxy.
    // This is NOT a personal viewing history.
    const year = String(p.release || "")
      .match(/\b(?:18|19|20|21)\d{2}\b/)?.[0];

    if (year) {
      timeline.set(year, (timeline.get(year) || 0) + minutes);
    }
  }

  const total = productions.reduce(
    (sum,p) => sum + productionMinutes(p), 0
  );

  const ranked = productions
    .map(p => ({
      title: p.title,
      rating: effectiveRating(p)
    }))
    .filter(p => p.rating !== null)
    .sort((a,b) => b.rating - a.rating);

  return {
    productions,
    total,
    ratings,
    average: ratings.length
      ? ratings.reduce((a,b) => a+b,0) / ratings.length
      : null,
    media: [...media].map(([name,value]) => ({name,value})),
    genres: [...genres].map(([name,value]) => ({name,value}))
      .sort((a,b) => b.value - a.value),
    genreSets,
    overlaps: [...overlaps].map(([key,value]) => ({
      name: key.replace("|", " + "),
      pair: key.split("|"),
      value
    })).sort((a,b) => b.value - a.value),
    points,
    ranked,
    timeline: [...timeline].sort((a,b) =>
      Number(a[0]) - Number(b[0])
    ).map(([name,value]) => ({name,value}))
  };
}

/* ============================================
   STATISTICS CONFIGURATION
============================================ */

const METRICS = {
  watchTime: {
    name: "Total Watch Time",
    diagrams: ["line", "stacked", "treemap", "ranked"]
  },
  media: {
    name: "Media Breakdown",
    diagrams: ["donut", "stacked", "treemap", "ranked"]
  },
  genres: {
    name: "Genre Distribution",
    diagrams: ["donut", "stacked", "treemap", "radar", "ranked"]
  },
  overlap: {
    name: "Genre Overlapping",
    diagrams: ["venn", "upset", "chord", "network", "ranked"]
  },
  ratings: {
    name: "Rating Distribution",
    diagrams: ["histogram", "box", "stacked"]
  },
  highest: {
    name: "Highest Rated",
    diagrams: ["ranked", "scatter"]
  },
  lowest: {
    name: "Lowest Rated",
    diagrams: ["ranked", "scatter"]
  }
};

const DIAGRAMS = {
  line: "Line Graph",
  donut: "Donut Chart",
  stacked: "Stacked Bar Chart",
  treemap: "Treemap",
  radar: "Radar Chart",
  venn: "Venn Diagram",
  upset: "UpSet Plot",
  chord: "Chord Diagram",
  network: "Network Graph",
  histogram: "Histogram",
  box: "Box and Whisker Plot",
  ranked: "Ranked Horizontal Bar Chart",
  scatter: "Scatter Plot"
};

const COLORS = [
  "#f3dda0", "#c99e59", "#997342", "#ead1a0",
  "#796b57", "#b5a183", "#876e48", "#dcc080"
];

function setupStatistics() {
  const metric = $("statMetric");

  Object.entries(METRICS).forEach(([key,item]) =>
    metric.add(new Option(item.name, key))
  );

  metric.value = "genres";

  metric.onchange = () => {
    fillDiagramSelector();
    renderStatistics();
  };

  $("statDiagram").onchange = renderStatistics;
  fillDiagramSelector();
}

function fillDiagramSelector() {
  const key = $("statMetric").value;
  const select = $("statDiagram");
  const existing = select.value;

  clear(select);

  METRICS[key].diagrams.forEach(id =>
    select.add(new Option(DIAGRAMS[id], id))
  );

  if (METRICS[key].diagrams.includes(existing)) {
    select.value = existing;
  } else {
    select.selectedIndex = 0;
  }
}

function selectedData(stats, metric) {
  switch (metric) {
    case "watchTime":
      return stats.timeline;
    case "media":
      return stats.media.filter(d => d.value > 0);
    case "genres":
      return stats.genres;
    case "overlap":
      return stats.overlaps;
    case "ratings":
      return stats.ratings;
    case "highest":
      return stats.ranked.slice(0, 12).map(p => ({
        name: p.title, value: p.rating
      }));
    case "lowest":
      return stats.ranked.slice(-12).reverse().map(p => ({
        name: p.title, value: p.rating
      }));
  }
  return [];
}

function renderStatistics() {
  const stats = statisticsData();

  $("statProductions").textContent =
    stats.productions.length;

  $("statWatchTime").textContent =
    formatMinutes(stats.total);

  $("statAverage").textContent =
    formatScore(stats.average);

  const metric = $("statMetric").value;
  const diagram = $("statDiagram").value;

  if (!metric || !diagram) return;

  $("chartTitle").textContent = METRICS[metric].name;
  $("chartSubtitle").textContent = DIAGRAMS[diagram];

  const descriptions = {
    watchTime:
      "Duration is estimated from entered Production, Season and Episode minutes. The line chart groups those durations by release year, not by the date you watched them.",
    media:
      "Watch time grouped by Production media type. Entries without duration information contribute no minutes.",
    genres:
      "Counts of Productions carrying each genre. A Production with several genres contributes to several categories.",
    overlap:
      "Genres appearing together in the same Production. Shows pairwise combinations, including secondary genres.",
    ratings:
      "Distribution of available Production ratings, including ratings inherited from Seasons and Episodes.",
    highest:
      "The highest-rated Productions, excluding unrated entries.",
    lowest:
      "The lowest-rated Productions, excluding unrated entries."
  };

  $("statExplanation").textContent = descriptions[metric];

  const area = $("chartArea");
  clear(area);

  const data = selectedData(stats, metric);

  if (!data.length) {
    area.appendChild(emptyMessage(
      metric === "watchTime"
        ? "Add release years and durations to see this chart."
        : "Not enough library data for this diagram."
    ));
    return;
  }

  const charts = {
    line: drawLine,
    donut: drawDonut,
    stacked: drawStacked,
    treemap: drawTreemap,
    radar: drawRadar,
    venn: drawVenn,
    upset: drawUpSet,
    chord: drawChord,
    network: drawNetwork,
    histogram: drawHistogram,
    box: drawBox,
    ranked: drawRanked,
    scatter: drawScatter
  };

  const svg = charts[diagram](data, stats, metric);

  if (!svg) {
    area.appendChild(emptyMessage(
      "More data is needed to draw this diagram."
    ));
    return;
  }

  area.innerHTML = svg;
}

/* ============================================
   SVG CHART HELPERS
============================================ */

function svgWrap(content, w = 400, h = 300) {
  return `<svg viewBox="0 0 ${w} ${h}"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Statistics chart"
    style="font-family:Georgia,serif">
    ${content}
  </svg>`;
}

function txt(x,y,text,size=11,anchor="middle",color="#ddd0b6") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}"
    fill="${color}" font-size="${size}">
    ${safeText(text)}
  </text>`;
}

function rect(x,y,w,h,color,rx=0) {
  return `<rect x="${x}" y="${y}" width="${Math.max(0,w)}"
    height="${Math.max(0,h)}" rx="${rx}" fill="${color}"/>`;
}

function circle(x,y,r,color,opacity=1) {
  return `<circle cx="${x}" cy="${y}" r="${r}"
    fill="${color}" opacity="${opacity}"/>`;
}

function line(x1,y1,x2,y2,color="#746344",width=1) {
  return `<line x1="${x1}" y1="${y1}"
    x2="${x2}" y2="${y2}"
    stroke="${color}" stroke-width="${width}"/>`;
}

function polar(cx,cy,r,angle) {
  const a = angle * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function pathSlice(cx,cy,outer,inner,start,end,color) {
  const p1 = polar(cx,cy,outer,start);
  const p2 = polar(cx,cy,outer,end);
  const p3 = polar(cx,cy,inner,end);
  const p4 = polar(cx,cy,inner,start);
  const large = end-start > 180 ? 1 : 0;

  const d = `M${p1[0]},${p1[1]}
    A${outer},${outer} 0 ${large} 1 ${p2[0]},${p2[1]}
    L${p3[0]},${p3[1]}
    A${inner},${inner} 0 ${large} 0 ${p4[0]},${p4[1]} Z`;

  return `<path d="${d}" fill="${color}"/>`;
}

function legend(data) {
  return `<g>${data.map((d,i) =>
    `${circle(15,15+i*16,4,COLORS[i%COLORS.length])}
     ${txt(25,19+i*16,
       d.name.length > 24
         ? d.name.slice(0,22)+"…"
         : d.name,
       10,"start")}`
  ).join("")}</g>`;
}

function valueData(data) {
  return data.filter(d =>
    Number.isFinite(Number(d.value)) &&
    Number(d.value) >= 0
  ).map(d => ({
    name: d.name,
    value: Number(d.value)
  }));
}

/* LINE GRAPH */

function drawLine(data) {
  const d = valueData(data);
  if (!d.length) return null;

  const max = Math.max(...d.map(x=>x.value),1);
  const left=47, right=376, top=36, bottom=242;
  const step=(right-left)/Math.max(d.length-1,1);

  let s = "";

  for(let i=0;i<=4;i++){
    const y=bottom-(bottom-top)*i/4;
    s+=line(left,y,right,y,"#51483a",.7);
    s+=txt(38,y+4,Math.round(max*i/4),10,"end");
  }

  const points=d.map((v,i)=>[
    left+i*step,
    bottom-v.value/max*(bottom-top)
  ]);

  s+=`<polyline fill="none" stroke="#e6c67e"
    stroke-width="2.5"
    points="${points.map(p=>p.join(",")).join(" ")}"/>`;

  points.forEach((p,i)=>{
    s+=circle(p[0],p[1],4,COLORS[0]);
    if(d.length<=12 || i%Math.ceil(d.length/12)===0){
      s+=txt(p[0],bottom+22,d[i].name,9);
    }
  });

  return svgWrap(s);
}

/* DONUT */

function drawDonut(data) {
  const d=valueData(data).filter(x=>x.value>0).slice(0,8);
  const total=d.reduce((a,b)=>a+b.value,0);
  if(!total)return null;

  let start=-90;
  let s="";

  d.forEach((v,i)=>{
    const angle=v.value/total*360;
    if(angle>=359.999){
      s+=`<circle cx="145" cy="145" r="91"
       fill="none" stroke="${COLORS[i%COLORS.length]}"
       stroke-width="39"/>`;
    }else{
      s+=pathSlice(
        145,145,110,71,start,start+angle,
        COLORS[i%COLORS.length]
      );
    }
    start+=angle;
  });

  s+=txt(145,140,total.toLocaleString(),22);
  s+=txt(145,161,"TOTAL",10);
  s+=`<g transform="translate(280,48)">${legend(d)}</g>`;

  return svgWrap(s,470,300);
}

/* STACKED BAR */

function drawStacked(data,stats,metric) {
  if(metric==="ratings"){
    const bins=Array(10).fill(0);
    data.forEach(v=>{
      const i=Math.min(9,Math.max(0,Math.ceil(v)-1));
      bins[i]++;
    });
    data=bins.map((value,i)=>({
      name:String(i+1),value
    }));
  }

  const d=valueData(data).filter(x=>x.value>0).slice(0,10);
  const total=d.reduce((a,b)=>a+b.value,0);
  if(!total)return null;

  let current=20;
  let s="";

  d.forEach((v,i)=>{
    const width=v.value/total*360;
    s+=rect(current,105,width,55,COLORS[i%COLORS.length]);
    current+=width;
  });

  s+=txt(200,90,"TOTAL: "+total.toLocaleString(),14);

  d.forEach((v,i)=>{
    const col=i%2, row=Math.floor(i/2);
    s+=circle(20+col*185,204+row*18,4,
      COLORS[i%COLORS.length]);
    s+=txt(30+col*185,208+row*18,
      v.name.slice(0,16)+" ("+v.value+")",10,"start");
  });

  return svgWrap(s,400,300);
}

/* TREEMAP */

function drawTreemap(data) {
  const d=valueData(data).filter(x=>x.value>0)
    .sort((a,b)=>b.value-a.value).slice(0,14);

  const total=d.reduce((a,b)=>a+b.value,0);
  if(!total)return null;

  // Alternating slice-and-dice treemap.
  let remaining={x:10,y:12,w:380,h:270};
  let remainingTotal=total;
  let s="";

  d.forEach((v,i)=>{
    const final=i===d.length-1;
    const ratio=final?1:v.value/remainingTotal;
    let box;

    if(i%2===0){
      const w=remaining.w*ratio;
      box={x:remaining.x,y:remaining.y,w,h:remaining.h};
      remaining.x+=w;
      remaining.w-=w;
    }else{
      const h=remaining.h*ratio;
      box={x:remaining.x,y:remaining.y,w:remaining.w,h};
      remaining.y+=h;
      remaining.h-=h;
    }

    remainingTotal-=v.value;

    s+=rect(box.x+1,box.y+1,box.w-2,box.h-2,
      COLORS[i%COLORS.length],3);

    if(box.w>48 && box.h>28){
      s+=txt(box.x+box.w/2,box.y+box.h/2,
        v.name.slice(0,Math.max(4,Math.floor(box.w/9))),
        10,"middle","#17120b");
    }
  });

  return svgWrap(s);
}

/* RADAR */

function drawRadar(data) {
  const d=valueData(data).slice(0,8);
  if(d.length<3)return null;

  const cx=200,cy=150,r=100;
  const max=Math.max(...d.map(v=>v.value),1);
  const n=d.length;
  let s="";

  for(let ring=1;ring<=4;ring++){
    const points=d.map((v,i)=>{
      const a=-90+i*360/n;
      return polar(cx,cy,r*ring/4,a).join(",");
    }).join(" ");

    s+=`<polygon points="${points}" fill="none"
      stroke="#675941" stroke-width=".8"/>`;
  }

  const plot=d.map((v,i)=>
    polar(cx,cy,r*v.value/max,-90+i*360/n).join(",")
  ).join(" ");

  s+=`<polygon points="${plot}"
    fill="#d9b66c" fill-opacity=".3"
    stroke="#f0d99b" stroke-width="2"/>`;

  d.forEach((v,i)=>{
    const [x,y]=polar(cx,cy,r+20,-90+i*360/n);
    s+=txt(x,y,v.name.slice(0,11),10);
  });

  return svgWrap(s);
}

/* VENN: TWO OR THREE MOST COMMON GENRES */

function drawVenn(data,stats) {
  const d=stats.genres.slice(0,3);
  if(d.length<2)return null;

  const positions=d.length===2
    ? [[160,150],[240,150]]
    : [[160,121],[240,121],[200,185]];

  let s="";

  d.forEach((v,i)=>{
    const [x,y]=positions[i];
    s+=`<circle cx="${x}" cy="${y}" r="75"
      fill="${COLORS[i]}" fill-opacity=".24"
      stroke="${COLORS[i]}" stroke-width="2"/>`;
    s+=txt(x,y-10,v.name.slice(0,15),13);
    s+=txt(x,y+7,String(v.value),11);
  });

  return svgWrap(s);
}

/* UPSET PLOT */

function drawUpSet(data,stats) {
  const genres=stats.genres.slice(0,4).map(x=>x.name);
  if(genres.length<2)return null;

  const combos=new Map();

  for(const set of stats.genreSets.values()){
    const selected=genres.filter(g=>set.has(g));
    if(!selected.length)continue;

    const key=selected.join("|");
    combos.set(key,(combos.get(key)||0)+1);
  }

  const d=[...combos].map(([key,value])=>({
    key,value
  })).sort((a,b)=>b.value-a.value).slice(0,9);

  if(!d.length)return null;

  const max=Math.max(...d.map(x=>x.value));
  let s="";

  d.forEach((v,i)=>{
    const x=100+i*31;
    const height=v.value/max*104;

    s+=rect(x,130-height,20,height,
      COLORS[i%COLORS.length],3);

    s+=txt(x+10,122-height,String(v.value),9);

    const selected=v.key.split("|");
    let ys=[];

    genres.forEach((g,j)=>{
      const y=175+j*25;
      const active=selected.includes(g);
      s+=circle(x+10,y,4,
        active?"#f0d99b":"#49443e");
      if(active)ys.push(y);
    });

    if(ys.length>1){
      s+=line(x+10,Math.min(...ys),
        x+10,Math.max(...ys),"#f0d99b",2);
    }
  });

  genres.forEach((g,j)=>{
    s+=txt(89,179+j*25,g.slice(0,12),10,"end");
  });

  return svgWrap(s);
}

/* CHORD DIAGRAM */

function drawChord(data,stats) {
  const names=stats.genres.slice(0,7).map(g=>g.name);
  if(names.length<2)return null;

  const cx=200,cy=150,r=105;
  const positions=names.map((name,i)=>
    polar(cx,cy,r,-90+i*360/names.length)
  );

  let s=`<circle cx="${cx}" cy="${cy}" r="${r}"
    fill="none" stroke="#756344"/>`;

  stats.overlaps.forEach(overlap=>{
    const a=names.indexOf(overlap.pair[0]);
    const b=names.indexOf(overlap.pair[1]);
    if(a<0||b<0)return;

    const p1=positions[a],p2=positions[b];
    s+=`<path d="M${p1[0]},${p1[1]}
      Q${cx},${cy} ${p2[0]},${p2[1]}"
      fill="none" stroke="${COLORS[a%COLORS.length]}"
      stroke-opacity=".6"
      stroke-width="${Math.min(9,1+overlap.value)}"/>`;
  });

  positions.forEach((p,i)=>{
    s+=circle(p[0],p[1],6,COLORS[i%COLORS.length]);
    const label=polar(cx,cy,r+24,-90+i*360/names.length);
    s+=txt(label[0],label[1],
      names[i].slice(0,11),10);
  });

  return svgWrap(s);
}

/* NETWORK GRAPH */

function drawNetwork(data,stats) {
  const names=stats.genres.slice(0,9).map(g=>g.name);
  if(names.length<2)return null;

  const cx=200,cy=145;
  const positions=names.map((n,i)=>
    polar(cx,cy,105,-90+i*360/names.length)
  );

  let s="";

  stats.overlaps.forEach(o=>{
    const a=names.indexOf(o.pair[0]);
    const b=names.indexOf(o.pair[1]);
    if(a<0||b<0)return;

    s+=line(...positions[a],...positions[b],
      "#97794a",Math.min(7,.7+o.value));
  });

  positions.forEach((p,i)=>{
    s+=circle(p[0],p[1],9,COLORS[i%COLORS.length]);
    const label=polar(cx,cy,130,
      -90+i*360/names.length);
    s+=txt(label[0],label[1],
      names[i].slice(0,10),10);
  });

  return svgWrap(s);
}

/* HISTOGRAM */

function drawHistogram(data) {
  if(!data.length)return null;

  const bins=Array(10).fill(0);

  data.forEach(v=>{
    const index=Math.min(9,
      Math.max(0,Math.ceil(Number(v))-1));
    bins[index]++;
  });

  const max=Math.max(...bins,1);
  let s="";

  for(let i=0;i<10;i++){
    const h=bins[i]/max*195;
    const x=30+i*35;
    s+=rect(x,240-h,29,h,COLORS[i%COLORS.length],2);
    s+=txt(x+14,256,String(i+1),10);
    if(bins[i])s+=txt(x+14,230-h,String(bins[i]),10);
  }

  s+=line(24,240,385,240);

  return svgWrap(s);
}

/* BOX AND WHISKER */

function drawBox(data) {
  const sorted=[...data].map(Number)
    .filter(Number.isFinite).sort((a,b)=>a-b);

  if(!sorted.length)return null;

  function quantile(q){
    const p=(sorted.length-1)*q;
    const lo=Math.floor(p),hi=Math.ceil(p);
    return sorted[lo]+
      (sorted[hi]-sorted[lo])*(p-lo);
  }

  const low=sorted[0],high=sorted.at(-1);
  const q1=quantile(.25),median=quantile(.5);
  const q3=quantile(.75);

  const x=v=>35+v/10*330;
  let s=line(35,180,365,180,"#8e794e",2);

  for(let i=0;i<=10;i+=2){
    s+=txt(x(i),215,String(i),11);
    s+=line(x(i),187,x(i),193);
  }

  s+=line(x(low),150,x(high),150,"#e6cb8b",2);
  s+=line(x(low),135,x(low),165,"#e6cb8b",2);
  s+=line(x(high),135,x(high),165,"#e6cb8b",2);
  s+=rect(x(q1),112,x(q3)-x(q1),76,"#ba9253",3);
  s+=line(x(median),112,x(median),188,"#fff0b4",3);

  s+=txt(200,61,
    `Median ${median.toFixed(1)} / 10`,16);

  return svgWrap(s);
}

/* RANKED HORIZONTAL BARS */

function drawRanked(data,stats,metric) {
  let d=valueData(data).slice(0,9);
  if(!d.length)return null;

  if(metric==="watchTime"){
    d=stats.productions
      .map(p=>({
        name:p.title,value:productionMinutes(p)
      }))
      .filter(p=>p.value>0)
      .sort((a,b)=>b.value-a.value)
      .slice(0,9);
  }

  const max=Math.max(...d.map(x=>x.value),1);
  const rowHeight=30;
  const height=Math.max(160,d.length*rowHeight+26);

  let s="";

  d.forEach((v,i)=>{
    const y=11+i*rowHeight;
    const width=v.value/max*214;

    s+=txt(7,y+15,v.name.slice(0,17),10,"start");
    s+=rect(130,y,214,17,"#28231e",3);
    s+=rect(130,y,width,17,
      COLORS[i%COLORS.length],3);
    s+=txt(351,y+13,
      Number(v.value.toFixed(1)).toString(),10,"start");
  });

  return svgWrap(s,400,height);
}

/* SCATTER PLOT: DURATION VS RATING */

function drawScatter(data,stats) {
  const points=stats.points;
  if(!points.length)return null;

  const maxX=Math.max(...points.map(p=>p.x),1);
  const left=42,right=375,top=20,bottom=245;

  let s=line(left,bottom,right,bottom);
  s+=line(left,top,left,bottom);

  for(let i=0;i<=5;i++){
    const y=bottom-i/5*(bottom-top);
    s+=line(left,y,right,y,"#51493b",.7);
    s+=txt(34,y+4,String(i*2),10,"end");
  }

  points.forEach((p,i)=>{
    const x=left+p.x/maxX*(right-left);
    const y=bottom-p.y/10*(bottom-top);

    s+=`<circle cx="${x}" cy="${y}" r="5"
      fill="${COLORS[i%COLORS.length]}">
      <title>${safeText(p.title)}:
      ${p.y.toFixed(1)}/10,
      ${p.x} minutes</title>
    </circle>`;
  });

  s+=txt(210,284,"Duration (minutes)",11);

  return svgWrap(s);
}

/* ============================================
   KEYBOARD
============================================ */

document.addEventListener("keydown", e => {
  if(e.key!=="Escape")return;

  if(!$("editorOverlay").classList.contains("hidden")){
    closeEditor();
    return;
  }

  if(!$("detailOverlay").classList.contains("hidden")){
    closeDetail();
    return;
  }

  if(state.currentPage!=="home")goHome();
});
