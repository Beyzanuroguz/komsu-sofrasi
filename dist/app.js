"use strict";

const byId = id => document.getElementById(id);
const categories = ["Ana yemek", "Hamur işi", "Tatlı", "Meze"];
const icon = {"Ana yemek":"🍲","Hamur işi":"🥟","Tatlı":"🍰","Meze":"🫒"};
const accounts = [
  {id:"deniz", name:"Deniz", role:"customer"},
  {id:"ayse", name:"Ayşe'nin Mutfağı", role:"seller"},
  {id:"zeynep", name:"Zeynep'in Fırını", role:"seller"},
  {id:"fatma", name:"Fatma'nın Tatlıları", role:"seller"},
];
const customerAccount = accounts[0];
const sellerId = maker => accounts.find(account => account.role === "seller" && account.name === maker)?.id ?? "ayse";
const ownerOf = item => item.sellerId ?? sellerId(item.maker);
const buyerOf = order => order.customerId ?? customerAccount.id;
const slots = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
const slotLabel = slot => `${slot}–${String(Number(slot.slice(0, 2)) + 2).padStart(2, "0")}:00`;
const orderActions = {
  "Onay bekliyor": [
    {next:"Onaylandı", label:"Onayla", kind:"button"},
    {next:"Reddedildi", label:"Reddet", kind:"pill reject"},
  ],
  "Onaylandı": [{next:"Hazırlanıyor", label:"Hazırlamaya başla", kind:"button"}],
  "Hazırlanıyor": [{next:"Teslime hazır", label:"Teslime hazır", kind:"button"}],
  "Teslime hazır": [{next:"Tamamlandı", label:"Teslim edildi ve nakit alındı", kind:"button"}],
};
const scheduleDate = new Intl.DateTimeFormat("tr-TR", {dateStyle:"long", timeZone:"UTC"});
const demoAreas = [
  {district:"Kadıköy", neighborhood:"Moda", point:{lat:40.9811, lng:29.0267}},
  {district:"Üsküdar", neighborhood:"Kuzguncuk", point:{lat:41.0372, lng:29.0304}},
  {district:"Beşiktaş", neighborhood:"Abbasağa", point:{lat:41.0471, lng:29.0046}},
];
const seeds = [
  ["Kayseri mantısı", "Ayşe'nin Mutfağı", "Ana yemek", 230, 12, "Yoğurt ve biber sosuyla, 1 porsiyon. Gluten ve süt içerir.", "🥣"],
  ["Ispanaklı kol böreği", "Zeynep'in Fırını", "Hamur işi", 180, 8, "El açması, 4 dilim. Gluten, süt ve yumurta içerir.", "🥟"],
  ["Fıstıklı ev baklavası", "Fatma'nın Tatlıları", "Tatlı", 260, 10, "İnce yufka ve Antep fıstığı, 6 dilim. Gluten, süt ve fıstık içerir.", "🍯"],
  ["Zeytinyağlı yaprak sarma", "Ayşe'nin Mutfağı", "Meze", 195, 9, "Limonlu ve bol yeşillikli, 12 adet.", "🫒"],
  ["Fırın sütlaç", "Fatma'nın Tatlıları", "Tatlı", 95, 16, "Üzeri kızarmış, 1 kâse. Süt içerir.", "🍮"],
  ["Ev usulü kuru fasulye", "Zeynep'in Fırını", "Ana yemek", 165, 8, "Pilavla servis edilir, 1 porsiyon.", "🍛"],
].map(([name, maker, category, price, stock, details, visual], index) =>
  ({id: String(index + 1), name, maker, category, price, stock, details, visual,
    ...demoAreas[index % 3]}));

