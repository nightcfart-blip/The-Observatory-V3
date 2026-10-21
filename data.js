
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
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return emptyDatabase();
    }

    const parsed = JSON.parse(saved);
    const defaults = emptyDatabase();

    for (const key of Object.keys(defaults)) {
      if (!Array.isArray(parsed[key])) {
        parsed[key] = [];
      }
    }

    return parsed;

  } catch (error) {
    console.error("Could not load data:", error);
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
    console.error("Could not save data:", error);
    alert("Storage failed. Your changes may not be saved.");
    return false;
  }
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function getCollection(type) {
  const names = {
    group: "groups",
    production: "productions",
    season: "seasons",
    episode: "episodes"
  };

  return trackerData[names[type]] || [];
}

function findEntry(type, id) {
  return getCollection(type).find(
    item => item.id === id
  );
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

function removeEntry(type, id) {
  // Remove descendants first.
  if (type === "group") {
    // Productions survive, but become independent.
    trackerData.productions.forEach(p => {
      if (p.parentId === id) {
        p.parentId = "";
      }
    });
  }

  if (type === "production") {
    const children = trackerData.seasons
      .filter(s => s.parentId === id);

    children.forEach(s => removeEntry("season", s.id));
  }

  if (type === "season") {
    const children = trackerData.episodes
      .filter(e => e.parentId === id);

    children.forEach(e => removeEntry("episode", e.id));
  }

  const collection = getCollection(type);
  const index = collection.findIndex(e => e.id === id);

  if (index !== -1) {
    collection.splice(index, 1);
  }

  saveDatabase();
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
