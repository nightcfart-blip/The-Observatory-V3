
document.addEventListener("DOMContentLoaded", init);

/* --------------------------------
   GLOBAL STATE
-------------------------------- */

const app = {
  rotation: 0,
  velocity: 0,
  pointerId: null,
  dragging: false,
  moved: false,
  startX: 0,
  startY: 0,
  lastAngle: 0,
  lastTime: 0,
  editorType: null,
  editorId: null,
  returnPage: "creation"
};

const $ = id => document.getElementById(id);

const symbols = {
  group: "◇",
  production: "✦",
  season: "◈",
  episode: "✧"
};

const typeNames = {
  group: "Group",
  production: "Production",
  season: "Season",
  episode: "Episode"
};

/* --------------------------------
   INITIALIZATION
-------------------------------- */

function init() {
  setupCompass();
  setupNavigation();
  setupCreation();
  setupEditor();
  setupLibrary();
  setupWatchlist();

  fillMediaSelectors();

  renderLibrary();
  renderWatchlist();
}

/* --------------------------------
   COMPASS
-------------------------------- */

function setupCompass() {
  const wrap = $("compassWrap");
  const compass = $("compass");

  const center = () => {
    const rect = wrap.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  };

  const angleAt = (x, y) => {
    const c = center();

    return Math.atan2(
      y - c.y,
      x - c.x
    ) * 180 / Math.PI;
  };

  const angleDifference = (a, b) => {
    return ((a - b + 540) % 360) - 180;
  };

  const setRotation = value => {
    app.rotation = value;
    compass.style.transform = `rotate(${value}deg)`;
  };

  // Spin and tap are handled separately, so a
  // dragged needle never accidentally opens a page.

  wrap.addEventListener("pointerdown", e => {
    if (app.dragging) return;

    app.dragging = true;
    app.pointerId = e.pointerId;
    app.moved = false;
    app.velocity = 0;

    app.startX = e.clientX;
    app.startY = e.clientY;

    app.lastAngle = angleAt(e.clientX, e.clientY);
    app.lastTime = performance.now();

    wrap.setPointerCapture(e.pointerId);
  });

  wrap.addEventListener("pointermove", e => {
    if (!app.dragging || app.pointerId !== e.pointerId) {
      return;
    }

    const distance = Math.hypot(
      e.clientX - app.startX,
      e.clientY - app.startY
    );

    if (distance > 7) app.moved = true;

    if (!app.moved) return;

    const now = performance.now();
    const angle = angleAt(e.clientX, e.clientY);

    const difference = angleDifference(
      angle,
      app.lastAngle
    );

    setRotation(app.rotation + difference);

    const dt = Math.max(now - app.lastTime, 1);

    app.velocity = Math.max(
      -18,
      Math.min(18, difference / dt * 16)
    );

    app.lastAngle = angle;
    app.lastTime = now;
  });

  function finishPointer(e, cancelled = false) {
    if (!app.dragging || app.pointerId !== e.pointerId) {
      return;
    }

    const wasMoved = app.moved;

    app.dragging = false;
    app.pointerId = null;

    if (wrap.hasPointerCapture(e.pointerId)) {
      wrap.releasePointerCapture(e.pointerId);
    }

    if (!cancelled && !wasMoved) {
      app.velocity = 0;
      activateCompassTip(e.clientX, e.clientY);
    }

    if (cancelled) app.velocity = 0;
  }

  wrap.addEventListener("pointerup", e => {
    finishPointer(e);
  });

  wrap.addEventListener("pointercancel", e => {
    finishPointer(e, true);
  });

  wrap.addEventListener("wheel", e => {
    e.preventDefault();

    app.velocity += Math.max(
      -5,
      Math.min(5, e.deltaY * .012)
    );
  }, { passive: false });

  function activateCompassTip(x, y) {
    const rect = wrap.getBoundingClientRect();

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = x - cx;
    const dy = y - cy;

    const radius = Math.hypot(dx, dy);
    const size = rect.width;

    // Only the outer portion of the
    // main compass arrows acts as a button.

    if (radius < size * .26 ||
        radius > size * .52) {
      return;
    }

    const screenAngle = Math.atan2(
      dy, dx
    ) * 180 / Math.PI;

    const localAngle = (
      (screenAngle - app.rotation + 3600) % 360
    );

    const targets = [
      { angle: 270, page: "watchlist" },
      { angle: 0, page: "creation" },
      { angle: 90, page: "library" },
      { angle: 180, page: "statistics" }
    ];

    const selected = targets.find(target => {
      const delta = Math.abs(
        angleDifference(localAngle, target.angle)
      );

      return delta <= 15;
    });

    if (selected) {
      openPage(selected.page);
    }
  }

  // Keyboard accessibility for the four buttons.
  document.querySelectorAll(".tip").forEach(tip => {
    tip.addEventListener("click", e => {
      if (e.detail !== 0) return;
      openPage(tip.dataset.page);
    });
  });

  let lastFrame = performance.now();

  function animate(now) {
    const frames = Math.min(
      (now - lastFrame) / 16.667,
      3
    );

    lastFrame = now;

    if (!app.dragging && Math.abs(app.velocity) > .015) {
      setRotation(
        app.rotation + app.velocity * frames
      );

      app.velocity *= Math.pow(.955, frames);
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

/* --------------------------------
   NAVIGATION
-------------------------------- */

function openPage(page) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  $("homePage").classList.add("hidden");

  const target = $(page + "Page");

  if (target) {
    target.classList.add("active");
  }

  if (page === "library") {
    renderLibrary();
  }

  if (page === "watchlist") {
    renderWatchlist();
  }
}

function goHome() {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  $("homePage").classList.remove("hidden");
}

function setupNavigation() {
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", goHome);
  });

  $("libraryAddBtn").addEventListener("click", () => {
    openPage("creation");
  });
}

