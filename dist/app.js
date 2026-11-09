"use strict";

const byId = id => document.getElementById(id);
const categories = ["Ana yemek", "Hamur işi", "Tatlı", "Meze"];
const icon = {"Ana yemek":"🍲","Hamur işi":"🥟","Tatlı":"🍰","Meze":"🫒"};
const statuses = ["Yeni", "Hazırlanıyor", "Teslime hazır", "Tamamlandı", "İptal"];
const seeds = [
  ["Kayseri mantısı", "Ayşe'nin Mutfağı", "Ana yemek", 230, 12, "Yoğurt ve biber sosuyla, 1 porsiyon. Gluten ve süt içerir.", "🥣"],
  ["Ispanaklı kol böreği", "Zeynep'in Fırını", "Hamur işi", 180, 8, "El açması, 4 dilim. Gluten, süt ve yumurta içerir.", "🥟"],
  ["Fıstıklı ev baklavası", "Fatma'nın Tatlıları", "Tatlı", 260, 10, "İnce yufka ve Antep fıstığı, 6 dilim. Gluten, süt ve fıstık içerir.", "🍯"],
  ["Zeytinyağlı yaprak sarma", "Ayşe'nin Mutfağı", "Meze", 195, 9, "Limonlu ve bol yeşillikli, 12 adet.", "🫒"],
  ["Fırın sütlaç", "Fatma'nın Tatlıları", "Tatlı", 95, 16, "Üzeri kızarmış, 1 kâse. Süt içerir.", "🍮"],
  ["Ev usulü kuru fasulye", "Zeynep'in Fırını", "Ana yemek", 165, 8, "Pilavla servis edilir, 1 porsiyon.", "🍛"],
].map(([name, maker, category, price, stock, details, visual], index) =>
  ({id: String(index + 1), name, maker, category, price, stock, details, visual}));

const key = "komsu-sofrasi-v1";
const defaults = () => ({products: structuredClone(seeds), orders: [], cart: {}});
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved?.products) && Array.isArray(saved.orders) && saved.cart) return saved;
  } catch {}
  return defaults();
}
let state = load();
let category = "";
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
    notify("Tarayıcı veriyi kaydedemedi. Depolama ayarlarını kontrol et.");
    return false;
  }
  state = next;
  render();
  if (message) notify(message);
  return true;
}

function renderCatalog() {
  const query = byId("search").value.trim().toLocaleLowerCase("tr-TR");
  const products = state.products.filter(p =>
    (!category || p.category === category) &&
    (p.name + " " + p.maker).toLocaleLowerCase("tr-TR").includes(query));
  byId("filters").innerHTML = ["", ...categories].map(label =>
    `<button data-category="${escape(label)}" aria-pressed="${label === category}">${label || "Tümü"}</button>`).join("");
  byId("results").textContent = products.length ? `${products.length} ürün` : "Aramana uygun ürün bulunamadı.";
  byId("catalog").innerHTML = products.map(p => {
    const inCart = state.cart[p.id] || 0;
    const label = !p.stock ? "Tükendi" : inCart >= p.stock ? "Stok sınırı" : "+ Sepete ekle";
    return `<article class="card">
      <div class="food-visual" data-kind="${escape(p.category)}" aria-hidden="true">${escape(p.visual || icon[p.category])}</div>
      <div class="card-body"><span class="eyebrow">${escape(p.category)}</span><h3>${escape(p.name)}</h3>
      <span class="muted">${escape(p.maker)} · ${p.stock} adet</span><p>${escape(p.details)}</p>
      <div class="card-bottom"><strong>${money(unitPrice(p))}</strong><button class="pill" data-add="${p.id}" aria-label="${escape(p.name + " · " + label)}" ${inCart >= p.stock ? "disabled" : ""}>${label}</button></div></div>
    </article>`;
  }).join("");
}

function renderCart() {
  const entries = cartEntries();
  byId("count").textContent = entries.reduce((total, item) => total + item.qty, 0);
  byId("checkout").hidden = !entries.length;
  byId("checkout").querySelector("button").disabled = entries.some(({product, qty}) => qty > product.stock);
  byId("cart-lines").innerHTML = !entries.length ? '<p class="muted">Sepetin boş. Keşfet ekranından ürün ekleyebilirsin.</p>' : entries.map(({product:p, qty}) =>
    `<div class="inventory-row"><div><b>${escape(p.name)}</b><br><small>${money(unitPrice(p) * qty)}${qty > p.stock ? " · Stok azaldı, adedi düşür" : ""}</small></div>
      <div class="qty"><button data-minus="${p.id}" aria-label="Bir adet çıkar">−</button><span>${qty}</span><button data-add="${p.id}" aria-label="Bir adet ekle" ${qty >= p.stock ? "disabled" : ""}>+</button></div></div>`).join("") +
    `<p><strong>Toplam ${money(orderTotal(entries))}</strong></p>`;
}

