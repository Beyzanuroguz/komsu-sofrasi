import { availableSlots, categories, closedStatuses, lastDeliveryDate, quantityStep, turkeyNow, unitOf, units, validQuantity } from "./rules.js";

const byId = id => document.getElementById(id);
const icon = {"Ana yemek":"🍲","Hamur işi":"🥟","Tatlı":"🍰","Meze":"🫒"};
const testRole = /^\/test\/(musteri|uretici)\//.exec(window.location.pathname)?.[1] ?? null;
const testBuyer = testRole === "musteri";
const testSeller = testRole === "uretici";
const testPath = testRole ? "/test/" + testRole : "";
const formatQuantity = new Intl.NumberFormat("tr-TR", {maximumFractionDigits:1});
const quantityLabel = (value, item) => `${formatQuantity.format(value)} ${unitOf(item)}`;
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
const cartKey = "komsu-sofrasi-market-cart" + (testRole ? "-" + testRole : "");
const state = {products:[], sellerProducts:[], customerOrders:[], sellerOrders:[], testAvailable:false, account:null, cart:{}};
let cartDraft = {};
let checkoutId = "";
try {
  const saved = JSON.parse(sessionStorage.getItem(cartKey));
  if (saved?.items) cartDraft = saved.items;
  if (typeof saved?.checkoutId === "string") checkoutId = saved.checkoutId;
} catch {}
let shopReady = false;
let currentView = testSeller ? "seller" : "shop";
let resumeCheckout = new URLSearchParams(window.location.search).get("view") === "checkout";
let syncRequest = 0;
let placingOrder = false;
let editorProduct = null;
let category = "";
let nearbyPoint = null;
let productPoint = null;
let productPhoto = "";
let editorSession = 0;
let photoRequest = 0;
const photoPattern = /^data:image\/jpeg;base64,[a-zA-Z0-9+/]+=*$/;
const storedPhoto = /^\/(?:photos\/[a-f0-9-]{36}|test-media\/(?:baklava|manti|sarma))\.jpg$/;
const validPhoto = value => photoPattern.test(value || "") || storedPhoto.test(value || "");
const signIn = (view, label) => `<a class="button" href="/signin-with-chatgpt?return_to=${encodeURIComponent("/?view=" + view)}" target="_top">${label}</a>`;
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
const lineTotal = (product, qty) => Math.round(unitPrice(product) * qty);
const orderTotal = entries => entries.reduce((sum, {product, qty}) => sum + lineTotal(product, qty), 0);


function notify(message) {
  clearTimeout(toastTimeout);
  const dialog = document.querySelector("dialog[open]");
  let notice = dialog?.querySelector(".dialog-notice");
  if (dialog && !notice) {
    notice = document.createElement("p");
    notice.className = "dialog-notice muted";
    notice.setAttribute("role", "status");
    dialog.prepend(notice);
  }
  const target = notice ?? byId("toast");
  target.textContent = message;
  toastTimeout = setTimeout(() => target.textContent = "", 5500);
}

function saveCart() {
  try { sessionStorage.setItem(cartKey, JSON.stringify({items:cartDraft, checkoutId})); } catch {}
}