/* --------------------------------
   MEDIA OPTIONS
-------------------------------- */

function fillMediaSelectors() {
  ["editMedium", "watchMedium"].forEach(id => {
    const select = $(id);

    select.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = id === "watchMedium"
      ? "Media type (optional)"
      : "Not specified";

    select.appendChild(empty);

    MEDIA_TYPES.forEach(medium => {
      const option = document.createElement("option");
      option.value = medium;
      option.textContent = medium;
      select.appendChild(option);
    });
  });
}

/* --------------------------------
   CREATION
-------------------------------- */

function setupCreation() {
  document.querySelectorAll("[data-create]").forEach(btn => {
    btn.addEventListener("click", () => {
      openEditor(btn.dataset.create);
    });
  });
}

/* --------------------------------
   EDITOR
-------------------------------- */

function setupEditor() {
  $("cancelEditor").addEventListener(
    "click", closeEditor
  );

  $("saveEditor").addEventListener("click", () => {
    $("editorForm").requestSubmit();
  });

  $("editorForm").addEventListener("submit", e => {
    e.preventDefault();
    saveEditor();
  });

  $("editRating").addEventListener("input", () => {
    renderStars();
  });

  $("deleteEntryBtn").addEventListener("click", () => {
    deleteCurrentEntry();
  });

  $("addChildBtn").addEventListener("click", () => {
    addChildFromEditor();
  });

  $("editorOverlay").addEventListener("click", e => {
    if (e.target === $("editorOverlay")) {
      closeEditor();
    }
  });

  renderStars();
}

function openEditor(type, id = null, parentId = "") {
  const entry = id ? findEntry(type, id) : null;

  if (id && !entry) return;

  app.editorType = type;
  app.editorId = id;

  $("editorForm").reset();

  $("editId").value = id || "";
  $("editType").value = type;

  $("editorHeading").textContent =
    (entry ? "Edit " : "Create ") + typeNames[type];

  $("editTitle").value = entry?.title || "";
  $("editRelease").value = entry?.release || "";
  $("editDuration").value = entry?.duration ?? "";
  $("editEpisodeNumber").value =
    entry?.episodeNumber ?? "";

  $("editRating").value = entry?.rating ?? "";

  $("editMedium").value = entry?.medium || "";

  $("editMainGenres").value =
    (entry?.mainGenres || []).join(", ");

  $("editSecondaryGenres").value =
    (entry?.secondaryGenres || []).join(", ");

  $("editNotes").value = entry?.notes || "";

  const mediumField = $("mediumField");
  const parentField = $("parentField");
  const episodeField = $("episodeNumberField");

  mediumField.classList.toggle(
    "hidden",
    type !== "production"
  );

  parentField.classList.toggle(
    "hidden",
    type === "group"
  );

  episodeField.classList.toggle(
    "hidden",
    type !== "episode"
  );

  // Groups display an average later, rather than
  // accepting a manually entered rating.
  $("ratingField").classList.toggle(
    "hidden",
    type === "group"
  );

  fillParentSelector(
    type,
    entry?.parentId || parentId
  );

  $("deleteEntryBtn").classList.toggle(
    "hidden",
    !entry
  );

  updateChildrenSection();

  renderStars();

  $("editorOverlay").classList.remove("hidden");

  $("editTitle").focus();
}

