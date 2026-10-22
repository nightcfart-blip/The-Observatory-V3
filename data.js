
"use strict";

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

const COLLECTION_NAMES = {
  group: "groups",
  production: "productions",
  season: "seasons",
  episode: "episodes"
};

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
    console.error("Database load failed:", error);
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
    console.error("Save failed:", error);
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

function getCollection(type) {
  return trackerData[COLLECTION_NAMES[type]] || [];
}

function findEntry(type, id) {
  return getCollection(type).find(item => item.id === id);
}

function createEntry(type, values = {}) {
  if (!COLLECTION_NAMES[type]) return null;

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
    item => item.parentId === id
  );
}

function removeEntry(type, id, save = true) {
  if (type === "group") {
    // Productions remain in the Library.
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

  if (index >= 0) collection.splice(index, 1);

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

/* ==========================================
   RATINGS
========================================== */

/*
  Group:
    Average of rated Productions.

  Production:
    If no Seasons: manual rating.
    If Seasons exist: average of rated Seasons.
    An old manual rating is ignored when Seasons exist.

  Season:
    Average of rated Episodes.
    Old manual Season ratings are ignored.

  Episode:
    Manual rating, 0 to 10 in half-star steps.

  Unrated children don't count toward averages.
*/

function validManualRating(value) {
  if (value === null ||
      value === undefined ||
      value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number) ||
      number < 0 || number > 10) {
    return null;
  }

  return number;
}

function averageRatings(children) {
  const ratings = children
    .map(effectiveRating)
    .filter(value => value !== null);

  if (!ratings.length) return null;

  return ratings.reduce((sum, value) =>
    sum + value, 0) / ratings.length;
}

function effectiveRating(item) {
  if (!item) return null;

  switch (item.type) {
    case "episode":
      return validManualRating(item.rating);

    case "season":
      return averageRatings(
        getChildren("season", item.id)
      );

    case "production": {
      const seasons = getChildren(
        "production", item.id
      );

      if (seasons.length > 0) {
        return averageRatings(seasons);
      }

      return validManualRating(item.rating);
    }

    case "group":
      return averageRatings(
        getChildren("group", item.id)
      );

    default:
      return null;
  }
}

function canRateManually(type, id = null) {
  if (type === "episode") return true;

  if (type === "production") {
    if (!id) return true;

    return getChildren("production", id).length === 0;
  }

  return false;
}

function normalizeHalfRating(value) {
  if (value === null ||
      value === undefined ||
      value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  return Math.max(0, Math.min(10,
    Math.round(number * 2) / 2
  ));
}

/* ==========================================
   GENRES
========================================== */

/*
  Productions: manually entered.

  Seasons: inherit the Production's genres.

  Groups: combine the genres of all Productions.

  Episodes: no genres.
*/

function cleanGenreArray(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const result = [];

  value.forEach(item => {
    const genre = String(item).trim();
    const key = genre.toLowerCase();

    if (!genre || seen.has(key)) return;

    seen.add(key);
    result.push(genre);
  });

  return result;
}

function mergeGenres(collection, key) {
  const result = [];
  const seen = new Set();

  collection.forEach(item => {
    cleanGenreArray(item[key]).forEach(genre => {
      const normalized = genre.toLowerCase();

      if (seen.has(normalized)) return;

      seen.add(normalized);
      result.push(genre);
    });
  });

  return result;
}

function effectiveGenres(item) {
  const empty = {
    mainGenres: [],
    secondaryGenres: []
  };

  if (!item) return empty;

  if (item.type === "episode") {
    return empty;
  }

  if (item.type === "production") {
    return {
      mainGenres: cleanGenreArray(item.mainGenres),
      secondaryGenres: cleanGenreArray(
        item.secondaryGenres
      )
    };
  }

  if (item.type === "season") {
    const production = findEntry(
      "production",
      item.parentId
    );

    return effectiveGenres(production);
  }

  if (item.type === "group") {
    const productions = getChildren(
      "group", item.id
    );

    const inherited = productions.map(
      effectiveGenres
    );

    const main = mergeGenres(
      inherited, "mainGenres"
    );

    const secondary = mergeGenres(
      inherited, "secondaryGenres"
    ).filter(genre =>
      !main.some(g =>
        g.toLowerCase() === genre.toLowerCase()
      )
    );

    return {
      mainGenres: main,
      secondaryGenres: secondary
    };
  }

  return empty;
}

function genreList(item) {
  const genres = effectiveGenres(item);

  return [
    ...genres.mainGenres,
    ...genres.secondaryGenres
  ];
}

/* ==========================================
   RELEASE DATES
========================================== */

function releaseTimestamp(value) {
  if (!value) return null;

  const match = String(value).match(
    /\b(?:18|19|20|21)\d{2}\b/
  );

  if (!match) return null;

  const exact = Date.parse(value);

  if (Number.isFinite(exact)) return exact;

  return new Date(
    Number(match[0]), 0, 1
  ).getTime();
}

/* ==========================================
   BANNER STORAGE
========================================== */

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

  request.onsuccess = () =>
    resolve(request.result);

  request.onerror = () => {
    console.error(request.error);
    resolve(null);
  };
});

async function imageTransaction(key, mode, value) {
  const db = await imageDatabasePromise;

  if (!db) {
    if (mode === "readonly") return null;
    throw new Error("IndexedDB unavailable");
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      "images", mode
    );

    const store = transaction.objectStore("images");
    let request;

    if (mode === "readonly") {
      request = store.get(key);
    } else if (value === null) {
      request = store.delete(key);
    } else {
      request = store.put(value, key);
    }

    request.onsuccess = () => resolve(
      mode === "readonly"
        ? request.result || null
        : true
    );

    request.onerror = () =>
      reject(request.error);
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