function orderCard(order, seller) {
  return `<article class="order"><div class="order-top"><b>${escape(seller ? order.customer : order.maker)} · #${escape(order.id.slice(0, 8))}</b><span class="pill">${escape(order.status)}</span></div>
    <p>${order.items.map(item => `${item.qty} × ${escape(item.name)}`).join(", ")}</p>
    <p class="muted">${escape(order.handoff)} · ${money(order.total)}${seller ? " · " + escape(order.maker) : ""}</p>
    ${seller ? `<label class="muted">Durum <select data-order="${order.id}" ${["Tamamlandı","İptal"].includes(order.status) ? "disabled" : ""}>
    ${statuses.map(status => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select></label>` : ""}</article>`;
}

function render() {
  renderCatalog();
  renderCart();
  byId("inventory").innerHTML = state.products.map(p => `<div class="inventory-row"><div><b>${escape(p.name)}</b><br><small>${escape(p.maker)} · ${p.stock} adet · ${money(unitPrice(p))}</small></div><button class="pill" data-edit="${p.id}">Düzenle</button></div>`).join("");
  byId("seller-orders").innerHTML = state.orders.map(o => orderCard(o, true)).join("") || '<p class="muted">Henüz sipariş yok.</p>';
  byId("my-orders").innerHTML = state.orders.map(o => orderCard(o, false)).join("") || '<p class="muted">Verdiğin siparişler burada görünecek.</p>';
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

function openProduct(product) {
  const form = byId("product-form");
  form.reset();
  form.elements.id.value = "";
  if (product) for (const field of ["id", "name", "maker", "category", "price", "stock", "details"]) {
    form.elements[field].value = product[field];
  }
  byId("product-title").textContent = product ? "Ürünü düzenle" : "Ürün ekle";
  byId("product-dialog").showModal();
}

byId("categories").innerHTML = categories.map(label => `<option>${label}</option>`).join("");
byId("search").addEventListener("input", renderCatalog);
byId("cart-button").addEventListener("click", () => byId("cart-dialog").showModal());
byId("new-product").addEventListener("click", () => openProduct());
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.view) {
    for (const view of ["shop", "seller"]) byId(view).hidden = view !== data.view;
    for (const tab of document.querySelectorAll("nav [data-view]")) {
      if (tab.dataset.view === data.view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
  }
  if ("category" in data) {
    category = data.category;
    renderCatalog();
    Array.from(byId("filters").children).find(item => item.dataset.category === category)?.focus();
  }
  if (data.add) changeQuantity(data.add, 1);
  if (data.minus) changeQuantity(data.minus, -1);
  if (data.edit) openProduct(findProduct(data.edit));
  if ("close" in data) button.closest("dialog").close();
});

byId("product-form").addEventListener("submit", event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  const name = fields.name.trim();
  const maker = fields.maker.trim();
  const details = fields.details.trim();
  if (!name || !maker || !details) return notify("Ürün adı, üretici ve açıklama alanlarını doldur.");
  const next = structuredClone(state);
  const existing = next.products.find(p => p.id === fields.id);
  const product = {id: existing?.id ?? uid(), name, maker, details, category: fields.category,
    price: Number(fields.price), stock: Number(fields.stock), visual: existing?.category === fields.category ? existing.visual : icon[fields.category]};
  if (existing) Object.assign(existing, product);
  else next.products.unshift(product);
  if (update(next, "Ürün kaydedildi")) byId("product-dialog").close();
});

byId("checkout").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const customer = form.elements.customer.value.trim();
  const entries = cartEntries();
  if (!customer) return notify("Adını gir.");
  if (!entries.length || entries.some(({product, qty}) => qty > product.stock)) return notify("Sepetindeki adetleri kontrol et.");
  const next = structuredClone(state);
  const byMaker = new Map();
  for (const {product, qty} of entries) {
    if (!byMaker.has(product.maker)) byMaker.set(product.maker, []);
    byMaker.get(product.maker).push({product, qty});
    next.products.find(p => p.id === product.id).stock -= qty;
  }
  for (const [maker, items] of byMaker) {
    next.orders.unshift({id: uid(), maker, customer, handoff: form.elements.handoff.value,
      status:"Yeni", total:orderTotal(items), items:items.map(({product, qty}) => ({id:product.id, name:product.name, qty}))});
  }
  next.cart = {};
  if (update(next, "Sipariş oluşturuldu. Siparişlerim bölümünden takip edebilirsin.")) {
    form.reset();
    byId("cart-dialog").close();
  }
});

byId("seller-orders").addEventListener("change", event => {
  const select = event.target.closest("select[data-order]");
  if (!select || !statuses.includes(select.value)) return;
  const next = structuredClone(state);
  const order = next.orders.find(o => o.id === select.dataset.order);
  if (!order || ["İptal","Tamamlandı"].includes(order.status)) return;
  order.status = select.value;
  if (order.status === "İptal") {
    for (const item of order.items) {
      const p = next.products.find(product => product.id === item.id);
      if (p) p.stock += item.qty;
    }
  }
  if (!update(next, "Sipariş durumu güncellendi")) render();
});

window.addEventListener("storage", event => {
  if (event.key === key || event.key === null) {
    state = load();
    render();
  }
});
render();