function closeEditor() {
  $("editorOverlay").classList.add("hidden");

  app.editorId = null;
  app.editorType = null;

  renderLibrary();
}

function fillParentSelector(type, selectedId) {
  const select = $("editParent");

  select.innerHTML = "";

  const config = {
    production: {
      parentType: "group",
      label: "Group (optional)"
    },
    season: {
      parentType: "production",
      label: "Production"
    },
    episode: {
      parentType: "season",
      label: "Season"
    }
  }[type];

  if (!config) return;

  $("parentLabel").textContent = config.label;

  const empty = document.createElement("option");
  empty.value = "";

  empty.textContent =
    type === "production"
      ? "Independent Production"
      : "Select a " + typeNames[config.parentType];

  select.appendChild(empty);

  getCollection(config.parentType).forEach(item => {
    const option = document.createElement("option");

    option.value = item.id;
    option.textContent = item.title || "Untitled";

    select.appendChild(option);
  });

  select.value = selectedId || "";
}

function parseGenres(text) {
  return [...new Set(
    text.split(",")
      .map(g => g.trim())
      .filter(Boolean)
  )];
}

function readOptionalNumber(id) {
  const raw = $(id).value.trim();

  if (raw === "") return null;

  const number = Number(raw);

  return Number.isFinite(number) ? number : null;
}

function saveEditor() {
  const type = app.editorType;
  const id = app.editorId;

  if (!type) return;

  const title = $("editTitle").value.trim();

  if (!title) {
    alert("Please enter a title.");
    return;
  }

  let parentId = $("editParent").value;

  if (type === "group") {
    parentId = "";
  }

  if (type === "season" || type === "episode") {
    if (!parentId) {
      alert(
        "Please select a " +
        (type === "season" ? "Production." : "Season.")
      );
      return;
    }
  }

  const rating = readOptionalNumber("editRating");

  if (rating !== null && (rating < 0 || rating > 10)) {
    alert("Ratings must be between 0 and 10.");
    return;
  }

  const duration = readOptionalNumber("editDuration");
  const episodeNumber =
    readOptionalNumber("editEpisodeNumber");

  if (duration !== null && duration < 0) {
    alert("Duration cannot be negative.");
    return;
  }

  if (episodeNumber !== null &&
      (!Number.isInteger(episodeNumber) ||
       episodeNumber < 1)) {
    alert("Episode number must be a positive whole number.");
    return;
  }

  const values = {
    title,
    medium:
      type === "production"
        ? $("editMedium").value
        : "",
    parentId,
    episodeNumber:
      type === "episode" ? episodeNumber : null,
    release: $("editRelease").value.trim(),
    duration,
    rating: type === "group" ? null : rating,
    mainGenres: parseGenres($("editMainGenres").value),
    secondaryGenres: parseGenres(
      $("editSecondaryGenres").value
    ),
    notes: $("editNotes").value
  };

  if (id) {
    updateEntry(type, id, values);
  } else {
    createEntry(type, values);
  }

  closeEditor();
}

/* --------------------------------
   RATINGS
-------------------------------- */

function renderStars() {
  const container = $("starRating");
  const rating = Number($("editRating").value) || 0;

  container.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const button = document.createElement("button");

    button.type = "button";

    button.className =
      "star" + (i <= rating ? " active" : "");

    button.textContent = i <= rating ? "★" : "☆";

    button.setAttribute(
      "aria-label",
      "Rate " + i + " out of 10"
    );

    button.addEventListener("click", () => {
      $("editRating").value = i;
      renderStars();
    });

    container.appendChild(button);
  }
}

/* --------------------------------
   CHILD ENTRIES
-------------------------------- */