const key = "komsu-sofrasi-v1";
const defaults = () => ({products: structuredClone(seeds), orders: [], cart: {}});
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved?.products) && Array.isArray(saved.orders) && saved.cart) {
      for (const product of saved.products) {
        if ("district" in product) continue;
        const seed = seeds.find(item => item.id === product.id);
        if (seed) {
          product.district = seed.district;
          product.neighborhood = seed.neighborhood;
          product.point = seed.point;
        }
      }
      return saved;
    }
  } catch {}
  return defaults();
}
let state = load();
const sessionKey = "komsu-sofrasi-account";
function readAccount() {
  try {
    return accounts.find(account => account.id === sessionStorage.getItem(sessionKey)) ?? null;
  } catch {
    return null;
  }
}
let activeAccount = readAccount();
let returnToCart = false;
let category = "";
let nearbyPoint = null;
let productPoint = null;
let productPhoto = "";
let editorSession = 0;
let photoRequest = 0;
const photoPattern = /^data:image\/jpeg;base64,[a-zA-Z0-9+/]+=*$/;
let toastTimeout;
const formatMoney = new Intl.NumberFormat("tr-TR", {style: "currency", currency: "TRY"});
const money = cents => formatMoney.format(cents / 100);
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const findProduct = id => state.products.find(product => product.id === id);
const cartEntries = () => Object.entries(state.cart).flatMap(([id, qty]) => {
  const product = findProduct(id);
  return product && qty > 0 ? [{product, qty}] : [];
});
const unitPrice = product => Math.round(product.price * 100);
const orderTotal = entries => entries.reduce((sum, {product, qty}) => sum + unitPrice(product) * qty, 0);
const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

function notify(message) {
  clearTimeout(toastTimeout);
  byId("toast").textContent = message;
  toastTimeout = setTimeout(() => byId("toast").textContent = "", 3200);
}

function update(next, message) {
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    notify("Tarayıcı veriyi kaydedemedi. Depolama doluysa ürün fotoğrafını kaldırıp tekrar dene.");
    return false;
  }
  state = next;
  render();
  if (message) notify(message);
  return true;
}

function normalize(value) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i");
}

function distanceKm(first, second) {
  const radians = value => value * Math.PI / 180;
  const lat = radians(second.lat - first.lat);
  const lng = radians(second.lng - first.lng);
  const a = Math.sin(lat / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function renderCatalog() {
  const query = normalize(byId("search").value);
  const area = normalize(byId("area-search").value);
  const radius = Number(byId("radius").value);
  const products = state.products.filter(p => {
    const location = normalize([p.district, p.neighborhood].filter(Boolean).join(" "));
    return (!category || p.category === category) && location.includes(area) &&
      normalize(p.name + " " + p.maker).includes(query);
  }).map(p => ({...p, km: nearbyPoint && p.point ? distanceKm(nearbyPoint, p.point) : null}));
  const matches = nearbyPoint
    ? products.filter(p => p.km !== null && p.km <= radius).sort((a, b) => a.km - b.km)
    : products;
  byId("filters").innerHTML = ["", ...categories].map(label =>
    `<button data-category="${escape(label)}" aria-pressed="${label === category}">${label || "Tümü"}</button>`).join("");
  byId("results").textContent = matches.length ? `${matches.length} ürün` :
    nearbyPoint ? "Bu mesafede ürün bulunamadı. Mesafeyi artırabilir veya konum filtresini kapatabilirsin." :
    "Aramana uygun ürün bulunamadı.";
  byId("catalog").innerHTML = matches.map(p => {
    const inCart = state.cart[p.id] || 0;
    const label = !p.stock ? "Tükendi" : inCart >= p.stock ? "Stok sınırı" : "+ Sepete ekle";
    const place = [p.neighborhood, p.district].filter(Boolean).join(" · ");
    const distance = p.km === null ? "" : p.km < 0.1 ? "100 m’den yakın" :
      `${p.km.toLocaleString("tr-TR", {maximumFractionDigits:1})} km`;
    const location = [place, distance].filter(Boolean).join(" · ");
    const visual = photoPattern.test(p.photo || "") ? `<img src="${p.photo}" alt="" loading="lazy">` :
      escape(p.visual || icon[p.category]);
    return `<article class="card">
      <div class="food-visual" data-kind="${escape(p.category)}" aria-hidden="true">${visual}</div>
      <div class="card-body"><span class="eyebrow">${escape(p.category)}</span><h3>${escape(p.name)}</h3>
      <span class="muted">${escape(p.maker)} · ${p.stock} adet</span>${location ? `<span class="food-place">⌖ ${escape(location)}</span>` : ""}<p>${escape(p.details)}</p>
      <div class="card-bottom"><strong>${money(unitPrice(p))}</strong><button class="pill" data-add="${p.id}" aria-label="${escape(p.name + " · " + label)}" ${inCart >= p.stock ? "disabled" : ""}>${label}</button></div></div>
    </article>`;
  }).join("");
}

function turkeyNow() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone:"Europe/Istanbul", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23",
  }).formatToParts();
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {date:`${values.year}-${values.month}-${values.day}`, time:`${values.hour}:${values.minute}`};
}