async function api(path, data) {
  const response = await fetch(testPath + "/api/" + path, data === undefined ? {cache:"no-store"} : {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(response.status === 401 ? "Devam etmek için giriş yap." : "Sunucuya ulaşılamadı."); }
  if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
  return result;
}

async function syncShop() {
  const sequence = ++syncRequest;
  try {
    const data = await api("shop");
    if (sequence !== syncRequest) return;
    const cart = {};
    for (const product of data.products) {
      const line = cartDraft[product.id];
      if (line?.unit === unitOf(product) && validQuantity(line.qty, product) && line.qty > 0 &&
          product.sellerId !== data.account?.kitchen?.id) cart[product.id] = line.qty;
    }
    if (Object.keys(cart).length !== Object.keys(cartDraft).length) {
      for (const id of Object.keys(cartDraft)) if (!cart[id]) delete cartDraft[id];
      checkoutId = "";
      saveCart();
      notify("Birim veya ürün değişti. Sepetini kontrol et.");
    }
    Object.assign(state, data, {cart});
    shopReady = true;
    byId("sync-status").hidden = true;
    render();
    if (resumeCheckout && state.account) {
      resumeCheckout = false;
      openCart();
    }
  } catch (error) {
    if (sequence !== syncRequest) return;
    const status = byId("sync-status");
    status.textContent = error.message;
    status.hidden = false;
  }
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
  const listings = state.products;
  const regions = Array.from(new Set(listings.map(p => [p.district, p.neighborhood].filter(Boolean).join(" ")).filter(Boolean))).sort((a,b) => a.localeCompare(b, "tr"));
  const areaOptions = byId("area-options");
  areaOptions.innerHTML = '<option value="">Bölge seç</option>' + regions.map(region =>
    `<option value="${escape(region)}">${escape(region)}</option>`).join("");
  areaOptions.hidden = !regions.length;
  areaOptions.value = regions.includes(byId("area-search").value) ? byId("area-search").value : "";
  const products = listings.filter(p => {
    const location = normalize([p.district, p.neighborhood].filter(Boolean).join(" "));
    return (!category || p.category === category) && location.includes(area) &&
      normalize(p.name + " " + p.maker).includes(query);
  }).map(p => ({...p, km: nearbyPoint && p.point ? distanceKm(nearbyPoint, p.point) : null}));
  const matches = nearbyPoint
    ? products.filter(p => p.km !== null && p.km <= radius).sort((a, b) => a.km - b.km)
    : products;
  byId("filters").innerHTML = ["", ...categories].map(label =>
    `<button data-category="${escape(label)}" aria-pressed="${label === category}">${label || "Tümü"}</button>`).join("");
  byId("results").textContent = !shopReady ? "Ürünler yükleniyor…" :
    matches.length ? `${matches.length} ürün` : !listings.length ? "Henüz satışta ürün yok." :
    nearbyPoint ? "Bu mesafede ürün bulunamadı. Mesafeyi artırabilir veya konum filtresini kapatabilirsin." :
    "Aramana uygun ürün bulunamadı.";
  byId("catalog").innerHTML = matches.map(p => {
    const inCart = state.cart[p.id] || 0;
    const step = quantityStep(p);
    const available = Math.max(0, p.stock - inCart);
    const unit = unitOf(p);
    const own = p.sellerId === state.account?.kitchen?.id;
    const label = own ? "Senin ürünün" : !p.stock ? "Tükendi" : available < step ? "Stok sınırı" : "+ Sepete ekle";
    const place = [p.neighborhood, p.district].filter(Boolean).join(" · ");
    const distance = p.km === null ? "" : p.km < 0.1 ? "100 m’den yakın" :
      `${p.km.toLocaleString("tr-TR", {maximumFractionDigits:1})} km`;
    const location = [place, distance].filter(Boolean).join(" · ");
    const visual = validPhoto(p.photo) ? `<img src="${p.photo}" alt="" loading="lazy">` :
      escape(p.visual || icon[p.category]);
    return `<article class="card">
      <div class="food-visual" data-kind="${escape(p.category)}" aria-hidden="true">${visual}</div>
      <div class="card-body"><span class="eyebrow">${escape(p.category)}</span><h3>${escape(p.name)}</h3>
      <span class="muted">${escape(p.maker)} · ${quantityLabel(p.stock, p)}</span>${location ? `<span class="food-place">⌖ ${escape(location)}</span>` : ""}<p>${escape(p.details)}</p>
      <div class="card-bottom"><strong>${money(unitPrice(p))} <small class="unit-price">/ ${unit}</small></strong></div>
      <div class="purchase-controls"><label class="purchase-qty">${unit === "adet" ? "Adet" : "Miktar (" + unit + ")"}
        <input type="number" min="${step}" max="${Math.max(step, available)}" step="${step}" value="${available >= 1 ? 1 : step}" data-quantity
          aria-label="${escape(p.name + " miktarı (" + unit + ")")}" ${!own && available >= step ? "" : "disabled"}></label>
        <button class="pill" data-bulk="${p.id}" aria-label="${escape(p.name + " · " + label)}" ${!own && available >= step ? "" : "disabled"}>${label}</button></div></div>
    </article>`;
  }).join("");
  if (shopReady && !listings.length && !testRole) {
    byId("catalog").innerHTML = '<div class="panel empty-catalog"><h3>Yerel mutfaklar burada yer alacak</h3><p class="muted">Ev yapımı ürünlerini satmak için bir mutfak açabilir, ürünlerini hazır olduğunda yayımlayabilirsin.</p><button type="button" class="button" data-view="seller">Üretici paneline git</button></div>';
  }
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
  byId("place-order").disabled = placingOrder || !available.length || cartEntries().some(({product, qty}) => qty > product.stock);
}

function renderCart() {
  const entries = cartEntries();
  byId("count").textContent = entries.reduce((total, item) => total + item.qty, 0);
  const isCustomer = Boolean(state.account);
  byId("checkout").hidden = !entries.length || !isCustomer;
  byId("customer-contact").hidden = Boolean(testRole);
  byId("contact-note").hidden = Boolean(testRole);
  for (const input of byId("customer-contact").querySelectorAll("input")) input.required = !testRole;
  byId("cart-signin").hidden = !entries.length || isCustomer;
  if (entries.length && isCustomer) refreshSchedule();
  byId("cart-lines").innerHTML = !entries.length ? '<p class="muted">Sepetin boş. Keşfet ekranından ürün ekleyebilirsin.</p>' : entries.map(({product:p, qty}) =>
    `<div class="inventory-row"><div><b>${escape(p.name)}</b><br><small>${money(unitPrice(p))} / ${unitOf(p)} · ${money(lineTotal(p, qty))}${qty > p.stock ? " · Stok azaldı, miktarı düşür" : ""}</small></div>
      <div class="qty"><button data-minus="${p.id}" aria-label="${quantityLabel(quantityStep(p), p)} çıkar">−</button><span>${quantityLabel(qty, p)}</span><button data-add="${p.id}" aria-label="${quantityLabel(quantityStep(p), p)} ekle" ${qty + quantityStep(p) > p.stock ? "disabled" : ""}>+</button></div></div>`).join("") +
    `<p><strong>Toplam ${money(orderTotal(entries))}</strong></p>`;
}

function orderCard(order, seller) {
  const status = order.status;
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
    <p>${order.items.map(item => `${quantityLabel(item.qty, item)} · ${escape(item.name)}`).join(", ")}</p>
    <p class="order-time">${escape(scheduled)}</p>
    ${order.contact ? `<p class="muted">Müşteri telefonu: ${escape(order.contact)}</p>` : ""}
    ${order.address ? `<p class="muted">Teslimat adresi: ${escape(order.address)}</p>` : ""}
    ${order.pickupNote ? `<p class="muted">Elden teslim: ${escape(order.pickupNote)}</p>` : ""}
    <p class="muted">${escape(order.handoff)} · ${money(order.total)} · ${payment}</p>
    ${status === "Onay bekliyor" ? `<p class="muted">${seller ? "Teslim zamanı uygunsa talebi onayla." : "Üreticinin teslim zamanını onaylaması bekleniyor."}</p>` : ""}
    ${actions.length ? `<div class="order-actions">${actions.map(({next,label,kind}) => `<button class="${kind}" data-order="${escape(order.id)}" data-next="${next}">${next === "Tamamlandı" && !order.paymentMethod ? "Teslim edildi" : label}</button>`).join("")}</div>` : ""}
  </article>`;
}

function renderSellerOrders() {
  const orders = state.sellerOrders;
  const pending = orders.filter(order => order.status === "Onay bekliyor");
  const other = orders.filter(order => order.status !== "Onay bekliyor");
  byId("seller-orders").innerHTML = `
    <section class="pending-orders" aria-labelledby="pending-title">
      <div class="pending-heading"><h3 id="pending-title">Onay bekleyenler</h3><span class="pill status-pending">${pending.length}</span></div>
      ${pending.map(order => orderCard(order, true)).join("") || '<p class="muted">Onay bekleyen sipariş yok.</p>'}
    </section>
    ${other.length ? `<section class="other-orders" aria-labelledby="other-orders-title"><h3 id="other-orders-title">Diğer siparişler</h3>
      ${other.map(order => orderCard(order, true)).join("")}</section>` : ""}`;
}

function render() {
  renderCatalog();
  renderCart();
  const account = state.account;
  const kitchen = account?.kitchen;
  renderView();
  byId("test-signin").hidden = !testRole || Boolean(account);
  byId("test-banner").hidden = !testRole || !account;
  byId("test-account-label").textContent = testBuyer ? "Müşteri test hesabı" : "Üretici test hesabı";
  byId("test-attribution").hidden = !testRole;
  byId("test-link").hidden = !state.testAvailable;
  byId("join-seller").hidden = Boolean(testRole);
  byId("test-link").textContent = testBuyer ? "Üretici testine geç" : testSeller ? "Müşteri testine geç" : "Test alanı";
  byId("test-link").href = testBuyer ? "/test/uretici/" : "/test/musteri/";
  byId("shop-nav").hidden = testSeller || Boolean(testRole && !account);
  byId("seller-nav").hidden = testBuyer || Boolean(testRole && !account);
  byId("customer-nav").hidden = testSeller || Boolean(testRole && !account);
  byId("cart-button").hidden = testSeller || Boolean(testRole && !account);
  byId("account-button").hidden = Boolean(testRole);
  byId("account-button").textContent = account ? "Hesabım" : "Giriş yap";
  byId("customer-nav").textContent = account ? "Siparişlerim" : "Müşteri girişi";
  byId("seller-name").textContent = kitchen?.name ?? "Üretici hesabı";
  byId("seller-account").innerHTML = shopReady && !account ? `<div class="account-gate">Mutfağını açmak için giriş yap. ${signIn("seller", "Üretici girişi")}</div>` : "";
  byId("kitchen-form").hidden = !account || Boolean(kitchen);
  byId("seller-workspace").hidden = !kitchen;
  byId("new-product").hidden = !kitchen;
  byId("inventory").innerHTML = kitchen ? state.sellerProducts.map(p =>
    `<div class="inventory-row seller-listing"><div><b>${escape(p.name)}</b><br><small>${quantityLabel(p.stock, p)} stok · ${money(unitPrice(p))} / ${unitOf(p)}</small>
    <small class="listing-status ${p.active ? "listing-active" : ""}">${p.active ? "Satışta" : "Satışa kapalı"}</small></div>
    <div class="listing-actions"><button class="pill" data-edit="${p.id}">Düzenle</button>
    <button class="pill" data-visibility="${p.id}" data-active="${!p.active}">${p.active ? "Satışı durdur" : "Satışa aç"}</button></div></div>`).join("") || '<p class="muted">Menünde henüz ürün yok.</p>' : "";
  renderSellerOrders();
  byId("orders-account").innerHTML = shopReady && !account ? `<div class="account-gate">Sipariş vermek ve geçmiş siparişlerini görmek için giriş yap. ${signIn("orders", "Müşteri girişi")}</div>` : "";
  byId("order-history").hidden = !account;
  byId("my-orders").innerHTML = state.customerOrders.filter(order => !closedStatuses.includes(order.status))
    .map(order => orderCard(order, false)).join("") || '<p class="muted">Aktif siparişin yok.</p>';
  byId("past-orders").innerHTML = state.customerOrders.filter(order => closedStatuses.includes(order.status))
    .map(order => orderCard(order, false)).join("") || '<p class="muted">Henüz geçmiş siparişin yok.</p>';
}

function changeQuantity(id, delta) {
  if (placingOrder) return;
  const p = findProduct(id);
  if (!p || p.sellerId === state.account?.kitchen?.id || !validQuantity(delta, p) || delta === 0) return;
  const qty = (state.cart[id] || 0) + delta;
  if (qty > p.stock && delta > 0) return notify("Sepete eklenebilecek en fazla miktar " + quantityLabel(Math.max(0, p.stock - (state.cart[id] || 0)), p) + ".");
  if (qty > 0) {
    state.cart[id] = qty;
    cartDraft[id] = {qty, unit:unitOf(p)};
  } else {
    delete state.cart[id];
    delete cartDraft[id];
  }
  checkoutId = "";
  saveCart();
  render();
  if (delta > 0) notify(`${quantityLabel(delta, p)} sepete eklendi`);
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
    ? "Konum eklendi. Ürün kartında yaklaşık mesafe gösterilir."
    : "Yakındaki aramalarda çıkmak için teslim noktasında konum ekleyebilirsin.";
}

function renderUnit() {
  const select = byId("product-unit");
  byId("product-stock").step = quantityStep({unit:select.value});
  byId("stock-unit").textContent = select.value;
  byId("price-unit").textContent = select.value;
  byId("unit-note").textContent = select.disabled ? "Onay bekleyen sipariş varken satış birimi sabit kalır." :
    "Fiyat ve stok seçilen birim içindir.";
}

function openProduct(product) {
  const form = byId("product-form");
  editorSession++;
  form.reset();
  form.elements.id.value = "";
  editorProduct = product ?? null;
  byId("product-seller").textContent = state.account.kitchen.name;
  if (product) for (const field of ["id", "name", "category", "price", "stock", "details", "district", "neighborhood"]) {
    form.elements[field].value = product[field] ?? "";
  }
  byId("product-unit").value = unitOf(product ?? {});
  byId("product-unit").disabled = Boolean(product && state.sellerOrders.some(order => order.status === "Onay bekliyor" &&
    order.items.some(item => item.id === product.id)));
  renderUnit();
  productPoint = product?.point ?? null;
  productPhoto = validPhoto(product?.photo) ? product.photo : "";
  byId("save-product").disabled = false;
  byId("set-product-location").disabled = false;
  byId("clear-product-location").disabled = false;
  byId("photo-status").textContent = "JPG, PNG veya WebP · En fazla 12 MB";
  renderProductPhoto();
  renderProductPoint();
  byId("product-title").textContent = product ? "Ürünü düzenle" : "Ürün ekle";
  byId("draft-note").hidden = Boolean(product);
  byId("product-dialog").showModal();
}

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    const policy = document.permissionsPolicy ?? document.featurePolicy;
    if (policy && !policy.allowsFeature("geolocation")) {
      return reject(new Error("Bu görünüm konum erişimine izin vermiyor. Bağlantıyı cihazının tarayıcısında aç veya ilçe ve mahalleyle ara."));
    }
    if (globalThis.isSecureContext === false || !navigator.geolocation) {
      return reject(new Error("Cihaz konumu burada kullanılamıyor. İlçe ve mahalleyle arayabilirsin."));
    }
    navigator.geolocation.getCurrentPosition(
      ({coords}) => resolve({lat:coords.latitude, lng:coords.longitude}),
      error => reject(new Error(error.code === 1
        ? "Konum izni verilmedi. Tarayıcı ve cihaz ayarlarında konuma izin ver veya ilçe ve mahalleyle ara."
        : error.code === 3 ? "Cihaz konumu zamanında alınamadı. Bölge seç menüsüyle devam edebilirsin."
        : "Cihaz konumu alınamadı. Konum servislerini kontrol et veya ilçe ve mahalleyle ara.")),
      {timeout:20000, maximumAge:600000, enableHighAccuracy:false},
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
byId("area-options").addEventListener("change", event => {
  byId("area-search").value = event.currentTarget.value;
  if (nearbyPoint) setNearby(null, initialLocationText);
  else renderCatalog();
});
byId("radius").addEventListener("change", renderCatalog);
const initialLocationText = "İlçe veya mahalle yaz ya da mesafe hesabı için konum seç.";
function setNearby(point, message) {
  nearbyPoint = point;
  const button = byId("nearby");
  button.setAttribute("aria-pressed", Boolean(point));
  button.textContent = point ? "Cihaz konumunu kapat" : "Konumumu kullan";
  byId("radius-label").hidden = !point;
  byId("location-status").textContent = message;
  renderCatalog();
}

byId("product-unit").innerHTML = units.map(unit => `<option>${unit}</option>`).join("");
byId("product-unit").addEventListener("change", renderUnit);
byId("nearby").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (nearbyPoint) {
    setNearby(null, initialLocationText);
    return;
  }
  button.disabled = true;
  byId("location-status").textContent = "Cihaz konumu alınıyor…";
  try {
    setNearby(await getDeviceLocation(), "Cihaz konumuna göre en yakındaki ürünler gösteriliyor.");
  } catch (error) {
    byId("location-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
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
function renderView() {
  for (const section of ["shop", "orders", "seller"]) {
    byId(section).hidden = section !== currentView || Boolean(testRole && !state.account);
  }
  for (const tab of document.querySelectorAll("nav [data-view]")) {
    if (tab.dataset.view === currentView) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

function showView(view) {
  if ((testBuyer && view === "seller") || (testSeller && view !== "seller")) return;
  currentView = view;
  renderView();
  window.scrollTo(0, 0);
  if (view !== "shop") void syncShop();
}

function openAccount() {
  const account = state.account;
  byId("account-note").textContent = account?.name ?? "Sipariş vermek veya mutfağını açmak için giriş yap.";
  byId("account-options").innerHTML = account
    ? '<button class="account-option" data-view="orders">Siparişlerim</button><button class="account-option" data-view="seller">Üretici paneli</button><a class="account-option" href="/signout-with-chatgpt?return_to=%2F" target="_top">Oturumu kapat</a>'
    : signIn("orders", "Müşteri girişi") + signIn("seller", "Üretici girişi");
  byId("account-dialog").showModal();
}

function renderHandoff() {
  const delivery = !testRole && byId("handoff").value === "Teslimat talebi";
  byId("delivery-address-label").hidden = !delivery;
  byId("delivery-address").required = delivery;
}

function openCart() {
  if (testRole && (!state.account || testSeller)) return;
  if (!byId("customer-name").value) byId("customer-name").value = state.account?.name ?? "";
  renderHandoff();
  renderCart();
  if (!byId("cart-dialog").open) byId("cart-dialog").showModal();
}
byId("cart-button").addEventListener("click", openCart);
byId("test-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!testRole) return;
  const button = byId("test-submit");
  if (button.disabled) return;
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  const message = byId("test-error");
  message.hidden = true;
  button.disabled = true;
  try {
    await api("login", fields);
    await syncShop();
    if (!state.account) throw new Error("Oturum açılamadı. Bağlantıyı cihazının tarayıcısında açıp tekrar dene.");
    form.reset();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
});
byId("test-logout").addEventListener("click", async () => {
  try {
    await api("logout", {});
    currentView = testSeller ? "seller" : "shop";
    await syncShop();
  } catch (error) { notify(error.message); }
});
byId("account-button").addEventListener("click", openAccount);
byId("delivery-date").addEventListener("change", refreshSchedule);
byId("handoff").addEventListener("change", renderHandoff);
byId("new-product").addEventListener("click", () => {
  if (state.account?.kitchen) openProduct();
});
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.view) {
    button.closest("dialog")?.close();
    showView(data.view);
  }
  if ("category" in data) {
    category = data.category;
    renderCatalog();
    Array.from(byId("filters").children).find(item => item.dataset.category === category)?.focus();
  }
  if (data.bulk) {
    const input = button.closest(".card").querySelector("[data-quantity]");
    const quantity = input.valueAsNumber;
    if (input.reportValidity() && Number.isFinite(quantity) && quantity > 0) changeQuantity(data.bulk, quantity);
    else if (!input.value) input.focus();
  }
  if (data.add) changeQuantity(data.add, quantityStep(findProduct(data.add) ?? {}));
  if (data.minus) changeQuantity(data.minus, -quantityStep(findProduct(data.minus) ?? {}));
  if (data.edit && state.account?.kitchen) {
    const product = state.sellerProducts.find(item => item.id === data.edit);
    if (product?.sellerId === state.account.kitchen.id) openProduct(product);
  }
  if (data.visibility) void changeVisibility(button);
  if (data.order) void changeOrder(button);
  if ("close" in data) button.closest("dialog").close();
});

byId("kitchen-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = byId("create-kitchen");
  if (button.disabled) return;
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    await api("kitchen", fields);
    await syncShop();
    notify("Mutfağın açıldı. İlk ürününü ekleyebilirsin.");
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
});

byId("product-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = byId("save-product");
  if (!state.account?.kitchen || button.disabled || byId("set-product-location").disabled) return;
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const previous = editorProduct;
  const unit = fields.unit ?? unitOf(previous ?? {});
  const body = {...fields, unit, price:Number(fields.price), stock:Number(fields.stock),
    originalStock:previous?.stock, revision:previous?.revision, point:productPoint, photo:productPhoto};
  button.disabled = true;
  try {
    await api("product", body);
    byId("product-dialog").close();
    await syncShop();
    notify(previous ? "Ürün kaydedildi." : "Ürün taslak olarak kaydedildi. Menüm bölümünden satışa açabilirsin.");
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
});

byId("checkout").addEventListener("submit", async event => {
  event.preventDefault();
  if (placingOrder || !state.account) return;
  const form = event.currentTarget;
  const fields = Object.fromEntries(new FormData(form));
  if (!availableSlots(fields.date).includes(fields.slot)) {
    refreshSchedule();
    return notify("Geçerli bir teslim tarihi ve saat aralığı seç.");
  }
  const entries = cartEntries();
  if (!entries.length || entries.some(({product, qty}) => qty > product.stock)) return notify("Sepetindeki miktarları kontrol et.");
  checkoutId ||= crypto.randomUUID();
  saveCart();
  placingOrder = true;
  refreshSchedule();
  try {
    await api("order", {...fields, requestId:checkoutId, deliveryDate:fields.date, deliverySlot:fields.slot,
      items:entries.map(({product, qty}) => ({id:product.id, revision:product.revision, qty}))});
    state.cart = {};
    cartDraft = {};
    checkoutId = "";
    saveCart();
    form.reset();
    byId("cart-dialog").close();
    showView("orders");
    notify("Sipariş üreticinin onayına gönderildi.");
  } catch (error) {
    await syncShop();
    notify(error.message);
  } finally {
    placingOrder = false;
    renderCart();
  }
});

async function changeVisibility(button) {
  if (button.disabled) return;
  const active = button.dataset.active === "true";
  button.disabled = true;
  try {
    await api("product-visibility", {id:button.dataset.visibility, active});
    await syncShop();
    notify(active ? "Ürün satışa açıldı." : "Ürün satışa kapatıldı.");
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
}

async function changeOrder(button) {
  if (button.disabled) return;
  const card = button.closest(".order");
  const actions = Array.from(card.querySelectorAll("button"));
  actions.forEach(action => { action.disabled = true; });
  try {
    await api("order-status", {id:button.dataset.order, status:button.dataset.next});
    await syncShop();
    notify("Sipariş durumu güncellendi.");
  } catch (error) {
    await syncShop();
    notify(error.message);
  } finally {
    actions.forEach(action => { action.disabled = false; });
  }
}

window.addEventListener("focus", () => { if (!document.querySelector("dialog[open]")) void syncShop(); });
setInterval(() => {
  if (!document.hidden && currentView !== "shop" && !document.querySelector("dialog[open]")) void syncShop();
}, 30000);
render();
const requestedView = new URLSearchParams(window.location.search).get("view");
if (testRole) {
  document.documentElement.dataset.testRole = testRole;
  byId("test-title").textContent = testBuyer ? "Müşteri girişi" : "Üretici girişi";
  byId("test-description").textContent = testBuyer
    ? "Fotoğraflı menüyü keşfet, sepete ürün ekle ve test siparişini takip et."
    : "Gelen test siparişlerini onayla, hazırlık ve teslim adımlarını dene.";
  void syncShop();
} else if (["orders", "seller"].includes(requestedView)) showView(requestedView);
else void syncShop();
