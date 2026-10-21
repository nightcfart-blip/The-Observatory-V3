
const STORAGE_KEY = "watchTracker_v2";

const MEDIA_TYPES = [
  "Film",
  "TV Series",
  "Anime",
  "Animation",
  "Documentary",
  "Short Film",
  "Web Series",
  "Special",
  "Other"
];

function emptyDatabase() {
  return {
    groups: [],
    productions: [],
    seasons: [],
    episodes: [],
    watchlist: []
  };
}

function loadDatabase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();

    const data = JSON.parse(raw);
    const result = emptyDatabase();

    for (const key of Object.keys(result)) {
      result[key] = Array.isArray(data[key])
        ? data[key]
        : [];
    }

    return result;
  } catch (error) {
    console.error(error);
    return emptyDatabase();
  }
}

let trackerData = loadDatabase();

function saveDatabase() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(trackerData)
    );
    return true;
  } catch (error) {
    console.error(error);
    alert("Unable to save. Browser storage may be full.");
    return false;
  }
}

function createId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) +
    Math.random().toString(36).slice(2);
}

const collectionNames = {
  group: "groups",
  production: "productions",
  season: "seasons",
  episode: "episodes"
};

function getCollection(type) {
  return trackerData[collectionNames[type]] || [];
}

function findEntry(type, id) {
  return getCollection(type).find(x => x.id === id);
}

function createEntry(type, values = {}) {
  const entry = {
    id: createId(),
    type,
    title: "",
    medium: "",
    parentId: "",
    episodeNumber: null,
    release: "",
    duration: null,
    rating: null,
    mainGenres: [],
    secondaryGenres: [],
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...values
  };

  getCollection(type).push(entry);
  saveDatabase();
  return entry;
}

function updateEntry(type, id, values) {
  const entry = findEntry(type, id);
  if (!entry) return null;

  Object.assign(entry, values, {
    updatedAt: Date.now()
  });

  saveDatabase();
  return entry;
}

function getChildren(type, id) {
  const childType = {
    group: "production",
    production: "season",
    season: "episode"
  }[type];

  if (!childType) return [];

  return getCollection(childType).filter(
    x => x.parentId === id
  );
}

function removeEntry(type, id, save = true) {
  if (type === "group") {
    trackerData.productions.forEach(p => {
      if (p.parentId === id) p.parentId = "";
    });
  }

  if (type === "production" || type === "season") {
    getChildren(type, id).slice().forEach(child => {
      removeEntry(child.type, child.id, false);
    });
  }

  const collection = getCollection(type);
  const index = collection.findIndex(x => x.id === id);

  if (index !== -1) collection.splice(index, 1);

  // Images are cleaned separately by the app.
  if (save) saveDatabase();
}

function allEntries() {
  return [
    ...trackerData.groups,
    ...trackerData.productions,
    ...trackerData.seasons,
    ...trackerData.episodes
  ];
}

function parentTypeOf(type) {
  return {
    production: "group",
    season: "production",
    episode: "season"
  }[type] || null;
}

function effectiveMedium(item) {
  if (!item) return "";

  if (item.type === "production") {
    return item.medium || "";
  }

  const parentType = parentTypeOf(item.type);
  if (!parentType || !item.parentId) return "";

  return effectiveMedium(
    findEntry(parentType, item.parentId)
  );
}

// Direct ratings take precedence.
// Otherwise the rating is the average of rated children.
// Groups cannot have a direct rating.

function effectiveRating(item) {
  if (!item) return null;

  if (item.type !== "group" &&
      item.rating !== null &&
      item.rating !== undefined &&
      item.rating !== "") {
    const direct = Number(item.rating);
    if (Number.isFinite(direct)) return direct;
  }

  const childRatings = getChildren(item.type, item.id)
    .map(effectiveRating)
    .filter(x => x !== null);

  if (!childRatings.length) return null;

  return childRatings.reduce((a,b) => a+b,0) /
    childRatings.length;
}

// IndexedDB image storage.

const imageDatabasePromise = new Promise(resolve => {
  if (!("indexedDB" in window)) {
    resolve(null);
    return;
  }

  const request = indexedDB.open(
    "watchTrackerImages", 1
  );

  request.onupgradeneeded = () => {
    const database = request.result;

    if (!database.objectStoreNames.contains("images")) {
      database.createObjectStore("images");
    }
  };

  request.onsuccess = () => resolve(request.result);

  request.onerror = () => {
    console.error("Image database failed", request.error);
    resolve(null);
  };
});

async function imageTransaction(key, mode, value) {
  const db = await imageDatabasePromise;

  if (!db) {
    if (mode === "readonly") return null;
    throw new Error("Image storage unavailable");
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("images", mode);
    const store = transaction.objectStore("images");

    let request;

    if (mode === "readonly") {
      request = store.get(key);
    } else if (value === null) {
      request = store.delete(key);
    } else {
      request = store.put(value, key);
    }

    request.onsuccess = () => {
      resolve(mode === "readonly"
        ? request.result || null
        : true);
    };

    request.onerror = () => reject(request.error);
  });
}

function imageKey(type, id) {
  return type + ":" + id;
}

async function saveImage(type, id, blob) {
  return imageTransaction(
    imageKey(type, id), "readwrite", blob
  );
}

async function loadImage(type, id) {
  return imageTransaction(
    imageKey(type, id), "readonly"
  );
}

async function deleteImage(type, id) {
  return imageTransaction(
    imageKey(type, id), "readwrite", null
  );
}

// Cached URLs are revoked when no longer needed.

const imageURLs = new Map();

async function getImageURL(type, id) {
  const key = imageKey(type, id);

  if (imageURLs.has(key)) {
    return imageURLs.get(key);
  }

  const blob = await loadImage(type, id);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  imageURLs.set(key, url);
  return url;
}

function invalidateImageURL(type, id) {
  const key = imageKey(type, id);
  const url = imageURLs.get(key);

  if (url) URL.revokeObjectURL(url);
  imageURLs.delete(key);
}

// Release dates can be custom text.
// Chronological sorting works when a year is present.

function releaseTimestamp(value) {
  if (!value) return null;

  const year = String(value).match(
    /\b(?:18|19|20|21)\d{2}\b/
  );

  if (!year) return null;

  const exact = Date.parse(value);

  if (Number.isFinite(exact)) return exact;

  return new Date(Number(year[0]), 0, 1).getTime();
}

function genreList(entry) {
  return [
    ...(entry.mainGenres || []),
    ...(entry.secondaryGenres || [])
  ].map(s => String(s).trim()).filter(Boolean);
}