function lastDeliveryDate(today) {
  const date = new Date(today + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

function availableSlots(date, now) {
  if (date < now.date || date > lastDeliveryDate(now.date)) return [];
  return slots.filter(slot => date !== now.date || slot > now.time);
}

function refreshSchedule() {
  const date = byId("delivery-date");
  const slot = byId("delivery-slot");
  const now = turkeyNow();
  date.min = now.date;
  date.max = lastDeliveryDate(now.date);
  if (!date.value || date.value < date.min) {
    const tomorrow = new Date(now.date + "T00:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    date.value = availableSlots(now.date, now).length ? now.date : tomorrow.toISOString().slice(0, 10);
  }
  const previous = slot.value;
  const available = availableSlots(date.value, now);
  slot.innerHTML = available.map(time => `<option value="${time}">${slotLabel(time)}</option>`).join("") ||
    '<option value="">Başka bir tarih seç</option>';
  if (available.includes(previous)) slot.value = previous;
  byId("place-order").disabled = !available.length || cartEntries().some(({product, qty}) => qty > product.stock);
}

function renderCart() {
  const entries = cartEntries();
  byId("count").textContent = entries.reduce((total, item) => total + item.qty, 0);
  const isCustomer = activeAccount?.role === "customer";
  byId("checkout").hidden = !entries.length || !isCustomer;
  byId("cart-signin").hidden = !entries.length || isCustomer;
  if (entries.length && isCustomer) refreshSchedule();
  byId("cart-lines").innerHTML = !entries.length ? '<p class="muted">Sepetin boş. Keşfet ekranından ürün ekleyebilirsin.</p>' : entries.map(({product:p, qty}) =>
    `<div class="inventory-row"><div><b>${escape(p.name)}</b><br><small>${money(unitPrice(p) * qty)}${qty > p.stock ? " · Stok azaldı, adedi düşür" : ""}</small></div>
      <div class="qty"><button data-minus="${p.id}" aria-label="Bir adet çıkar">−</button><span>${qty}</span><button data-add="${p.id}" aria-label="Bir adet ekle" ${qty >= p.stock ? "disabled" : ""}>+</button></div></div>`).join("") +
    `<p><strong>Toplam ${money(orderTotal(entries))}</strong></p>`;
}

function orderStatus(order) {
  return order.status === "Yeni" ? "Onay bekliyor" : order.status;
}

function orderCard(order, seller) {
  const status = orderStatus(order);
  const negative = ["Reddedildi", "İptal"].includes(status);
  const badge = negative ? "status-negative" : status === "Onay bekliyor" ? "status-pending" : "";
  const scheduled = order.deliveryDate && order.deliverySlot
    ? `${scheduleDate.format(new Date(order.deliveryDate + "T00:00:00Z"))} · ${slotLabel(order.deliverySlot)}`
    : "Teslim zamanı belirtilmemiş";
  const payment = order.paymentMethod
    ? negative ? "Tahsilat yok" : status === "Tamamlandı" ? "Nakit ödeme alındı" : "Teslimde nakit ödeme"
    : "Ödeme bilgisi belirtilmemiş";
  const actions = seller
    ? orderActions[status] ?? []
    : status === "Onay bekliyor" ? [{next:"İptal",label:"Talebi iptal et",kind:"pill reject"}] : [];
  return `<article class="order">
    <div class="order-top"><b>${escape(seller ? order.customer : order.maker)} · #${escape(order.id.slice(0, 8))}</b><span class="pill ${badge}">${escape(status)}</span></div>
    <p>${order.items.map(item => `${item.qty} × ${escape(item.name)}`).join(", ")}</p>
    <p class="order-time">${escape(scheduled)}</p>
    <p class="muted">${escape(order.handoff)} · ${money(order.total)} · ${payment}</p>
    ${actions.length ? `<div class="order-actions">${actions.map(({next,label,kind}) => `<button class="${kind}" data-order="${escape(order.id)}" data-next="${next}">${next === "Tamamlandı" && !order.paymentMethod ? "Teslim edildi" : label}</button>`).join("")}</div>` : ""}
  </article>`;
}

function render() {
  renderCatalog();
  renderCart();
  byId("account-button").textContent = activeAccount ? "Hesap değiştir" : "Giriş yap";
  const seller = activeAccount?.role === "seller" ? activeAccount : null;
  byId("seller-name").textContent = seller?.name ?? "";
  byId("inventory").innerHTML = seller ? state.products.filter(p => ownerOf(p) === seller.id).map(p =>
    `<div class="inventory-row"><div><b>${escape(p.name)}</b><br><small>${escape(p.maker)} · ${p.stock} adet · ${money(unitPrice(p))}</small></div><button class="pill" data-edit="${p.id}">Düzenle</button></div>`).join("") : "";
  byId("seller-orders").innerHTML = (seller ? state.orders.filter(o => ownerOf(o) === seller.id).map(o => orderCard(o, true)).join("") : "") ||
    '<p class="muted">Henüz sipariş yok.</p>';
  const customer = activeAccount?.role === "customer" ? activeAccount : null;
  byId("my-orders").innerHTML = customer
    ? state.orders.filter(o => buyerOf(o) === customer.id).map(o => orderCard(o, false)).join("") ||
      '<p class="muted">Verdiğin siparişler burada görünecek.</p>'
    : '<p class="muted">Siparişlerini görmek için müşteri girişi yap.</p><button class="pill" data-login="customer">Müşteri girişi</button>';
}

function changeQuantity(id, delta) {
  const p = findProduct(id);
  if (!p) return;
  const qty = (state.cart[id] || 0) + delta;
  if (qty > p.stock && delta > 0) return;
  const next = structuredClone(state);
  if (qty > 0) next.cart[id] = qty;
  else delete next.cart[id];
  update(next, delta > 0 ? "Sepete eklendi" : "");
}

function renderProductPhoto() {
  byId("photo-row").hidden = !productPhoto;
  const preview = byId("photo-preview");
  if (productPhoto) preview.src = productPhoto;
  else preview.removeAttribute("src");
}

function renderProductPoint() {
  byId("clear-product-location").hidden = !productPoint;
  byId("product-location-status").textContent = productPoint
    ? "Konum eklendi. Müşteriler teslim bölgesini ve yaklaşık mesafeyi görür."
    : "Yakındaki aramalarda çıkmak için teslim noktasında konum ekleyebilirsin.";
}

function openProduct(product) {
  const form = byId("product-form");
  editorSession++;
  form.reset();
  form.elements.id.value = "";
  form.elements.maker.value = activeAccount.name;
  if (product) for (const field of ["id", "name", "maker", "category", "price", "stock", "details", "district", "neighborhood"]) {
    form.elements[field].value = product[field] ?? "";
  }
  productPoint = product?.point ?? null;
  productPhoto = photoPattern.test(product?.photo || "") ? product.photo : "";
  byId("save-product").disabled = false;
  byId("set-product-location").disabled = false;
  byId("clear-product-location").disabled = false;
  byId("photo-status").textContent = "JPG, PNG veya WebP · En fazla 12 MB";
  renderProductPhoto();
  renderProductPoint();
  byId("product-title").textContent = product ? "Ürünü düzenle" : "Ürün ekle";
  byId("product-dialog").showModal();
}

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Tarayıcı konumu desteklemiyor. İlçe veya mahalle kullanabilirsin."));
    navigator.geolocation.getCurrentPosition(
      ({coords}) => resolve({lat:coords.latitude, lng:coords.longitude}),
      error => reject(new Error(error.code === 1
        ? "Konum izni kapalı. Tarayıcı ayarlarından izin verebilir veya ilçe ve mahalleyle arayabilirsin."
        : "Konum alınamadı. Tekrar deneyebilir veya ilçe ve mahalle kullanabilirsin.")),
      {timeout:10000, maximumAge:30000},
    );
  });
}