function updateChildrenSection() {
  const type = app.editorType;
  const id = app.editorId;

  const section = $("childrenSection");

  const childTypes = {
    group: "production",
    production: "season",
    season: "episode"
  };

  const childType = childTypes[type];

  if (!id || !childType) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");

  const childName = typeNames[childType];

  $("childrenTitle").textContent =
    childName + "s";

  const items = getChildren(type, id);
  const list = $("childrenList");

  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "entry-subtitle";
    empty.textContent = "No entries yet.";
    list.appendChild(empty);
  }

  items.forEach(item => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "child-entry";

    const name = document.createElement("span");
    name.textContent = item.title || "Untitled";

    const arrow = document.createElement("span");
    arrow.textContent = "›";

    button.append(name, arrow);

    button.addEventListener("click", () => {
      openEditor(childType, item.id);
    });

    list.appendChild(button);
  });
}

function addChildFromEditor() {
  const childTypes = {
    group: "production",
    production: "season",
    season: "episode"
  };

  const childType = childTypes[app.editorType];

  if (!childType || !app.editorId) return;

  const parentId = app.editorId;

  openEditor(childType, null, parentId);
}

/* --------------------------------
   DELETION
-------------------------------- */

function deleteCurrentEntry() {
  const type = app.editorType;
  const id = app.editorId;

  if (!type || !id) return;

  let warning = "Delete this entry?";

  if (type === "group") {
    warning =
      "Delete this Group? Its Productions will remain in the Library as independent Productions.";
  }

  if (type === "production") {
    warning =
      "Delete this Production and all its Seasons and Episodes?";
  }

  if (type === "season") {
    warning =
      "Delete this Season and all its Episodes?";
  }

  if (!confirm(warning)) return;

  removeEntry(type, id);

  closeEditor();
}

/* --------------------------------
   LIBRARY
-------------------------------- */

function setupLibrary() {
  $("librarySearch").addEventListener(
    "input", renderLibrary
  );

  $("librarySort").addEventListener(
    "change", renderLibrary
  );

  document.querySelectorAll("[data-filter]").forEach(
    checkbox => {
      checkbox.addEventListener(
        "change", renderLibrary
      );
    }
  );
}

function allLibraryEntries() {
  return [
    ...trackerData.groups,
    ...trackerData.productions,
    ...trackerData.seasons,
    ...trackerData.episodes
  ];
}

function getParentDescription(item) {
  if (!item.parentId) return "";

  const parentType = {
    production: "group",
    season: "production",
    episode: "season"
  }[item.type];

  if (!parentType) return "";

  const parent = findEntry(parentType, item.parentId);

  return parent?.title || "";
}

function effectiveMedium(item) {
  if (item.type === "production") {
    return item.medium || "";
  }

  if (item.type === "season") {
    return findEntry(
      "production",
      item.parentId
    )?.medium || "";
  }

  if (item.type === "episode") {
    const season = findEntry(
      "season",
      item.parentId
    );

    return season
      ? findEntry(
          "production",
          season.parentId
        )?.medium || ""
      : "";
  }

  return "";
}

function effectiveRating(item) {
  if (item.type !== "group") {
    if (item.rating !== null &&
        item.rating !== undefined) {
      return Number(item.rating);
    }
  }

  const children = getChildren(item.type, item.id);

  const ratings = children
    .map(child => effectiveRating(child))
    .filter(value => value !== null);

  if (!ratings.length) return null;

  return ratings.reduce(
    (sum, value) => sum + value, 0
  ) / ratings.length;
}

function releaseSortValue(value) {
  if (!value) return null;

  const year = value.match(/\b(18|19|20|21)\d{2}\b/);

  if (!year) return null;

  const date = Date.parse(value);

  if (Number.isFinite(date)) return date;

  return Number(year[0]) * 31557600000;
}

