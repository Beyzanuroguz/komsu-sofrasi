import { availableSlots, categories, closedStatuses, units, validQuantity } from "../public/rules.js";

import { readTestActor, seedTestKitchen, signIntoTest, signOutOfTest, testKitchen } from "./test-access.js";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const uid = () => crypto.randomUUID();
const validId = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const clean = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const json = (body, status = 200) => Response.json(body, {status, headers:{"Cache-Control":"no-store"}});
const rowList = async statement => (await statement.all()).results;
const placeholders = values => values.map(() => "?").join(",");
const protectedTransitions = {
  "Onay bekliyor": ["Onaylandı", "Reddedildi"],
  "Onaylandı": ["Hazırlanıyor"],
  "Hazırlanıyor": ["Teslime hazır"],
  "Teslime hazır": ["Tamamlandı"],
};

function identity(request) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let name = request.headers.get("oai-authenticated-user-full-name");
  if (name && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(name); } catch { name = null; }
  }
  return {id, name:clean(name, 70) || clean(email.split("@")[0], 70) || "Müşteri"};
}

async function readBody(request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    fail(403, "Bu işlem için uygulamayı kendi bağlantısından aç.");
  }
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") fail(415, "Geçersiz istek.");
  if (Number(request.headers.get("Content-Length")) > 600000) fail(413, "Fotoğraf çok büyük.");
  try {
    const stream = request.body?.getReader();
    if (!stream) fail(400, "Geçersiz istek.");
    let length = 0;
    let content = "";
    const decoder = new TextDecoder();
    for (;;) {
      const {done, value} = await stream.read();
      if (done) break;
      length += value.length;
      if (length > 600000) {
        await stream.cancel();
        fail(413, "Fotoğraf çok büyük.");
      }
      content += decoder.decode(value, {stream:true});
    }
    content += decoder.decode();
    const body = JSON.parse(content);
    if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Geçersiz istek.");
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "Geçersiz istek.");
  }
}

async function kitchenFor(db, actor) {
  return actor ? db.prepare("SELECT id, name FROM kitchens WHERE owner_id = ?").bind(actor.id).first() : null;
}

const staticPhotos = {"test-baklava":"/test-media/baklava.jpg","test-manti":"/test-media/manti.jpg","test-sarma":"/test-media/sarma.jpg"};
const photoPath = key => key ? staticPhotos[key] ?? "/photos/" + key : "";

function productView(p) {
  return {
    id:p.id, sellerId:p.kitchen_id, maker:p.maker, name:p.name, category:p.category,
    price:p.price_cents / 100, stock:p.stock, unit:p.unit, details:p.details,
    district:p.district, neighborhood:p.neighborhood, revision:p.revision,
    point:p.latitude == null ? null : {lat:p.latitude, lng:p.longitude},
    photo:photoPath(p.photo_key), active:Boolean(p.is_active),
  };
}

