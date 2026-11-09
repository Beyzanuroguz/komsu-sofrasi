export const testKitchen = "55e90742-7aa8-451e-90d2-bb31167a7f33";
export const testActors = {
  musteri:{id:"komsu-test:customer", name:"Deniz (Test)", username:"musteri", test:"musteri"},
  uretici:{id:"komsu-test:seller", name:"Fatma (Test)", username:"uretici", test:"uretici"},
};
const encoder = new TextEncoder();
const sessionLifetime = 8 * 60 * 60;
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
function equalHex(first, second) {
  if (typeof first !== "string" || typeof second !== "string" || first.length !== second.length) return false;
  let diff = 0;
  for (let i = 0; i < first.length; i++) diff |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return diff === 0;
}

function configOf(env) {
  try {
    const config = JSON.parse(env.TEST_CREDENTIALS);
    if (/^[a-f0-9]{64}$/.test(config.key) && Object.keys(testActors).every(role => /^[a-f0-9]{64}$/.test(config.hashes?.[role]))) return config;
  } catch {}
  return null;
}

function testCookie(role, value, ttl) {
  return `ks_test_${role}=${value}; Path=/test/${role}/; Max-Age=${ttl}; Secure; HttpOnly; SameSite=Strict`;
}

async function proof(config, visitor, role, expiry) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(config.key), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify([visitor.id, role, expiry]))));
}

export async function signIntoTest(env, visitor, role, body) {
  const config = configOf(env);
  if (!visitor || !config || typeof body.password !== "string" || body.password.length > 120) return null;
  const digest = hex(await crypto.subtle.digest("SHA-256", encoder.encode(body.password)));
  if (!equalHex(digest, config.hashes[role]) || body.username !== testActors[role].username) return null;
  const expiry = Math.floor(Date.now() / 1000) + sessionLifetime;
  const token = expiry + "." + await proof(config, visitor, role, expiry);
  return testCookie(role, token, sessionLifetime);
}

export async function readTestActor(env, visitor, role, header) {
  const config = configOf(env);
  if (!visitor || !config || !header) return null;
  const prefix = `ks_test_${role}=`;
  const token = header.split(";").map(item => item.trim()).find(item => item.startsWith(prefix))?.slice(prefix.length);
  const match = /^(\d{1,12})\.([a-f0-9]{64})$/.exec(token ?? "");
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return null;
  return equalHex(match[2], await proof(config, visitor, role, Number(match[1]))) ? testActors[role] : null;
}

export const signOutOfTest = role => testCookie(role, "", 0);

const testProducts = [
  ["55e90742-7aa8-451e-90d2-bb31167a7f34", "Fıstıklı ev baklavası", "Tatlı", 78000, 10, "kg",
    "İnce yufka, tereyağı ve Antep fıstığı. Gluten, süt ve fıstık içerir.", "test-baklava"],
  ["55e90742-7aa8-451e-90d2-bb31167a7f35", "Kayseri mantısı", "Ana yemek", 23000, 15, "porsiyon",
    "Sarımsaklı yoğurt ve biberli tereyağı ile. Gluten ve süt içerir.", "test-manti"],
  ["55e90742-7aa8-451e-90d2-bb31167a7f36", "Zeytinyağlı yaprak sarma", "Meze", 19500, 12, "paket",
    "Bir pakette 12 adet. Limonla servis edilir.", "test-sarma"],
];

export async function seedTestKitchen(db) {
  const batch = [
    db.prepare("INSERT OR IGNORE INTO kitchens (id,owner_id,name,pickup_note) VALUES (?,?,?,?)")
      .bind(testKitchen, testActors.uretici.id, "Fatma’nın Mutfağı", "Test teslim noktası · Fiziksel teslimat yapılmaz."),
    ...testProducts.map(([id,name,category,price,stock,unit,details,photo]) =>
      db.prepare(`INSERT OR IGNORE INTO products (id,kitchen_id,name,category,price_cents,stock,unit,details,
        district,neighborhood,latitude,longitude,photo_key,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,testKitchen,name,category,price,stock,unit,details,"Kadıköy","Moda",40.98,29.03,photo,crypto.randomUUID())),
  ];
  await db.batch(batch);
}