function renderLibrary() {
  const list = $("libraryItems");

  const search =
    $("librarySearch").value.trim().toLowerCase();

  const sort = $("librarySort").value;

  const visibleTypes = [...document.querySelectorAll(
    "[data-filter]:checked"
  )].map(input => input.dataset.filter);

  let items = allLibraryEntries().filter(item => {
    if (!visibleTypes.includes(item.type)) {
      return false;
    }

    const text = [
      item.title,
      item.medium,
      getParentDescription(item),
      ...(item.mainGenres || []),
      ...(item.secondaryGenres || [])
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  items.sort((a, b) => {
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();

    const ratingA = effectiveRating(a);
    const ratingB = effectiveRating(b);

    const dateA = releaseSortValue(a.release);
    const dateB = releaseSortValue(b.release);

    switch (sort) {
      case "az":
        return titleA.localeCompare(titleB);

      case "za":
        return titleB.localeCompare(titleA);

      case "oldest":
        return a.createdAt - b.createdAt;

      case "medium":
        return effectiveMedium(a).localeCompare(
          effectiveMedium(b)
        ) || titleA.localeCompare(titleB);

      case "ratingHigh":
        return (ratingB ?? -1) - (ratingA ?? -1);

      case "ratingLow":
        return (ratingA ?? 11) - (ratingB ?? 11);

      case "releaseNew":
        return (dateB ?? -Infinity) -
               (dateA ?? -Infinity);

      case "releaseOld":
        return (dateA ?? Infinity) -
               (dateB ?? Infinity);

      default:
        return b.createdAt - a.createdAt;
    }
  });

  $("libraryCount").textContent =
    items.length + (
      items.length === 1 ? " entry" : " entries"
    );

  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");

    empty.className = "empty-state";
    empty.textContent =
      "No entries to display.";

    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const button = document.createElement("button");

    button.className = "library-entry";
    button.type = "button";

    const symbol = document.createElement("span");
    symbol.className = "entry-symbol";
    symbol.textContent = symbols[item.type];

    const info = document.createElement("div");
    info.className = "entry-information";

    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = item.title;

    const subtitle = document.createElement("span");
    subtitle.className = "entry-subtitle";

    const detail = [
      typeNames[item.type],
      effectiveMedium(item),
      item.release,
      getParentDescription(item)
    ].filter(Boolean);

    subtitle.textContent = detail.join(" · ");

    info.append(title, subtitle);

    const rating = document.createElement("span");
    rating.className = "entry-rating";

    const score = effectiveRating(item);

    rating.textContent =
      score === null ? "" : "★ " + score.toFixed(1);

    const arrow = document.createElement("span");
    arrow.className = "entry-chevron";
    arrow.textContent = "›";

    button.append(symbol, info, rating, arrow);

    button.addEventListener("click", () => {
      openEditor(item.type, item.id);
    });

    list.appendChild(button);
  });
}

/* --------------------------------
   WATCHLIST
-------------------------------- */

function setupWatchlist() {
  $("watchlistForm").addEventListener("submit", e => {
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
  });
}

function renderWatchlist() {
  const list = $("watchlistItems");

  list.innerHTML = "";

  if (!trackerData.watchlist.length) {
    const empty = document.createElement("div");

    empty.className = "empty-state";
    empty.textContent =
      "Your watchlist is empty.";

    list.appendChild(empty);
    return;
  }

  trackerData.watchlist.forEach(item => {
    const row = document.createElement("div");
    row.className = "watch-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "watch-check";
    checkbox.setAttribute(
      "aria-label",
      "Move " + item.title + " to Library"
    );

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        completeWatchlistItem(item.id);
      }
    });

    const details = document.createElement("div");
    details.className = "watch-details";

    const title = document.createElement("span");
    title.className = "watch-title";
    title.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "watch-meta";

    meta.textContent = [
      item.medium,
      item.release
    ].filter(Boolean).join(" · ");

    details.append(title, meta);

    const remove = document.createElement("button");
    remove.className = "small-delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove from Watchlist");

    remove.addEventListener("click", () => {
      trackerData.watchlist =
        trackerData.watchlist.filter(
          x => x.id !== item.id
        );

      saveDatabase();
      renderWatchlist();
    });

    row.append(checkbox, details, remove);
    list.appendChild(row);
  });
}

function completeWatchlistItem(id) {
  const item = trackerData.watchlist.find(
    x => x.id === id
  );

  if (!item) return;

  createEntry("production", {
    title: item.title,
    medium: item.medium,
    release: item.release
  });

  trackerData.watchlist =
    trackerData.watchlist.filter(x => x.id !== id);

  saveDatabase();

  renderWatchlist();
  renderLibrary();
}