async function marketplace(db, actor, testAvailable) {
  const [kitchen, products, orders] = await Promise.all([
    kitchenFor(db, actor),
    rowList(db.prepare(`SELECT p.*, k.name maker FROM products p JOIN kitchens k ON k.id=p.kitchen_id
      WHERE p.is_active=1 AND (p.kitchen_id = ?) = ? ORDER BY p.created_at DESC, p.id`).bind(testKitchen, actor?.test ? 1 : 0)),
    actor ? rowList(db.prepare(`SELECT o.*, k.name maker, k.pickup_note, k.owner_id
      FROM orders o JOIN kitchens k ON k.id=o.kitchen_id
      WHERE o.customer_id=? OR k.owner_id=? ORDER BY o.created_at DESC, o.id`).bind(actor.id, actor.id)) : [],
  ]);
  const sellerProducts = kitchen ? await rowList(db.prepare(`SELECT p.*, k.name maker
    FROM products p JOIN kitchens k ON k.id=p.kitchen_id WHERE p.kitchen_id=? ORDER BY p.created_at DESC, p.id`)
    .bind(kitchen.id)) : [];
  const items = new Map();
  if (orders.length) {
    const rows = await rowList(db.prepare(`SELECT i.* FROM order_items i JOIN orders o ON o.id=i.order_id
      JOIN kitchens k ON k.id=o.kitchen_id WHERE o.customer_id=? OR k.owner_id=?`).bind(actor.id, actor.id));
    for (const item of rows) {
      if (!items.has(item.order_id)) items.set(item.order_id, []);
      items.get(item.order_id).push({id:item.product_id, name:item.name, qty:item.qty, unit:item.unit});
    }
  }
  const orderView = (o, seller) => ({
    id:o.id, sellerId:o.kitchen_id, maker:o.maker, customer:seller ? o.customer_name : undefined,
    contact:seller ? o.contact : undefined, address:o.address,
    pickupNote:!seller && o.handoff === "Elden teslim" && !["Onay bekliyor","İptal","Reddedildi"].includes(o.status)
      ? o.pickup_note : undefined,
    deliveryDate:o.delivery_date, deliverySlot:o.delivery_slot, handoff:o.handoff, status:o.status,
    paymentMethod:"cash-on-delivery", total:o.total_cents, items:items.get(o.id) ?? [],
  });
  return {
    account:actor ? {name:actor.name, kitchen, test:actor.test ?? null} : null,
    products:products.map(productView),
    sellerProducts:sellerProducts.map(productView),
    testAvailable,
    customerOrders:orders.filter(o => o.customer_id === actor.id).map(o => orderView(o, false)),
    sellerOrders:orders.filter(o => o.owner_id === actor.id).map(o => orderView(o, true)),
  };
}

async function createKitchen(db, actor, body) {
  const name = clean(body.name, 65), pickupNote = clean(body.pickupNote, 240);
  if (name.length < 2 || !pickupNote) fail(400, "Mutfak adını ve elden teslim bilgisini gir.");
  await db.prepare("INSERT INTO kitchens (id,owner_id,name,pickup_note) VALUES (?,?,?,?) ON CONFLICT(owner_id) DO NOTHING")
    .bind(uid(), actor.id, name, pickupNote).run();
  return json({ok:true});
}

function coordinates(point) {
  if (point == null) return [null, null];
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
    fail(400, "Teslim konumu geçersiz.");
  }
  return [Math.round(point.lat * 100) / 100, Math.round(point.lng * 100) / 100];
}