async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG veya WebP dosyası seç.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("12 MB’tan küçük bir fotoğraf seç.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL("image/jpeg", .68);
    if (!photoPattern.test(photo)) throw new Error();
    return photo;
  } catch {
    throw new Error("Fotoğraf işlenemedi. Başka bir dosya seç.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

byId("categories").innerHTML = categories.map(label => `<option>${label}</option>`).join("");
byId("search").addEventListener("input", renderCatalog);
byId("area-search").addEventListener("input", renderCatalog);
byId("radius").addEventListener("change", renderCatalog);
byId("nearby").addEventListener("click", async event => {
  const button = event.currentTarget;
  const status = byId("location-status");
  if (nearbyPoint) {
    nearbyPoint = null;
    status.textContent = "İlçe veya mahalle yaz ya da cihaz konumunu kullan.";
  } else {
    button.disabled = true;
    status.textContent = "Konum alınıyor…";
    try {
      nearbyPoint = await getDeviceLocation();
      status.textContent = "Konumu olan ürünler en yakından uzağa sıralanıyor.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
  button.setAttribute("aria-pressed", Boolean(nearbyPoint));
  button.textContent = nearbyPoint ? "Konumu kapat" : "Konumumu kullan";
  byId("radius-label").hidden = !nearbyPoint;
  renderCatalog();
});
byId("product-photo").addEventListener("change", async event => {
  const field = event.currentTarget;
  const file = field.files[0];
  if (!file) return;
  const session = editorSession;
  const request = ++photoRequest;
  const status = byId("photo-status");
  byId("save-product").disabled = true;
  status.textContent = "Fotoğraf hazırlanıyor…";
  try {
    const photo = await preparePhoto(file);
    if (session !== editorSession || request !== photoRequest) return;
    productPhoto = photo;
    renderProductPhoto();
    status.textContent = "Fotoğraf hazır.";
  } catch (error) {
    if (session !== editorSession || request !== photoRequest) return;
    status.textContent = error.message;
    field.value = "";
  } finally {
    if (session === editorSession && request === photoRequest) byId("save-product").disabled = false;
  }
});
byId("remove-photo").addEventListener("click", () => {
  photoRequest++;
  productPhoto = "";
  byId("product-photo").value = "";
  byId("photo-status").textContent = "Fotoğraf kaldırıldı.";
  byId("save-product").disabled = false;
  renderProductPhoto();
});
byId("set-product-location").addEventListener("click", async event => {
  const button = event.currentTarget;
  const session = editorSession;
  const status = byId("product-location-status");
  button.disabled = true;
  byId("clear-product-location").disabled = true;
  status.textContent = "Konum alınıyor…";
  try {
    const point = await getDeviceLocation();
    if (session !== editorSession) return;
    productPoint = point;
    renderProductPoint();
  } catch (error) {
    if (session === editorSession) status.textContent = error.message;
  } finally {
    if (session === editorSession) {
      button.disabled = false;
      byId("clear-product-location").disabled = false;
    }
  }
});
byId("clear-product-location").addEventListener("click", () => {
  productPoint = null;
  renderProductPoint();
});
function showView(view) {
  for (const section of ["shop", "seller"]) byId(section).hidden = section !== view;
  for (const tab of document.querySelectorAll("nav [data-view]")) {
    if (tab.dataset.view === view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

function openAccount(role, resumeCart = false) {
  returnToCart = resumeCart;
  const available = accounts.filter(account => !role || account.role === role);
  byId("account-title").textContent = role === "seller" ? "Üretici girişi" : role === "customer" ? "Müşteri girişi" : "Demo girişi";
  byId("account-note").textContent = activeAccount
    ? `Şu an ${activeAccount.name} hesabındasın. Geçmek istediğin demo hesabını seç.`
    : "Denemek istediğin hesabı seç.";
  byId("account-options").innerHTML = available.map(account =>
    `<button class="account-option" data-account="${account.id}">${escape(account.name)} <small>${account.role === "seller" ? "Üretici" : "Müşteri"}</small></button>`).join("");
  byId("sign-out").hidden = !activeAccount;
  byId("account-dialog").showModal();
}

function setAccount(account) {
  activeAccount = account;
  try {
    if (account) sessionStorage.setItem(sessionKey, account.id);
    else sessionStorage.removeItem(sessionKey);
  } catch {}
  byId("account-dialog").close();
  showView(account?.role === "seller" ? "seller" : "shop");
  render();
  if (returnToCart && account?.role === "customer") byId("cart-dialog").showModal();
  returnToCart = false;
}

byId("cart-button").addEventListener("click", () => {
  renderCart();
  byId("cart-dialog").showModal();
});
byId("account-button").addEventListener("click", () => openAccount());
byId("sign-out").addEventListener("click", () => setAccount(null));
byId("checkout-login").addEventListener("click", () => {
  byId("cart-dialog").close();
  openAccount("customer", true);
});
byId("delivery-date").addEventListener("change", refreshSchedule);
byId("new-product").addEventListener("click", () => {
  if (activeAccount?.role === "seller") openProduct();
});
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.view === "seller" && activeAccount?.role !== "seller") openAccount("seller");
  else if (data.view) showView(data.view);
  if (data.login) openAccount(data.login);
  if (data.account) {
    const account = accounts.find(item => item.id === data.account);
    if (account) setAccount(account);
  }
  if ("category" in data) {
    category = data.category;
    renderCatalog();
    Array.from(byId("filters").children).find(item => item.dataset.category === category)?.focus();
  }
  if (data.add) changeQuantity(data.add, 1);
  if (data.minus) changeQuantity(data.minus, -1);
  if (data.edit && activeAccount?.role === "seller") {
    const product = findProduct(data.edit);
    if (product && ownerOf(product) === activeAccount.id) openProduct(product);
  }
  if (data.order) changeOrder(data.order, data.next);
  if ("close" in data) button.closest("dialog").close();
});

byId("product-form").addEventListener("submit", event => {
  event.preventDefault();
  if (activeAccount?.role !== "seller") return;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  if (byId("save-product").disabled || byId("set-product-location").disabled) return;
  const name = fields.name.trim();
  const maker = fields.maker.trim();
  const details = fields.details.trim();
  if (!name || !maker || !details) return notify("Ürün adı, üretici ve açıklama alanlarını doldur.");
  const next = structuredClone(state);
  const existing = next.products.find(p => p.id === fields.id);
  if (existing && ownerOf(existing) !== activeAccount.id) return;
  const product = {id: existing?.id ?? uid(), sellerId:activeAccount.id, name, maker, details, category: fields.category,
    district: (fields.district ?? "").trim(), neighborhood: (fields.neighborhood ?? "").trim(),
    point: productPoint, photo: productPhoto, price: Number(fields.price), stock: Number(fields.stock), visual: existing?.category === fields.category ? existing.visual : icon[fields.category]};
  if (existing) Object.assign(existing, product);
  else next.products.unshift(product);
  if (update(next, "Ürün kaydedildi")) byId("product-dialog").close();
});

byId("checkout").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (activeAccount?.role !== "customer") return notify("Müşteri girişi yap.");
  const date = form.elements.date.value;
  const slot = form.elements.slot.value;
  if (!availableSlots(date, turkeyNow()).includes(slot)) {
    refreshSchedule();
    return notify("Geçerli bir teslim tarihi ve saat aralığı seç.");
  }
  const entries = cartEntries();
  if (!entries.length || entries.some(({product, qty}) => qty > product.stock)) return notify("Sepetindeki adetleri kontrol et.");
  const next = structuredClone(state);
  const byMaker = new Map();
  for (const {product, qty} of entries) {
    const group = JSON.stringify([ownerOf(product), product.maker]);
    if (!byMaker.has(group)) byMaker.set(group, []);
    byMaker.get(group).push({product, qty});
    next.products.find(p => p.id === product.id).stock -= qty;
  }
  for (const items of byMaker.values()) {
    const {product} = items[0];
    next.orders.unshift({id: uid(), maker:product.maker, sellerId:ownerOf(product),
      customer:activeAccount.name, customerId:activeAccount.id, handoff:form.elements.handoff.value,
      deliveryDate:date, deliverySlot:slot, paymentMethod:"cash-on-delivery", status:"Onay bekliyor",
      total:orderTotal(items), items:items.map(({product, qty}) => ({id:product.id, name:product.name, qty}))});
  }
  next.cart = {};
  if (update(next, "Sipariş üreticinin onayına gönderildi.")) {
    form.reset();
    byId("cart-dialog").close();
  }
});

function changeOrder(id, nextStatus) {
  if (!activeAccount) return;
  const next = structuredClone(state);
  const order = next.orders.find(o => o.id === id);
  if (!order) return;
  const status = orderStatus(order);
  const allowed = activeAccount.role === "seller"
    ? ownerOf(order) === activeAccount.id && orderActions[status]?.some(action => action.next === nextStatus)
    : buyerOf(order) === activeAccount.id && status === "Onay bekliyor" && nextStatus === "İptal";
  if (!allowed) return;
  order.status = nextStatus;
  if (["Reddedildi", "İptal"].includes(nextStatus)) {
    for (const item of order.items) {
      const p = next.products.find(product => product.id === item.id);
      if (p) p.stock += item.qty;
    }
  }
  update(next, "Sipariş durumu güncellendi");
}

window.addEventListener("storage", event => {
  if (event.key === key || event.key === null) {
    state = load();
    render();
  }
});
if (activeAccount?.role === "seller") showView("seller");
render();
