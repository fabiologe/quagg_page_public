// Single source of truth: mood name -> Lottie asset path.
// Assets live in /public/saintv1d/tutorial (served as static files, not bundled).
export const RAT_MOODS = {
  happy: '/saintv1d/tutorial/rat_happy.json',
  sad: '/saintv1d/tutorial/rat_sad.json',
  asking: '/saintv1d/tutorial/rat_asking.json',
  // filename has the typo "suprised" in the asset itself — keep it here so
  // this map stays the only place that needs to know the real path.
  surprised: '/saintv1d/tutorial/rat_suprised.json',
  rain: '/saintv1d/tutorial/rat_rain.json',
  kill: '/saintv1d/tutorial/rat_kill.json',
};

// The exported rat_*.json files embed images as base64 "data:" URIs in
// asset.p but leave asset.e (the "is embedded" flag) at 0. lottie-web then
// treats p as a relative filename and prepends the asset path to it,
// producing broken image URLs. Patch the flag after fetching so the
// player treats the data URI as already-embedded, as intended.
function fixEmbeddedAssets(animationData) {
  for (const asset of animationData.assets || []) {
    if (typeof asset.p === 'string' && asset.p.startsWith('data:')) {
      asset.e = 1;
    }
  }
  return animationData;
}

// The files are 0.5–1.2 MB each — fetch every mood at most once per session.
const animationCache = new Map();

export function loadMoodAnimation(mood) {
  const path = RAT_MOODS[mood];
  if (!path) return Promise.reject(new Error(`Unbekannter Tutorial-Mood: ${mood}`));
  if (!animationCache.has(mood)) {
    const promise = fetch(path)
      .then((response) => response.json())
      .then(fixEmbeddedAssets)
      .catch((err) => {
        // Failed fetches must not poison the cache.
        animationCache.delete(mood);
        throw err;
      });
    animationCache.set(mood, promise);
  }
  return animationCache.get(mood);
}