async function saveProduct(env, actor, body) {
  const db = env.DB;
  const kitchen = await kitchenFor(db, actor);
  if (!kitchen) fail(403, "Önce mutfağını aç.");
  if (body.id && !validId(body.id)) fail(400, "Ürün geçersiz.");
  const product = body.id
    ? await db.prepare("SELECT * FROM products WHERE id=? AND kitchen_id=?").bind(body.id, kitchen.id).first() : null;
  if (body.id && !product) fail(404, "Ürün bulunamadı.");
  if (product && (body.revision !== product.revision || !Number.isFinite(body.originalStock))) fail(409, "Ürün değişti. Paneli yenileyip tekrar dene.");
  const name = clean(body.name, 70), details = clean(body.details, 240);
  const district = clean(body.district, 55), neighborhood = clean(body.neighborhood, 55);
  const {unit, category, stock} = body;
  const price = Math.round(body.price * 100);
  if (!name || !details || !categories.includes(category) || !units.includes(unit) ||
      !Number.isFinite(body.price) || price < 100 || price > 10000000 ||
      !validQuantity(stock, {unit}) || stock < 0 || stock > 9999) fail(400, "Ürün, fiyat ve stok bilgilerini kontrol et.");
  const [latitude, longitude] = coordinates(body.point);
  let photoKey = null, newPhoto = null;
  if (product?.photo_key && body.photo === photoPath(product.photo_key)) {
    photoKey = product.photo_key;
  } else if (body.photo) {
    if (typeof body.photo !== "string" || body.photo.length > 400000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) {
      fail(400, "Fotoğrafı yeniden seç. Daha küçük bir JPEG deneyebilirsin.");
    }
    let bytes;
    try { bytes = Uint8Array.from(atob(body.photo.slice(23)), char => char.charCodeAt(0)); }
    catch { fail(400, "Fotoğraf okunamadı."); }
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) fail(400, "Fotoğraf biçimi geçersiz.");
    newPhoto = uid() + ".jpg";
    await env.BUCKET.put(newPhoto, bytes, {httpMetadata:{contentType:"image/jpeg"}});
    photoKey = newPhoto;
  }
  const revision = uid();
  const values = [name, category, price, stock, unit, details, district, neighborhood, latitude, longitude, photoKey, revision];
  try {
    const result = product
      ? await db.prepare(`UPDATE products SET name=?,category=?,price_cents=?,stock=?,unit=?,details=?,district=?,
          neighborhood=?,latitude=?,longitude=?,photo_key=?,revision=? WHERE id=? AND kitchen_id=? AND revision=? AND stock=?`)
        .bind(...values, product.id, kitchen.id, product.revision, body.originalStock).run()
      : await db.prepare(`INSERT INTO products (id,kitchen_id,name,category,price_cents,stock,unit,details,district,
          neighborhood,latitude,longitude,photo_key,revision,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .bind(uid(), kitchen.id, ...values).run();
    if (!result.meta.changes) fail(409, "Ürün veya stok değişti. Paneli yenileyip tekrar dene.");
  } catch (error) {
    if (newPhoto) await env.BUCKET.delete(newPhoto).catch(() => {});
    if (String(error.message).includes("reserved_unit")) fail(409, "Onay bekleyen sipariş varken birim değiştirilemez.");
    throw error;
  }
  if (product?.photo_key && !staticPhotos[product.photo_key] && product.photo_key !== photoKey) await env.BUCKET.delete(product.photo_key).catch(() => {});
  return json({ok:true});
}

async function setListingVisibility(db, actor, body) {
  if (!validId(body.id) || typeof body.active !== "boolean") fail(400, "Ürün bilgisi geçersiz.");
  const result = await db.prepare(`UPDATE products SET is_active=?,revision=? WHERE id=? AND kitchen_id IN
    (SELECT id FROM kitchens WHERE owner_id=?)`).bind(body.active ? 1 : 0, uid(), body.id, actor.id).run();
  if (!result.meta.changes) fail(404, "Ürün bulunamadı.");
  return json({ok:true});
}

async function placeOrder(db, actor, body) {
  const {requestId, deliveryDate, deliverySlot, handoff, items} = body;
  if (!validId(requestId)) fail(400, "Geçersiz sipariş isteği.");
  const previous = await db.prepare("SELECT customer_id FROM checkouts WHERE id=?").bind(requestId).first();
  if (previous?.customer_id === actor.id) return json({ok:true});
  if (previous) fail(409, "Siparişi tekrar dene.");
  if (!availableSlots(deliveryDate).includes(deliverySlot)) fail(400, "Geçerli bir teslim tarihi ve saat aralığı seç.");
  if (!["Elden teslim", "Teslimat talebi"].includes(handoff)) fail(400, "Teslim şeklini seç.");
  const customerName = actor.test ? actor.name : clean(body.customerName, 70);
  const contact = actor.test ? "0555 000 00 00" : clean(body.contact, 26);
  const address = handoff === "Teslimat talebi"
    ? actor.test ? "Test teslimat adresi · Fiziksel teslimat yapılmaz." : clean(body.address, 240) : "";
  const digits = contact.replace(/\D/g, "");
  if (!customerName || !/^[+\d ()-]+$/.test(contact) || digits.length < 10 || digits.length > 15 ||
      (handoff === "Teslimat talebi" && address.length < 8)) fail(400, "Ad, telefon ve teslim bilgilerini kontrol et.");
  if (!Array.isArray(items) || !items.length || items.length > 30 || items.some(item => !validId(item?.id))) {
    fail(400, "Sepete en fazla 30 farklı ürün ekleyebilirsin.");
  }
  const ids = items.map(item => item.id);
  if (new Set(ids).size !== items.length) fail(400, "Sepetini yenileyip tekrar dene.");
  const products = await rowList(db.prepare(`SELECT p.*, k.owner_id FROM products p JOIN kitchens k ON k.id=p.kitchen_id
    WHERE p.id IN (${placeholders(ids)})`).bind(...ids));
  const byId = new Map(products.map(p => [p.id, p]));
  const groups = new Map();
  for (const item of items) {
    const product = byId.get(item.id);
    if (!product?.is_active || (product.kitchen_id === testKitchen) !== Boolean(actor.test) || product.revision !== item.revision || product.stock < item.qty) fail(409, "Bir ürünün fiyatı, birimi veya stoğu değişti. Sepeti kontrol et.");
    if (!validQuantity(item.qty, product) || item.qty <= 0) fail(400, "Sepetindeki miktarları kontrol et.");
    if (product.owner_id === actor.id) fail(400, "Kendi mutfağından sipariş veremezsin.");
    if (!groups.has(product.kitchen_id)) groups.set(product.kitchen_id, []);
    groups.get(product.kitchen_id).push({product, qty:item.qty});
  }
  const batch = [db.prepare("INSERT INTO checkouts (id,customer_id) VALUES (?,?)").bind(requestId, actor.id)];
  for (const [kitchenId, entries] of groups) {
    const orderId = uid();
    const total = entries.reduce((sum, {product, qty}) => sum + Math.round(product.price_cents * qty), 0);
    batch.push(db.prepare(`INSERT INTO orders (id,kitchen_id,customer_id,customer_name,contact,delivery_date,
      delivery_slot,handoff,address,total_cents) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(orderId, kitchenId, actor.id, customerName, contact, deliveryDate, deliverySlot, handoff, address, total));
    for (const {product, qty} of entries) {
      batch.push(db.prepare(`INSERT INTO order_items (order_id,product_id,product_revision,name,unit,price_cents,qty)
        VALUES (?,?,?,?,?,?,?)`).bind(orderId, product.id, product.revision, product.name, product.unit, product.price_cents, qty));
    }
  }
  try { await db.batch(batch); }
  catch (error) {
    const retry = await db.prepare("SELECT customer_id FROM checkouts WHERE id=?").bind(requestId).first();
    if (retry?.customer_id === actor.id) return json({ok:true});
    if (String(error.message).includes("stock_or_product_changed")) fail(409, "Stok değişti. Sepetini kontrol et.");
    throw error;
  }
  return json({ok:true});
}

async function changeOrder(db, actor, body) {
  if (!validId(body.id)) fail(400, "Sipariş geçersiz.");
  const order = await db.prepare(`SELECT o.status, o.customer_id, k.owner_id FROM orders o
    JOIN kitchens k ON k.id=o.kitchen_id WHERE o.id=? AND (o.customer_id=? OR k.owner_id=?)`)
    .bind(body.id, actor.id, actor.id).first();
  if (!order) fail(404, "Sipariş bulunamadı.");
  const seller = order.owner_id === actor.id;
  const allowed = seller ? protectedTransitions[order.status]?.includes(body.status) :
    order.status === "Onay bekliyor" && body.status === "İptal";
  if (!allowed || closedStatuses.includes(order.status)) fail(409, "Bu sipariş durumu artık değiştirilemez.");
  const result = await db.prepare("UPDATE orders SET status=? WHERE id=? AND status=?")
    .bind(body.status, body.id, order.status).run();
  if (!result.meta.changes) fail(409, "Sipariş durumu değişti. Sayfayı yenile.");
  return json({ok:true});
}

async function servePhoto(env, path, actor, allowTest) {
  const name = path.slice("/photos/".length);
  if (!/^[a-f0-9-]{36}\.jpg$/.test(name)) fail(404, "Fotoğraf bulunamadı.");
  const product = await env.DB.prepare(`SELECT p.is_active, p.kitchen_id, k.owner_id FROM products p
    JOIN kitchens k ON k.id=p.kitchen_id WHERE p.photo_key=?`).bind(name).first();
  if (!product || (product.kitchen_id === testKitchen && !allowTest) ||
      (!product.is_active && product.owner_id !== actor?.id && !(allowTest && product.kitchen_id === testKitchen))) {
    fail(404, "Fotoğraf bulunamadı.");
  }
  const photo = await env.BUCKET.get(name);
  if (!photo) fail(404, "Fotoğraf bulunamadı.");
  return new Response(photo.body, {headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=3600","X-Content-Type-Options":"nosniff"}});
}

function respondCookie(cookie) {
  const response = json({ok:true});
  response.headers.set("Set-Cookie", cookie);
  return response;
}

export default {
  async fetch(request, env) {
    let path = new URL(request.url).pathname;
    try {
      let actor = identity(request);
      const visitorEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
      const allowTest = Boolean(actor && env.TEST_OWNER_EMAIL && visitorEmail === env.TEST_OWNER_EMAIL);
      const test = /^\/test\/(musteri|uretici)(\/.*)?$/.exec(path);
      if (test) {
        if (!allowTest) fail(404, "Sayfa bulunamadı.");
        const role = test[1];
        path = test[2] || "/";
        if (!test[2] && request.method === "GET") return Response.redirect(new URL(request.url).origin + "/test/" + role + "/", 302);
        if (request.method === "POST" && path === "/api/login") {
          const cookie = await signIntoTest(env, actor, role, await readBody(request));
          if (!cookie) fail(401, "Kullanıcı adı veya şifre hatalı.");
          await seedTestKitchen(env.DB);
          return respondCookie(cookie);
        }
        if (request.method === "POST" && path === "/api/logout") {
          await readBody(request);
          return respondCookie(signOutOfTest(role));
        }
        actor = await readTestActor(env, actor, role, request.headers.get("Cookie"));
        if (path === "/api/shop" && request.method === "GET" && !actor) {
          return json({account:null,products:[],sellerProducts:[],customerOrders:[],sellerOrders:[],testAvailable:true});
        }
        if (path.startsWith("/api/") && request.method === "POST" && actor) {
          const permitted = role === "musteri"
            ? ["/api/order", "/api/order-status"] : ["/api/product", "/api/product-visibility", "/api/order-status"];
          if (!permitted.includes(path)) fail(403, "Bu işlem hesabının rolüne açık değil.");
        }
      }
      if (request.method === "GET" && path.startsWith("/photos/")) return await servePhoto(env, path, actor, allowTest);
      if (request.method === "GET" && path === "/api/shop") return json(await marketplace(env.DB, actor, allowTest));
      if (path.startsWith("/api/") && request.method === "POST") {
        if (!actor) fail(401, "Devam etmek için giriş yap.");
        const body = await readBody(request);
        if (path === "/api/kitchen") return await createKitchen(env.DB, actor, body);
        if (path === "/api/product") return await saveProduct(env, actor, body);
        if (path === "/api/product-visibility") return await setListingVisibility(env.DB, actor, body);
        if (path === "/api/order") return await placeOrder(env.DB, actor, body);
        if (path === "/api/order-status") return await changeOrder(env.DB, actor, body);
      }
      if (request.method !== "GET" || !Object.hasOwn(assets, path)) fail(404, "Sayfa bulunamadı.");
      const [type, value] = assets[path];
      const image = type === "image/jpeg";
      const content = image ? Uint8Array.from(atob(value), char => char.charCodeAt(0)) : value;
      return new Response(content, {headers:{
        "Content-Type":type, "X-Content-Type-Options":"nosniff", "Cache-Control":image ? "public, max-age=86400" : "no-cache",
        "Content-Security-Policy":"default-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
      }});
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error.message);
      return json({error:error instanceof HttpError ? error.message : "İşlem tamamlanamadı. Biraz sonra tekrar dene."}, error.status || 500);
    }
  },
};
